import { describe, expect, it } from "vitest";
import type { WebContainerProcess } from "@webcontainer/api";
import { createTsServerClient } from "../src/tsServerClient";
import { encodeTsServerCommand } from "../src/tsServerProtocol";
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
    it("delivers a parsed event to onEvent listeners once it is fully framed", async () => {
        const { process, feed } = createFakeProcess();
        const client = createTsServerClient(process);

        const received: unknown[] = [];
        client.onEvent(event => received.push(event));

        feed(encodeTsServerCommand({ seq: 0, type: "event", event: "semanticDiag", body: { file: "index.ts", diagnostics: [] } }));

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(received).toEqual([{ seq: 0, type: "event", event: "semanticDiag", body: { file: "index.ts", diagnostics: [] } }]);
    });

    it("ignores non-event messages (e.g. command responses)", async () => {
        const { process, feed } = createFakeProcess();
        const client = createTsServerClient(process);

        const received: unknown[] = [];
        client.onEvent(event => received.push(event));

        feed(encodeTsServerCommand({ seq: 0, type: "response", command: "open", success: true }));

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(received).toEqual([]);
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

        feed("not-json{\n");

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(errors).toHaveLength(1);
    });

    it("sends a newline-framed command to the process input", async () => {
        const { process, writtenChunks } = createFakeProcess();
        const client = createTsServerClient(process);

        await client.sendCommand({ seq: 0, type: "request", command: "open" });

        expect(writtenChunks).toEqual([encodeTsServerCommand({ seq: 0, type: "request", command: "open" })]);
    });

    it("drops a PTY echo of its own outgoing command using the provided echo filter and tracker", async () => {
        const { process, feed } = createFakeProcess();
        const echoFilter = createEchoFilter();
        const sentMessageTracker = createSentMessageTracker();
        const client = createTsServerClient(process, echoFilter, sentMessageTracker);

        const received: unknown[] = [];
        client.onEvent(event => received.push(event));

        // Shaped like an event so that, if the echo were NOT dropped, it
        // would show up in `received` and this test would catch it.
        const command = { seq: 0, type: "event", event: "requestCompleted" };
        await client.sendCommand(command);

        feed(encodeTsServerCommand(command));

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(received).toEqual([]);
    });
});
