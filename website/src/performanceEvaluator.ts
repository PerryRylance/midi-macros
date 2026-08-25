import type { WebContainer, WebContainerProcess } from "@webcontainer/api";

export const PERFORMANCE_FILE_NAME = "performance.ts";
const ENTRY_FILE_NAME = "entry.ts";
const COMPILED_FILE_NAME = "performance.js";
const OUTPUT_FILE_NAME = "output.mid";
const TIMELINE_FILE_NAME = "timeline.json";
const RUNNER_FILE_NAME = "run-performance.cjs";

export interface SourceRange {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}

// A source range for a single tagged MIDI event constructor call, resolved
// to a playback time - see the highlighting pipeline in mm-playback-controls.ts.
// elementRanges holds, for each enclosing .map()/.forEach()/.flatMap() call
// (outermost first) whose iterated array could be traced back to a literal
// array in source, the range of the specific element that produced this
// event - see agents/SPIKE.md for what this can and can't resolve.
export interface TimelineEntry extends SourceRange {
    trackIndex: number;
    ticks: number;
    milliseconds: number;
    elementRanges: SourceRange[];
}

export interface EvaluatedPerformance {
    midi: ArrayBuffer;
    timeline: TimelineEntry[];
}

// TS diagnostic codes for "Module '...' has no default export." and its
// "did you mean a named import" variant - checked below so that specific
// case can lead with a clearer "No default export." message.
const MISSING_DEFAULT_EXPORT_CODES = [1192, 2613];

// Imports the user's performance's default export and checks its type
// against `File` - this is what makes a missing (or wrongly-typed) default
// export a real compiler diagnostic (TS1192 or a type-assignability error)
// rather than something we detect ourselves via an AST walk.
// `__eventTypeSample` exists purely so the runner script below has an AST
// node whose *type* is exactly `Event` from @perry-rylance/midi, to compare
// event constructor calls in the user's performance against.
const ENTRY_SCRIPT = `
import performance from "./${PERFORMANCE_FILE_NAME.replace(/\.ts$/, "")}";
import { File, type Event as __Event } from "@perry-rylance/midi";

const _defaultExport: File = performance;
declare const __eventTypeSample: __Event;
`;

// Runs inside the WebContainer sandbox via plain require() (not bundled by
// Vite) - that's what lets the user's performance resolve whatever packages
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
// which would also include every diagnostic inside the user's own
// performance.ts) - this check is only about whether performance.ts has a
// valid default export, not a general type-checker gate on the user's code.
// Anything else wrong with their performance (a typo, a runtime bug) still
// only surfaces by actually running it, same as before.
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
// performance can be checked for assignability to it (a real type check,
// not a name heuristic like "ends with Event").
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

function createRangeLiteral(sourceFile, start, end) {
    return ts.factory.createObjectLiteralExpression([
        ts.factory.createPropertyAssignment("startLine", ts.factory.createNumericLiteral(start.line + 1)),
        ts.factory.createPropertyAssignment("startColumn", ts.factory.createNumericLiteral(start.character + 1)),
        ts.factory.createPropertyAssignment("endLine", ts.factory.createNumericLiteral(end.line + 1)),
        ts.factory.createPropertyAssignment("endColumn", ts.factory.createNumericLiteral(end.character + 1))
    ]);
}

// See agents/SPIKE.md ("Level 2"). Resolves an expression back to an array
// literal written in source, if possible - directly ([1,2,3].map(...)), or
// via the type checker's real symbol resolution for a named constant
// (const notes = [1,2,3]; notes.map(...)). Deliberately does not attempt to
// resolve through a callback parameter (e.g. the inner "chord" in
// chords.flatMap(chord => chord.map(...))) - that's a real boundary, not a
// bug, per the spike's "Level 3, not validated" finding.
function resolveArrayLiteral(expr) {
    if (ts.isArrayLiteralExpression(expr)) return expr;
    if (!ts.isIdentifier(expr)) return undefined;

    const symbol = checker.getSymbolAtLocation(expr);
    if (!symbol) return undefined;

    for (const declaration of symbol.getDeclarations() || []) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isArrayLiteralExpression(declaration.initializer)) {
            return declaration.initializer;
        }
    }

    return undefined;
}

function elementRangeLiterals(expr) {
    const literal = resolveArrayLiteral(expr);
    if (!literal) return undefined;

    const literalSourceFile = literal.getSourceFile();

    return literal.elements.map(element =>
        createRangeLiteral(
            literalSourceFile,
            literalSourceFile.getLineAndCharacterOfPosition(element.getStart()),
            literalSourceFile.getLineAndCharacterOfPosition(element.getEnd())
        )
    );
}

// .map()/.forEach()/.flatMap() calls whose iterated array resolves to a
// literal - see agents/SPIKE.md. "current element" isn't knowable statically
// (any of these can run any number of times), so tagging alone (below)
// isn't enough - this instead threads it through at runtime via a stack,
// pushed/popped around each *actual* invocation of the original callback.
const ITERATION_METHODS = new Set(["map", "forEach", "flatMap"]);

