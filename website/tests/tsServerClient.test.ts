import { describe, expect, it } from "vitest";
import type { WebContainerProcess } from "@webcontainer/api";
import { createTsServerClient } from "../src/tsServerClient";
import { encodeTsServerMessage } from "../src/tsServerProtocol";
import { createEchoFilter } from "../src/echoFilter";
import { createSentMessageTracker } from "../src/sentMessageTracker";

function createFakeProcess() {
    let outputController!: ReadableStreamDefaultController<string>;
    const output = new ReadableStream<string>({
        start(controller) {
            outputController = controller;
        }
    });

    const writtenChunks: string[] = [];
    const input = new WritableStream<string>({
        write(chunk) {
            writtenChunks.push(chunk);
        }
    });

    return {
        process: { output, input } as unknown as WebContainerProcess,
        feed: (chunk: string) => outputController.enqueue(chunk),
        closeOutput: () => outputController.close(),
        writtenChunks
    };
}

describe("createTsServerClient", () => {
    // tsserver's own responses/events are Content-Length framed, even though
    // the commands we send it are plain newline-delimited JSON - see
    // src/tsServerProtocol.ts. `feed(...)` below simulates tsserver's real
    // output, so it uses `encodeTsServerMessage`, not the command encoding.
    it("delivers a parsed event to onEvent listeners once it is fully framed", async () => {
        const { process, feed } = createFakeProcess();
        const client = createTsServerClient(process);

        const received: unknown[] = [];
        client.onEvent(event => received.push(event));

        feed(encodeTsServerMessage({ seq: 0, type: "event", event: "semanticDiag", body: { file: "index.ts", diagnostics: [] } }));

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(received).toEqual([{ seq: 0, type: "event", event: "semanticDiag", body: { file: "index.ts", diagnostics: [] } }]);
    });

    it("fires onClose when the process output stream ends", async () => {
        const { process, closeOutput } = createFakeProcess();
        const client = createTsServerClient(process);

        const closed = new Promise<void>(resolve => client.onClose(resolve));
        closeOutput();

        await closed;
    });

    it("reports a parse error without crashing on malformed JSON", async () => {
        const { process, feed } = createFakeProcess();
        const client = createTsServerClient(process);

        const errors: unknown[] = [];
        client.onError(error => errors.push(error));

        feed("Content-Length: 9\r\n\r\nnot-json{");

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(errors).toHaveLength(1);
    });

    it("sends a newline-framed request command with an internally-assigned seq", async () => {
        const { process, writtenChunks } = createFakeProcess();
        const client = createTsServerClient(process);

        await client.sendCommand("open", { file: "/home/workspace/index.ts" });

        expect(writtenChunks).toEqual([
            `${JSON.stringify({ seq: 0, type: "request", command: "open", arguments: { file: "/home/workspace/index.ts" } })}\n`
        ]);
    });

    it("assigns increasing seq numbers across successive commands", async () => {
        const { process, writtenChunks } = createFakeProcess();
        const client = createTsServerClient(process);

        await client.sendCommand("open", { file: "a.ts" });
        await client.sendCommand("geterr", { files: ["a.ts"], delay: 0 });

        const seqs = writtenChunks.map(chunk => JSON.parse(chunk).seq);
        expect(seqs).toEqual([0, 1]);
    });

    describe("sendRequest", () => {
        it("resolves with the response body once a matching response arrives", async () => {
            const { process, feed } = createFakeProcess();
            const client = createTsServerClient(process);

            const pending = client.sendRequest("quickinfo", { file: "a.ts", line: 1, offset: 1 });

            feed(encodeTsServerMessage({
                seq: 0, type: "response", command: "quickinfo", request_seq: 0, success: true,
                body: { displayString: "const x: number" }
            }));

            await expect(pending).resolves.toEqual({ displayString: "const x: number" });
        });

        it("rejects when the response reports success: false", async () => {
            const { process, feed } = createFakeProcess();
            const client = createTsServerClient(process);

            const pending = client.sendRequest("quickinfo", { file: "a.ts", line: 1, offset: 1 });

            feed(encodeTsServerMessage({
                seq: 0, type: "response", command: "quickinfo", request_seq: 0, success: false,
                message: "No content available."
            }));

            await expect(pending).rejects.toThrow(/No content available/);
        });

        it("ignores a response whose request_seq doesn't match any pending request", async () => {
            const { process, feed } = createFakeProcess();
            const client = createTsServerClient(process);

            const errors: unknown[] = [];
            client.onError(error => errors.push(error));

            feed(encodeTsServerMessage({ seq: 0, type: "response", command: "quickinfo", request_seq: 99, success: true, body: {} }));

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(errors).toEqual([]);
        });
    });

    it("drops a PTY echo of its own outgoing command using the provided echo filter and tracker", async () => {
        const { process, feed } = createFakeProcess();
        const echoFilter = createEchoFilter();
        const sentMessageTracker = createSentMessageTracker();
        const client = createTsServerClient(process, echoFilter, sentMessageTracker);

        const received: unknown[] = [];
        client.onEvent(event => received.push(event));

        await client.sendCommand("open", { file: "/home/workspace/index.ts" });

        // A PTY echo reproduces exactly what we wrote - newline-framed, not
        // Content-Length framed. Since it's shaped as "type": "request", the
        // reader would never dispatch it as an event/response anyway, but
        // this still confirms the tracker/filter plumbing doesn't choke on it.
        feed(`${JSON.stringify({ seq: 0, type: "request", command: "open", arguments: { file: "/home/workspace/index.ts" } })}\n`);

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(received).toEqual([]);
    });
});
