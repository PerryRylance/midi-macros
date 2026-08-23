import { describe, expect, it, vi } from "vitest";
import { evaluateProgram, ProgramEvaluationError } from "../src/programEvaluator";

function createFakeContainer(options: { exitCode?: number; output?: string; midiBytes?: Uint8Array } = {}) {
    const { exitCode = 0, output = "", midiBytes = new Uint8Array([1, 2, 3]) } = options;

    const writeFile = vi.fn().mockResolvedValue(undefined);
    const readFile = vi.fn().mockResolvedValue(midiBytes);
    const spawn = vi.fn().mockResolvedValue({
        output: new ReadableStream<string>({
            start(controller) {
                if (output) controller.enqueue(output);
                controller.close();
            }
        }),
        exit: Promise.resolve(exitCode)
    });

    const container = { fs: { writeFile, readFile }, spawn } as any;

    return { container, writeFile, readFile, spawn };
}

describe("evaluateProgram", () => {
    it("writes the program source to the container before running it", async () => {
        const { container, writeFile } = createFakeContainer();

        await evaluateProgram(container, "export default 1;");

        expect(writeFile).toHaveBeenCalledWith("program.ts", "export default 1;");
    });

    it("spawns node against a runner script written to the container", async () => {
        const { container, writeFile, spawn } = createFakeContainer();

        await evaluateProgram(container, "export default 1;");

        const [runnerPath, runnerScript] = writeFile.mock.calls.find(call => call[0] === "run-program.cjs")!;
        expect(spawn).toHaveBeenCalledWith("node", [runnerPath]);
        expect(runnerScript).toContain("toArrayBuffer");
    });

    it("writes an entry file that type-checks the program's default export against File", async () => {
        const { container, writeFile } = createFakeContainer();

        await evaluateProgram(container, "export default 1;");

        const [, entryScript] = writeFile.mock.calls.find(call => call[0] === "entry.ts")!;
        expect(entryScript).toContain('from "./program"');
        expect(entryScript).toContain('from "@perry-rylance/midi"');
    });

    it("relies on a real TypeScript diagnostic (not an AST check of its own) to catch a missing default export", async () => {
        const { container, writeFile } = createFakeContainer();

        await evaluateProgram(container, "export default 1;");

        const [, runnerScript] = writeFile.mock.calls.find(call => call[0] === "run-program.cjs")!;
        expect(runnerScript).toContain("getSemanticDiagnostics");
        expect(runnerScript).toContain("No default export.");
    });

    it("resolves with the bytes read back from output.mid on success", async () => {
        const midiBytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64]);
        const { container, readFile } = createFakeContainer({ midiBytes });

        const result = await evaluateProgram(container, "export default 1;");

        expect(readFile).toHaveBeenCalledWith("output.mid");
        expect(new Uint8Array(result)).toEqual(midiBytes);
    });

    it("throws a ProgramEvaluationError with the collected output when the process exits non-zero", async () => {
        const { container } = createFakeContainer({
            exitCode: 1,
            output: "TSError: Default export is not a MIDI File instance."
        });

        await expect(evaluateProgram(container, "export default 1;")).rejects.toThrow(ProgramEvaluationError);
    });

    it("includes the collected process output in the thrown error message", async () => {
        const { container } = createFakeContainer({
            exitCode: 1,
            output: "TSError: Default export is not a MIDI File instance."
        });

        await expect(evaluateProgram(container, "export default 1;")).rejects.toThrow(
            /Default export is not a MIDI File instance/
        );
    });

    it("falls back to a generic message when a failing process produced no output", async () => {
        const { container } = createFakeContainer({ exitCode: 1, output: "" });

        await expect(evaluateProgram(container, "export default 1;")).rejects.toThrow(/exited with code 1/);
    });
});
