import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDefaultTsConfig } from "../src/webcontainer";
import { encodeTsServerCommand, TsServerMessageBuffer } from "../src/tsServerProtocol";

// Runs the real tsserver.js binary (not a mock) against createDefaultTsConfig()'s
// actual output, to catch the class of bug that unit tests on the JSON alone
// can't: tsserver silently falling back to an inferred project (default lib,
// missing ES2019+ methods like flatMap/flat) instead of picking up our
// tsconfig.json - which is exactly what happened in the WebContainer sandbox.
const TSSERVER_PATH = fileURLToPath(new URL("../node_modules/typescript/lib/tsserver.js", import.meta.url));

interface TsServerEventMessage {
    type: "event";
    event: string;
    body?: { diagnostics?: { text: string }[] };
}

function isDiagnosticEvent(message: unknown): message is TsServerEventMessage {
    return (
        typeof message === "object" &&
        message !== null &&
        (message as { type?: unknown }).type === "event" &&
        (message as { event?: unknown }).event === "semanticDiag"
    );
}

async function collectSemanticDiagnostics(
    projectDir: string,
    fileName: string,
    content: string,
    // Mirrors mm-editor.ts's #syncDocument, which writes the file to the
    // WebContainer's real disk *in addition to* sending it as tsserver's
    // `open` fileContent - required because our tsconfig.json's default
    // `include: ["**/*"]` resolves via an actual directory scan, which never
    // sees a file that only ever exists as an `open` command's in-memory
    // fileContent. Without the write, the configured project ends up with
    // zero root files ("No inputs were found") and the opened file silently
    // falls back to a default-options project missing ES2019+ lib methods.
    { writeToDisk }: { writeToDisk: boolean }
): Promise<string[]> {
    const filePath = path.join(projectDir, fileName);
    const warmupPath = path.join(projectDir, ".warmup.ts");

    // mm-editor.ts writes the warm-up file to disk unconditionally, same reason.
    await writeFile(warmupPath, "");

    if (writeToDisk) {
        await writeFile(filePath, content);
    }

    const child = spawn(process.execPath, [TSSERVER_PATH, "--disableAutomaticTypingAcquisition"], {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"]
    });

    const buffer = new TsServerMessageBuffer();
    let seq = 0;

    function send(command: string, args: unknown): void {
        child.stdin.write(encodeTsServerCommand({ seq: seq++, type: "request", command, arguments: args }));
    }

    try {
        return await new Promise<string[]>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timed out waiting for tsserver's semanticDiag event.")), 15_000);

            child.on("error", error => {
                clearTimeout(timeout);
                reject(error);
            });

            child.stdout.on("data", (chunk: Buffer) => {
                for (const raw of buffer.append(chunk.toString("utf8"))) {
                    let message: unknown;

                    try {
                        message = JSON.parse(raw);
                    } catch {
                        continue;
                    }

                    if (isDiagnosticEvent(message) && message.body) {
                        clearTimeout(timeout);
                        resolve((message.body.diagnostics ?? []).map(diagnostic => diagnostic.text));
                    }
                }
            });

            // Mirrors mm-editor.ts's own startup sequence: a disposable
            // warm-up file opened first (tsserver doesn't attach a real
            // project to whichever file is opened first in a session), then
            // the real file, then geterr to trigger semantic diagnostics.
            send("open", { file: warmupPath, fileContent: "", scriptKindName: "TS", projectRootPath: projectDir });
            send("open", { file: filePath, fileContent: content, scriptKindName: "TS", projectRootPath: projectDir });
            send("geterr", { files: [filePath], delay: 0 });
        });
    } finally {
        child.kill();
    }
}

const FLATMAP_SOURCE = "export const y = [1, 2, 3].flatMap((n) => [n, n]);\n";

describe("createDefaultTsConfig against a real tsserver", () => {
    it(
        // Regression test for the actual bug: mm-editor.ts's first attempt
        // (opening the file purely via tsserver's in-memory `open` command,
        // never writing it to the container's real disk) reproduced the
        // user's exact live symptom below, even though createDefaultTsConfig()
        // and the open/geterr protocol sequence were both individually
        // correct - proving the config content and the wire protocol alone
        // aren't sufficient to catch this class of bug.
        "flags flatMap as missing from the target lib when the file is only ever opened in-memory, never written to disk",
        async () => {
            const projectDir = await mkdtemp(path.join(tmpdir(), "mm-tsserver-test-"));

            try {
                await writeFile(path.join(projectDir, "tsconfig.json"), createDefaultTsConfig());

                const diagnostics = await collectSemanticDiagnostics(projectDir, "index.ts", FLATMAP_SOURCE, {
                    writeToDisk: false
                });

                expect(diagnostics).toEqual([
                    "Property 'flatMap' does not exist on type 'number[]'. Do you need to change your target library? Try changing the 'lib' compiler option to 'es2019' or later."
                ]);
            } finally {
                await rm(projectDir, { recursive: true, force: true });
            }
        },
        20_000
    );

    it(
        "does not flag ES2019+ array methods (flatMap) as missing from the target lib once the file is also written to disk",
        async () => {
            const projectDir = await mkdtemp(path.join(tmpdir(), "mm-tsserver-test-"));

            try {
                await writeFile(path.join(projectDir, "tsconfig.json"), createDefaultTsConfig());

                const diagnostics = await collectSemanticDiagnostics(projectDir, "index.ts", FLATMAP_SOURCE, {
                    writeToDisk: true
                });

                expect(diagnostics).toEqual([]);
            } finally {
                await rm(projectDir, { recursive: true, force: true });
            }
        },
        20_000
    );
});
