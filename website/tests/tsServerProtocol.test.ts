import { describe, expect, it } from "vitest";
import { encodeTsServerCommand, encodeTsServerMessage, TsServerMessageBuffer } from "../src/tsServerProtocol";

describe("encodeTsServerCommand", () => {
    it("frames a command as newline-terminated JSON (tsserver reads stdin via readline)", () => {
        const encoded = encodeTsServerCommand({ seq: 0, type: "request", command: "open" });

        expect(encoded).toBe(`${JSON.stringify({ seq: 0, type: "request", command: "open" })}\n`);
    });
});

// tsserver's own responses/events are Content-Length framed (like LSP), even
// though the commands we send it are plain newline-delimited JSON - this is
// a real, confirmed asymmetry in tsserver's protocol, not a mistake to
// "fix" toward symmetry. See src/tsServerProtocol.ts for where this is
// confirmed against tsserver's own source (`formatMessage`/`sys.write`).
describe("TsServerMessageBuffer", () => {
    it("parses a single complete message delivered in one chunk", () => {
        const buffer = new TsServerMessageBuffer();
        const messages = buffer.append(encodeTsServerMessage({ hello: "world" }));

        expect(messages).toEqual([JSON.stringify({ hello: "world" })]);
    });

    it("parses multiple messages concatenated in a single chunk", () => {
        const buffer = new TsServerMessageBuffer();
        const chunk = encodeTsServerMessage({ a: 1 }) + encodeTsServerMessage({ b: 2 });
        const messages = buffer.append(chunk);

        expect(messages).toEqual([JSON.stringify({ a: 1 }), JSON.stringify({ b: 2 })]);
    });

    it("reassembles a message split across multiple chunks, including mid-header and mid-body splits", () => {
        const buffer = new TsServerMessageBuffer();
        const encoded = encodeTsServerMessage({ hello: "world" });
        const splitPoint = Math.floor(encoded.length / 2);

        expect(buffer.append(encoded.slice(0, splitPoint))).toEqual([]);
        expect(buffer.append(encoded.slice(splitPoint))).toEqual([JSON.stringify({ hello: "world" })]);
    });

    it("correctly frames non-ASCII content spanning a chunk boundary", () => {
        const buffer = new TsServerMessageBuffer();
        const encoded = encodeTsServerMessage({ text: "🎵 export default" });
        const splitPoint = encoded.indexOf("🎵") + 1;

        const first = buffer.append(encoded.slice(0, splitPoint));
        const second = buffer.append(encoded.slice(splitPoint));

        expect(first).toEqual([]);
        expect(second).toEqual([JSON.stringify({ text: "🎵 export default" })]);
    });

    it("keeps an incomplete trailing message buffered for the next parse", () => {
        const buffer = new TsServerMessageBuffer();
        const chunk = encodeTsServerMessage({ a: 1 }) + "Content-Length: 14\r\n\r\npartial...";
        const messages = buffer.append(chunk);

        expect(messages).toEqual([JSON.stringify({ a: 1 })]);
        expect(buffer.append("more")).toEqual(["partial...more"]);
    });

    it("throws on a malformed header missing Content-Length", () => {
        const buffer = new TsServerMessageBuffer();

        expect(() => buffer.append("X-Bogus: 1\r\n\r\n{}")).toThrow(/Malformed tsserver message header/);
    });

    it("tolerates an extra blank-line separator spliced in after the header (WebContainer PTY echo artifact)", () => {
        const buffer = new TsServerMessageBuffer();
        const body = JSON.stringify({ hello: "world" });
        const corrupted = `Content-Length: ${body.length}\r\n\r\n\r\n\r\n${body}`;

        expect(buffer.append(corrupted)).toEqual([body]);
    });

    it("tolerates an extra separator even when it arrives split across chunks", () => {
        const buffer = new TsServerMessageBuffer();
        const body = JSON.stringify({ hello: "world" });
        const corrupted = `Content-Length: ${body.length}\r\n\r\n\r\n\r\n${body}`;
        const splitPoint = corrupted.indexOf("\r\n\r\n") + 2;

        expect(buffer.append(corrupted.slice(0, splitPoint))).toEqual([]);
        expect(buffer.append(corrupted.slice(splitPoint))).toEqual([body]);
    });

    it("strips the extra byte tsserver counts in Content-Length for its own trailing newline", () => {
        const buffer = new TsServerMessageBuffer();
        const body = JSON.stringify({ hello: "world" });
        // tsserver's real framing: Content-Length counts body + 1 trailing "\n".
        const framed = `Content-Length: ${body.length + 1}\r\n\r\n${body}\n`;

        expect(buffer.append(framed)).toEqual([body]);
    });

    // WebContainer's pseudo-terminal applies ONLCR-style output processing
    // (every "\n" becomes "\r\n") to a spawned process's own stdout, not just
    // to echoed input - so tsserver's real "\r\n\r\n" separator arrives on
    // the wire doubled up as "\r\r\n\r\r\n", and its trailing "\n" arrives as
    // "\r\n". Confirmed empirically against a real WebContainer-spawned
    // tsserver process - see agents/REGRESSION.md.
    it("parses a message whose framing bytes were mangled by the WebContainer PTY's ONLCR translation", () => {
        const buffer = new TsServerMessageBuffer();
        const body = JSON.stringify({ seq: 0, type: "event", event: "typingsInstallerPid", body: { pid: 13 } });
        const mangled = `Content-Length: ${body.length + 1}\r\r\n\r\r\n${body}\r\n`;

        expect(buffer.append(mangled)).toEqual([body]);
    });

    it("parses a real captured WebContainer tsserver response byte-for-byte", () => {
        const buffer = new TsServerMessageBuffer();
        // Captured verbatim from a live WebContainer-spawned tsserver process,
        // including the PTY echo of our own outgoing command ahead of it.
        const raw = "{\"seq\":0,\"type\":\"request\",\"command\":\"status\"}\r\nContent-Length: 73\r\r\n\r\r\n"
            + "{\"seq\":0,\"type\":\"event\",\"event\":\"typingsInstallerPid\",\"body\":{\"pid\":13}}\r\n";

        expect(buffer.append(raw)).toEqual([
            "{\"seq\":0,\"type\":\"event\",\"event\":\"typingsInstallerPid\",\"body\":{\"pid\":13}}"
        ]);
    });
});
