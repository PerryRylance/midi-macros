import { describe, expect, it } from "vitest";
import { createEchoFilter } from "../src/echoFilter";

describe("createEchoFilter", () => {
    it("passes incoming data through unchanged when nothing was written", () => {
        const filter = createEchoFilter();

        expect(filter.filterIncoming("hello")).toBe("hello");
    });

    it("strips an exact echo of a single write", () => {
        const filter = createEchoFilter();

        filter.recordWrite("ABC");

        expect(filter.filterIncoming("ABC")).toBe("");
    });

    it("strips the echo prefix and returns real data that follows it in the same chunk", () => {
        const filter = createEchoFilter();

        filter.recordWrite("ABC");

        expect(filter.filterIncoming("ABCDEF")).toBe("DEF");
    });

    it("strips an echo that arrives split across multiple chunks", () => {
        const filter = createEchoFilter();

        filter.recordWrite("ABCDEF");

        expect(filter.filterIncoming("ABC")).toBe("");
        expect(filter.filterIncoming("DEF")).toBe("");
    });

    it("strips a split echo and returns real data that arrives after it", () => {
        const filter = createEchoFilter();

        filter.recordWrite("ABCDEF");

        expect(filter.filterIncoming("ABC")).toBe("");
        expect(filter.filterIncoming("DEFreal-data")).toBe("real-data");
    });

    it("concatenates multiple recorded writes before matching", () => {
        const filter = createEchoFilter();

        filter.recordWrite("AB");
        filter.recordWrite("CD");

        expect(filter.filterIncoming("ABCD")).toBe("");
    });

    it("gives up and passes data through when it doesn't match the expected echo", () => {
        const filter = createEchoFilter();

        filter.recordWrite("ABC");

        expect(filter.filterIncoming("XYZ")).toBe("XYZ");
        // Having given up once, it should not keep trying to match stale state.
        expect(filter.filterIncoming("ABC")).toBe("ABC");
    });
});
