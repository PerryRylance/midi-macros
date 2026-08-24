import type { WebContainer, WebContainerProcess } from "@webcontainer/api";

const PROGRAM_FILE_NAME = "program.ts";
const ENTRY_FILE_NAME = "entry.ts";
const COMPILED_FILE_NAME = "program.js";
const OUTPUT_FILE_NAME = "output.mid";
const TIMELINE_FILE_NAME = "timeline.json";
const RUNNER_FILE_NAME = "run-program.cjs";

// A source range for a single tagged MIDI event constructor call, resolved
// to a playback time - see the highlighting pipeline in mm-playback-controls.ts.
export interface TimelineEntry {
    trackIndex: number;
    ticks: number;
    milliseconds: number;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}

export interface EvaluatedProgram {
    midi: ArrayBuffer;
    timeline: TimelineEntry[];
}

// TS diagnostic codes for "Module '...' has no default export." and its
// "did you mean a named import" variant - checked below so that specific
// case can lead with a clearer "No default export." message.
const MISSING_DEFAULT_EXPORT_CODES = [1192, 2613];

// Imports the user's program's default export and checks its type against
// `File` - this is what makes a missing (or wrongly-typed) default export a
// real compiler diagnostic (TS1192 or a type-assignability error) rather
// than something we detect ourselves via an AST walk. `__eventTypeSample`
// exists purely so the runner script below has an AST node whose *type* is
// exactly `Event` from @perry-rylance/midi, to compare event constructor
// calls in the user's program against.
const ENTRY_SCRIPT = `
import program from "./${PROGRAM_FILE_NAME.replace(/\.ts$/, "")}";
import { File, type Event as __Event } from "@perry-rylance/midi";

const _defaultExport: File = program;
declare const __eventTypeSample: __Event;
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

const tsProgram = ts.createProgram([${JSON.stringify(ENTRY_FILE_NAME)}], compilerOptions);

// Scoped to entry.ts specifically (not ts.getPreEmitDiagnostics(tsProgram),
// which would also include every diagnostic inside the user's own program.ts)
// - this check is only about whether program.ts has a valid default export,
// not a general type-checker gate on the user's code. Anything else wrong
// with their program (a typo, a runtime bug) still only surfaces by actually
// running it, same as before.
const entryFile = tsProgram.getSourceFile(${JSON.stringify(ENTRY_FILE_NAME)});
const diagnostics = [
    ...tsProgram.getSyntacticDiagnostics(entryFile),
    ...tsProgram.getSemanticDiagnostics(entryFile)
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

// Finds the Event type from @perry-rylance/midi via the "__eventTypeSample"
// marker declared in entry.ts, so event constructor calls in the user's
// program can be checked for assignability to it (a real type check, not a
// name heuristic like "ends with Event").
const checker = tsProgram.getTypeChecker();
let eventType;
ts.forEachChild(entryFile, node => {
    if (!ts.isVariableStatement(node)) return;

    for (const declaration of node.declarationList.declarations) {
        if (declaration.name.getText() === "__eventTypeSample") {
            eventType = checker.getTypeAtLocation(declaration.name);
        }
    }
});

function createTaggingTransformer(context) {
    return sourceFile => {
        function visit(node) {
            const visited = ts.visitEachChild(node, visit, context);

            if (!ts.isNewExpression(node) || !eventType) return visited;

            const nodeType = checker.getTypeAtLocation(node);
            if (!checker.isTypeAssignableTo(nodeType, eventType)) return visited;

            // Just the "new XxxEvent(...)" constructor call itself, not any
            // chained builder calls after it (e.g. ".key(60)").
            const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

            const range = ts.factory.createObjectLiteralExpression([
                ts.factory.createPropertyAssignment("startLine", ts.factory.createNumericLiteral(start.line + 1)),
                ts.factory.createPropertyAssignment("startColumn", ts.factory.createNumericLiteral(start.character + 1)),
                ts.factory.createPropertyAssignment("endLine", ts.factory.createNumericLiteral(end.line + 1)),
                ts.factory.createPropertyAssignment("endColumn", ts.factory.createNumericLiteral(end.character + 1))
            ]);

            return ts.factory.createCallExpression(ts.factory.createIdentifier("__tagEvent"), undefined, [visited, range]);
        }

        return ts.visitNode(sourceFile, visit);
    };
}

const programSourceFile = tsProgram.getSourceFile(${JSON.stringify(PROGRAM_FILE_NAME)});
let emitted = "";

tsProgram.emit(programSourceFile, (_fileName, text) => {
    emitted = text;
}, undefined, false, { before: [createTaggingTransformer] });

const TAG_RUNTIME = "function __tagEvent(event, range) { try { event.__sourceRange = range; } catch (e) {} return event; }\\n";

fs.writeFileSync(${JSON.stringify(COMPILED_FILE_NAME)}, TAG_RUNTIME + emitted);

const exported = require("./${COMPILED_FILE_NAME}").default;

fs.writeFileSync(${JSON.stringify(OUTPUT_FILE_NAME)}, Buffer.from(exported.toArrayBuffer()));

const { TimeResolver } = require("@perry-rylance/midi-to-milliseconds");
const resolver = new TimeResolver(exported, { stable: true });

const timeline = [];
resolver.tracks.forEach((track, trackIndex) => {
    track.events.forEach(resolved => {
        const range = resolved.original.__sourceRange;

        if (!range) return;

        timeline.push({
            trackIndex,
            ticks: resolved.absolute.ticks,
            milliseconds: resolved.absolute.milliseconds,
            ...range
        });
    });
});

fs.writeFileSync(${JSON.stringify(TIMELINE_FILE_NAME)}, JSON.stringify(timeline));
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

// Requires `typescript` and `@perry-rylance/midi-to-milliseconds` to already
// be installed in the container - callers ensure this via startTsServer(),
// which mm-editor already invokes on mount.
export async function evaluateProgram(container: WebContainer, source: string): Promise<EvaluatedProgram> {
    await container.fs.writeFile(PROGRAM_FILE_NAME, source);
    await container.fs.writeFile(ENTRY_FILE_NAME, ENTRY_SCRIPT);
    await container.fs.writeFile(RUNNER_FILE_NAME, RUNNER_SCRIPT);

    const process = await container.spawn("node", [RUNNER_FILE_NAME]);
    const output = await collectOutput(process);
    const exitCode = await process.exit;

    if (exitCode !== 0) {
        throw new ProgramEvaluationError(output.trim() || `Program exited with code ${exitCode}.`);
    }

    const midiBytes = await container.fs.readFile(OUTPUT_FILE_NAME);
    const timelineJson = await container.fs.readFile(TIMELINE_FILE_NAME, "utf-8");

    return {
        midi: midiBytes.buffer.slice(midiBytes.byteOffset, midiBytes.byteOffset + midiBytes.byteLength) as ArrayBuffer,
        timeline: JSON.parse(timelineJson) as TimelineEntry[]
    };
}
