import { describe, expect, it, vi } from "vitest";
import { evaluatePerformance, PerformanceEvaluationError } from "../src/performanceEvaluator";

function createFakeContainer(
    options: { exitCode?: number; output?: string; midiBytes?: Uint8Array; timeline?: unknown[] } = {}
) {
    const {
        exitCode = 0,
        output = "",
        midiBytes = new Uint8Array([1, 2, 3]),
        timeline = []
    } = options;

    const writeFile = vi.fn().mockResolvedValue(undefined);
    const readFile = vi.fn().mockImplementation((path: string) => {
        if (path === "timeline.json") return Promise.resolve(JSON.stringify(timeline));

        return Promise.resolve(midiBytes);
    });
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

describe("evaluatePerformance", () => {
    it("writes the performance source to the container before running it", async () => {
        const { container, writeFile } = createFakeContainer();

        await evaluatePerformance(container, "export default 1;");

        expect(writeFile).toHaveBeenCalledWith("performance.ts", "export default 1;");
    });

    it("spawns node against a runner script written to the container", async () => {
        const { container, writeFile, spawn } = createFakeContainer();

        await evaluatePerformance(container, "export default 1;");

        const [runnerPath, runnerScript] = writeFile.mock.calls.find(call => call[0] === "run-performance.cjs")!;
        expect(spawn).toHaveBeenCalledWith("node", [runnerPath]);
        expect(runnerScript).toContain("toArrayBuffer");
    });

    it("writes an entry file that type-checks the performance's default export against File", async () => {
        const { container, writeFile } = createFakeContainer();

        await evaluatePerformance(container, "export default 1;");

        const [, entryScript] = writeFile.mock.calls.find(call => call[0] === "entry.ts")!;
        expect(entryScript).toContain('from "./performance"');
        expect(entryScript).toContain('from "@perry-rylance/midi"');
    });

    it("relies on a real TypeScript diagnostic (not an AST check of its own) to catch a missing default export", async () => {
        const { container, writeFile } = createFakeContainer();

        await evaluatePerformance(container, "export default 1;");

        const [, runnerScript] = writeFile.mock.calls.find(call => call[0] === "run-performance.cjs")!;
        expect(runnerScript).toContain("getSemanticDiagnostics");
        expect(runnerScript).toContain("No default export.");
    });

    it("resolves with the MIDI bytes read back from output.mid on success", async () => {
        const midiBytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64]);
        const { container, readFile } = createFakeContainer({ midiBytes });

        const result = await evaluatePerformance(container, "export default 1;");

        expect(readFile).toHaveBeenCalledWith("output.mid");
        expect(new Uint8Array(result.midi)).toEqual(midiBytes);
    });

    it("resolves with the timeline read back from timeline.json on success", async () => {
        const timeline = [{ trackIndex: 0, ticks: 0, milliseconds: 0, startLine: 3, startColumn: 9, endLine: 3, endColumn: 30 }];
        const { container, readFile } = createFakeContainer({ timeline });

        const result = await evaluatePerformance(container, "export default 1;");

        expect(readFile).toHaveBeenCalledWith("timeline.json", "utf-8");
        expect(result.timeline).toEqual(timeline);
    });

    it("resolves with an empty timeline when the runner produced none", async () => {
        const { container } = createFakeContainer({ timeline: [] });

        const result = await evaluatePerformance(container, "export default 1;");

        expect(result.timeline).toEqual([]);
    });

    it("relies on a real TypeScript type check (not a name heuristic) to find taggable Event constructors", async () => {
        const { container, writeFile } = createFakeContainer();

        await evaluatePerformance(container, "export default 1;");

        const [, runnerScript] = writeFile.mock.calls.find(call => call[0] === "run-performance.cjs")!;
        // The tagging pass must use the type checker (assignability to Event
        // from @perry-rylance/midi), not a name-based guess like "ends with
        // Event" - the latter would also be fooled by an unrelated class the
        // user happens to name similarly.
        expect(runnerScript).toContain("getTypeChecker");
        expect(runnerScript).toContain("isTypeAssignableTo");
    });

    it("threads an iteration context through .map()/.forEach()/.flatMap() callbacks for element-level highlighting", async () => {
        const { container, writeFile } = createFakeContainer();

        await evaluatePerformance(container, "export default 1;");

        const [, runnerScript] = writeFile.mock.calls.find(call => call[0] === "run-performance.cjs")!;
        expect(runnerScript).toContain("__iterationStack");
        expect(runnerScript).toContain('"map"');
        expect(runnerScript).toContain('"forEach"');
        expect(runnerScript).toContain('"flatMap"');
    });

    it("excludes an event from the timeline when it's the track's last event or is immediately followed by a zero-delta event", async () => {
        const { container, writeFile } = createFakeContainer();

        await evaluatePerformance(container, "export default 1;");

        const [, runnerScript] = writeFile.mock.calls.find(call => call[0] === "run-performance.cjs")!;
        // Otherwise an event with no visible moment on screen (superseded
        // before a frame could ever show it alone, e.g. a NoteOffEvent
        // immediately followed by the next note's NoteOnEvent at the same
        // instant) still gets a timeline entry, and the highlight loop shows
        // both notes' array elements at once instead of just the current one.
        expect(runnerScript).toContain("next.original.delta() === 0");
        expect(runnerScript).toContain("if (!next || next.original.delta() === 0) return;");
    });

    it("throws a PerformanceEvaluationError with the collected output when the process exits non-zero", async () => {
        const { container } = createFakeContainer({
            exitCode: 1,
            output: "TSError: Default export is not a MIDI File instance."
        });

        await expect(evaluatePerformance(container, "export default 1;")).rejects.toThrow(PerformanceEvaluationError);
    });

    it("includes the collected process output in the thrown error message", async () => {
        const { container } = createFakeContainer({
            exitCode: 1,
            output: "TSError: Default export is not a MIDI File instance."
        });

        await expect(evaluatePerformance(container, "export default 1;")).rejects.toThrow(
            /Default export is not a MIDI File instance/
        );
    });

    it("falls back to a generic message when a failing process produced no output", async () => {
        const { container } = createFakeContainer({ exitCode: 1, output: "" });

        await expect(evaluatePerformance(container, "export default 1;")).rejects.toThrow(/exited with code 1/);
    });
});
