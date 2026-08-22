import { describe, expect, it } from "vitest";
import { encodeTsServerCommand, TsServerMessageBuffer } from "../src/tsServerProtocol";

describe("encodeTsServerCommand", () => {
    it("frames a command as newline-terminated JSON", () => {
        const encoded = encodeTsServerCommand({ seq: 0, type: "request", command: "open" });

        expect(encoded).toBe(`${JSON.stringify({ seq: 0, type: "request", command: "open" })}\n`);
    });
});

describe("TsServerMessageBuffer", () => {
    it("parses a single complete message delivered in one chunk", () => {
        const buffer = new TsServerMessageBuffer();
        const messages = buffer.append(encodeTsServerCommand({ hello: "world" }));

        expect(messages).toEqual([JSON.stringify({ hello: "world" })]);
    });

    it("parses multiple messages concatenated in a single chunk", () => {
        const buffer = new TsServerMessageBuffer();
        const chunk = encodeTsServerCommand({ a: 1 }) + encodeTsServerCommand({ b: 2 });
        const messages = buffer.append(chunk);

        expect(messages).toEqual([JSON.stringify({ a: 1 }), JSON.stringify({ b: 2 })]);
    });

    it("reassembles a message split across multiple chunks", () => {
        const buffer = new TsServerMessageBuffer();
        const encoded = encodeTsServerCommand({ hello: "world" });
        const splitPoint = Math.floor(encoded.length / 2);

        expect(buffer.append(encoded.slice(0, splitPoint))).toEqual([]);
        expect(buffer.append(encoded.slice(splitPoint))).toEqual([JSON.stringify({ hello: "world" })]);
    });

    it("keeps an incomplete trailing line buffered for the next parse", () => {
        const buffer = new TsServerMessageBuffer();
        const chunk = `${encodeTsServerCommand({ a: 1 })}partial-without-newline`;
        const messages = buffer.append(chunk);

        expect(messages).toEqual([JSON.stringify({ a: 1 })]);
        expect(buffer.append("-more\n")).toEqual(["partial-without-newline-more"]);
    });

    it("strips a trailing carriage return from each line", () => {
        const buffer = new TsServerMessageBuffer();
        const body = JSON.stringify({ hello: "world" });

        expect(buffer.append(`${body}\r\n`)).toEqual([body]);
    });

    it("ignores blank lines (WebContainer PTY echo can double up newlines)", () => {
        const buffer = new TsServerMessageBuffer();
        const body = JSON.stringify({ hello: "world" });

        expect(buffer.append(`\n\n${body}\n\n`)).toEqual([body]);
    });

    it("correctly frames non-ASCII content spanning a chunk boundary", () => {
        const buffer = new TsServerMessageBuffer();
        const encoded = encodeTsServerCommand({ text: "🎵 export default" });
        const splitPoint = encoded.indexOf("🎵") + 1;

        const first = buffer.append(encoded.slice(0, splitPoint));
        const second = buffer.append(encoded.slice(splitPoint));

        expect(first).toEqual([]);
        expect(second).toEqual([JSON.stringify({ text: "🎵 export default" })]);
    });
});
