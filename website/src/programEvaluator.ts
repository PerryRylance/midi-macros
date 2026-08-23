import type { WebContainer, WebContainerProcess } from "@webcontainer/api";

const PROGRAM_FILE_NAME = "program.ts";
const COMPILED_FILE_NAME = "program.js";
const OUTPUT_FILE_NAME = "output.mid";
const RUNNER_FILE_NAME = "run-program.cjs";

// Runs inside the WebContainer sandbox via plain require() (not bundled by
// Vite) - that's what lets the user's program resolve whatever packages
// they've npm-installed via the Packages tab, including @perry-rylance/midi,
// through Node's own module resolution.
const RUNNER_SCRIPT = `
const ts = require("typescript");
const fs = require("fs");

const source = fs.readFileSync(${JSON.stringify(PROGRAM_FILE_NAME)}, "utf-8");
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});

fs.writeFileSync(${JSON.stringify(COMPILED_FILE_NAME)}, outputText);

const exported = require("./${COMPILED_FILE_NAME}").default;

if (!exported || typeof exported.toArrayBuffer !== "function") {
    throw new Error("Default export is not a MIDI File instance.");
}

fs.writeFileSync(${JSON.stringify(OUTPUT_FILE_NAME)}, Buffer.from(exported.toArrayBuffer()));
`;

export class ProgramEvaluationError extends Error {}

async function collectOutput(process: WebContainerProcess): Promise<string> {
    const reader = process.output.getReader();
    let output = "";

    while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        output += value;
    }

    return output;
}

// Requires `typescript` to already be installed in the container - callers
// ensure this via startTsServer(), which mm-editor already invokes on mount.
export async function evaluateProgram(container: WebContainer, source: string): Promise<ArrayBuffer> {
    await container.fs.writeFile(PROGRAM_FILE_NAME, source);
    await container.fs.writeFile(RUNNER_FILE_NAME, RUNNER_SCRIPT);

    const process = await container.spawn("node", [RUNNER_FILE_NAME]);
    const output = await collectOutput(process);
    const exitCode = await process.exit;

    if (exitCode !== 0) {
        throw new ProgramEvaluationError(output.trim() || `Program exited with code ${exitCode}.`);
    }

    const bytes = await container.fs.readFile(OUTPUT_FILE_NAME);

    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
