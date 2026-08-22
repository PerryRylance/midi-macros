import { describe, expect, it } from "vitest";
import { createSentMessageTracker } from "../src/sentMessageTracker";

describe("createSentMessageTracker", () => {
    it("does not flag a message that was never sent", () => {
        const tracker = createSentMessageTracker();

        expect(tracker.isEcho({ jsonrpc: "2.0", id: 1, method: "initialize" })).toBe(false);
    });

    it("flags a message that exactly matches one that was sent", () => {
        const tracker = createSentMessageTracker();
        const message = { jsonrpc: "2.0", id: 1, method: "initialize", params: { foo: "bar" } };

        tracker.recordSent(message);

        expect(tracker.isEcho({ jsonrpc: "2.0", id: 1, method: "initialize", params: { foo: "bar" } })).toBe(true);
    });

    it("only flags a sent message once (does not keep matching after it's been claimed)", () => {
        const tracker = createSentMessageTracker();
        const message = { jsonrpc: "2.0", id: 1, method: "initialize" };

        tracker.recordSent(message);

        expect(tracker.isEcho(message)).toBe(true);
        expect(tracker.isEcho(message)).toBe(false);
    });

    it("matches by content, not by object identity", () => {
        const tracker = createSentMessageTracker();

        tracker.recordSent({ jsonrpc: "2.0", id: 1, method: "initialize" });

        expect(tracker.isEcho({ jsonrpc: "2.0", id: 1, method: "initialize" })).toBe(true);
    });

    it("tracks multiple distinct sent messages independently", () => {
        const tracker = createSentMessageTracker();

        tracker.recordSent({ jsonrpc: "2.0", id: 1, method: "a" });
        tracker.recordSent({ jsonrpc: "2.0", id: 2, method: "b" });

        expect(tracker.isEcho({ jsonrpc: "2.0", id: 2, method: "b" })).toBe(true);
        expect(tracker.isEcho({ jsonrpc: "2.0", id: 1, method: "a" })).toBe(true);
    });

    it("does not flag a real server response with a different shape", () => {
        const tracker = createSentMessageTracker();

        tracker.recordSent({ jsonrpc: "2.0", id: 1, method: "initialize" });

        expect(tracker.isEcho({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } })).toBe(false);
    });
});