function wrapIterationCallback(node, visitedNode) {
    if (
        !ts.isCallExpression(node) ||
        !ts.isPropertyAccessExpression(node.expression) ||
        !ITERATION_METHODS.has(node.expression.name.text) ||
        node.arguments.length === 0
    ) {
        return undefined;
    }

    const elementRanges = elementRangeLiterals(node.expression.expression);

    const elParam = ts.factory.createUniqueName("el");
    const idxParam = ts.factory.createUniqueName("idx");
    const arrParam = ts.factory.createUniqueName("arr");

    const elementRangeValue = elementRanges
        ? ts.factory.createElementAccessExpression(ts.factory.createArrayLiteralExpression(elementRanges), idxParam)
        : ts.factory.createIdentifier("undefined");

    const pushCall = ts.factory.createExpressionStatement(
        ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier("__iterationStack"), "push"),
            undefined,
            [ts.factory.createObjectLiteralExpression([
                ts.factory.createPropertyAssignment("elementRange", elementRangeValue)
            ])]
        )
    );

    const popCall = ts.factory.createExpressionStatement(
        ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier("__iterationStack"), "pop"),
            undefined,
            []
        )
    );

    const callOriginal = ts.factory.createCallExpression(visitedNode.arguments[0], undefined, [elParam, idxParam, arrParam]);

    const wrapperBody = ts.factory.createBlock([
        pushCall,
        ts.factory.createTryStatement(
            ts.factory.createBlock([ts.factory.createReturnStatement(callOriginal)], true),
            undefined,
            ts.factory.createBlock([popCall], true)
        )
    ], true);

    const wrapper = ts.factory.createArrowFunction(
        undefined, undefined,
        [elParam, idxParam, arrParam].map(param => ts.factory.createParameterDeclaration(undefined, undefined, param)),
        undefined, undefined, wrapperBody
    );

    return ts.factory.updateCallExpression(visitedNode, visitedNode.expression, visitedNode.typeArguments, [
        wrapper,
        ...visitedNode.arguments.slice(1)
    ]);
}

function createTaggingTransformer(context) {
    return sourceFile => {
        function visit(node) {
            const visited = ts.visitEachChild(node, visit, context);

            const wrapped = wrapIterationCallback(node, visited);
            if (wrapped) return wrapped;

            if (!ts.isNewExpression(node) || !eventType) return visited;

            const nodeType = checker.getTypeAtLocation(node);
            if (!checker.isTypeAssignableTo(nodeType, eventType)) return visited;

            // Just the "new XxxEvent(...)" constructor call itself, not any
            // chained builder calls after it (e.g. ".key(60)").
            const range = createRangeLiteral(
                sourceFile,
                sourceFile.getLineAndCharacterOfPosition(node.getStart()),
                sourceFile.getLineAndCharacterOfPosition(node.getEnd())
            );

            return ts.factory.createCallExpression(ts.factory.createIdentifier("__tagEvent"), undefined, [visited, range]);
        }

        return ts.visitNode(sourceFile, visit);
    };
}

const performanceSourceFile = tsProgram.getSourceFile(${JSON.stringify(PERFORMANCE_FILE_NAME)});
let emitted = "";

tsProgram.emit(performanceSourceFile, (_fileName, text) => {
    emitted = text;
}, undefined, false, { before: [createTaggingTransformer] });

// __iterationStack holds one frame per currently-executing .map()/.forEach()/
// .flatMap() callback (outermost first) - a plain array works because
// building a File is entirely synchronous, so push/pop always nest correctly
// even across arbitrarily deep loops (see agents/SPIKE.md).
const TAG_RUNTIME = "var __iterationStack = [];\\n" +
    "function __tagEvent(event, range) {\\n" +
    "    try {\\n" +
    "        event.__sourceRange = range;\\n" +
    "        event.__iterationContext = __iterationStack.slice();\\n" +
    "    } catch (e) {}\\n" +
    "    return event;\\n" +
    "}\\n";

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

        const elementRanges = (resolved.original.__iterationContext || [])
            .map(frame => frame.elementRange)
            .filter(Boolean);

        timeline.push({
            trackIndex,
            ticks: resolved.absolute.ticks,
            milliseconds: resolved.absolute.milliseconds,
            ...range,
            elementRanges
        });
    });
});

fs.writeFileSync(${JSON.stringify(TIMELINE_FILE_NAME)}, JSON.stringify(timeline));
`;

export class PerformanceEvaluationError extends Error {}

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
export async function evaluatePerformance(container: WebContainer, source: string): Promise<EvaluatedPerformance> {
    await container.fs.writeFile(PERFORMANCE_FILE_NAME, source);
    await container.fs.writeFile(ENTRY_FILE_NAME, ENTRY_SCRIPT);
    await container.fs.writeFile(RUNNER_FILE_NAME, RUNNER_SCRIPT);

    const process = await container.spawn("node", [RUNNER_FILE_NAME]);
    const output = await collectOutput(process);
    const exitCode = await process.exit;

    if (exitCode !== 0) {
        throw new PerformanceEvaluationError(output.trim() || `Performance exited with code ${exitCode}.`);
    }

    const midiBytes = await container.fs.readFile(OUTPUT_FILE_NAME);
    const timelineJson = await container.fs.readFile(TIMELINE_FILE_NAME, "utf-8");

    return {
        midi: midiBytes.buffer.slice(midiBytes.byteOffset, midiBytes.byteOffset + midiBytes.byteLength) as ArrayBuffer,
        timeline: JSON.parse(timelineJson) as TimelineEntry[]
    };
}
