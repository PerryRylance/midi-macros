import { beforeEach, describe, expect, it } from "vitest";
import { clearModified, isModified, markModified, onModifiedChange } from "../src/modifiedState";

// modifiedState.ts holds its "modified" flag in module-level state, so each
// test resets it back to false first rather than relying on import order.
beforeEach(() => {
    clearModified();
});

describe("isModified / markModified / clearModified", () => {
    it("starts out not modified", () => {
        expect(isModified()).toBe(false);
    });

    it("reports modified after markModified()", () => {
        markModified();

        expect(isModified()).toBe(true);
    });

    it("reports not modified again after clearModified()", () => {
        markModified();
        clearModified();

        expect(isModified()).toBe(false);
    });
});

describe("onModifiedChange", () => {
    it("notifies a subscriber immediately with the current state", () => {
        const states: boolean[] = [];

        onModifiedChange(modified => states.push(modified));

        expect(states).toEqual([false]);
    });

    it("notifies on each transition", () => {
        const states: boolean[] = [];

        onModifiedChange(modified => states.push(modified));

        markModified();
        clearModified();

        expect(states).toEqual([false, true, false]);
    });

    it("does not notify when set to the same value it already holds", () => {
        markModified();

        const states: boolean[] = [];
        onModifiedChange(modified => states.push(modified));

        markModified();

        expect(states).toEqual([true]);
    });

    it("stops notifying once unsubscribed", () => {
        const states: boolean[] = [];
        const unsubscribe = onModifiedChange(modified => states.push(modified));

        unsubscribe();
        markModified();

        expect(states).toEqual([false]);
    });
});
