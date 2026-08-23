import type { WebContainer, WebContainerProcess } from "@webcontainer/api";

const PROGRAM_FILE_NAME = "program.ts";
const ENTRY_FILE_NAME = "entry.ts";
const COMPILED_FILE_NAME = "program.js";
const OUTPUT_FILE_NAME = "output.mid";
const RUNNER_FILE_NAME = "run-program.cjs";

// TS diagnostic codes for "Module '...' has no default export." and its
// "did you mean a named import" variant - checked below so that specific
// case can lead with a clearer "No default export." message.
const MISSING_DEFAULT_EXPORT_CODES = [1192, 2613];

// Imports the user's program's default export and checks its type against
// `File` - this is what makes a missing (or wrongly-typed) default export a
// real compiler diagnostic (TS1192 or a type-assignability error) rather
// than something we detect ourselves via an AST walk.
const ENTRY_SCRIPT = `
import program from "./${PROGRAM_FILE_NAME.replace(/\.ts$/, "")}";
import { File } from "@perry-rylance/midi";

const _defaultExport: File = program;
`;

// Runs inside the WebContainer sandbox via plain require() (not bundled by
// Vite) - that's what lets the user's program resolve whatever packages
// they've npm-installed via the Packages tab, including @perry-rylance/midi,
// through Node's own module resolution.
const RUNNER_SCRIPT = `
const ts = require("typescript");
const fs = require("fs");

const compilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
    skipLibCheck: true,
    // Without this, a program with no imports/exports at all (e.g. a syntax
    // error before any are written) is treated as a plain script rather than
    // a module, and importing its default from entry.ts fails with "is not
    // a module" instead of the "has no default export" diagnostic we want.
    moduleDetection: ts.ModuleDetectionKind.Force
};

const program = ts.createProgram([${JSON.stringify(ENTRY_FILE_NAME)}], compilerOptions);

// Scoped to entry.ts specifically (not ts.getPreEmitDiagnostics(program),
// which would also include every diagnostic inside the user's own program.ts)
// - this check is only about whether program.ts has a valid default export,
// not a general type-checker gate on the user's code. Anything else wrong
// with their program (a typo, a runtime bug) still only surfaces by actually
// running it, same as before.
const entryFile = program.getSourceFile(${JSON.stringify(ENTRY_FILE_NAME)});
const diagnostics = [
    ...program.getSyntacticDiagnostics(entryFile),
    ...program.getSemanticDiagnostics(entryFile)
];

if (diagnostics.length > 0) {
    const isMissingDefaultExport = diagnostics.some(d => ${JSON.stringify(MISSING_DEFAULT_EXPORT_CODES)}.includes(d.code));

    const formatted = diagnostics.map(d => {
        const message = ts.flattenDiagnosticMessageText(d.messageText, "\\n");

        if (d.file && d.start !== undefined) {
            const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
            return d.file.fileName + " (" + (line + 1) + "," + (character + 1) + "): error TS" + d.code + ": " + message;
        }

        return "error TS" + d.code + ": " + message;
    }).join("\\n");

    throw new Error((isMissingDefaultExport ? "No default export.\\n" : "") + formatted);
}

const source = fs.readFileSync(${JSON.stringify(PROGRAM_FILE_NAME)}, "utf-8");
const { outputText } = ts.transpileModule(source, { compilerOptions });

fs.writeFileSync(${JSON.stringify(COMPILED_FILE_NAME)}, outputText);

const exported = require("./${COMPILED_FILE_NAME}").default;

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
    await container.fs.writeFile(ENTRY_FILE_NAME, ENTRY_SCRIPT);
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
