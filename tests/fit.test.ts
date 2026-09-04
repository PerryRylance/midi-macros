import { Event, NoteOffEvent, NoteOnEvent, TextEvent } from "@perry-rylance/midi";
import { expect, test } from "vitest";
import fit from "../src/macros/fit";

const noop = () => [] as Event[];

test("keeps events that fit entirely within duration, same instances", () => {

    const events = [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(100).key(60)
    ];

    const actual = fit(1000, events, noop);

    expect(actual).toHaveLength(2);
    expect(actual[0]).toBe(events[0]);
    expect(actual[1]).toBe(events[1]);

});

test("keeps the boundary event unchanged when it exactly fills duration", () => {

    const events = [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(100).key(60)
    ];

    const actual = fit(100, events, noop);

    expect(actual).toHaveLength(2);
    expect(actual[1]).toBe(events[1]);
    expect((actual[1] as NoteOffEvent).delta).toLooseEqual(100);

});

test("drops the event that would cross the duration boundary, and everything after it", () => {

    const events = [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(120).key(60),
        new NoteOnEvent().delta(50).key(64)
    ];

    const actual = fit(50, events, noop);

    expect(actual).toHaveLength(1);
    expect(actual[0]).toBe(events[0]);

});

test("does not alter the delta of a dropped event", () => {

    const events = [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(120).key(60)
    ];

    fit(50, events, noop);

    expect((events[1] as NoteOffEvent).delta).toLooseEqual(120);

});

test("calls remainder with the ticks left over once events are dropped", () => {

    const events = [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(120).key(60)
    ];

    let received: number | undefined;

    fit(50, events, (remainder) => {
        received = remainder;
        return [];
    });

    expect(received).toEqual(50);

});

test("calls remainder with the ticks left over when nothing is dropped", () => {

    const events = [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(100).key(60)
    ];

    let received: number | undefined;

    fit(1000, events, (remainder) => {
        received = remainder;
        return [];
    });

    expect(received).toEqual(900);

});

test("calls remainder with zero when the events exactly fill duration", () => {

    const events = [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(100).key(60)
    ];

    let received: number | undefined;

    fit(100, events, (remainder) => {
        received = remainder;
        return [];
    });

    expect(received).toEqual(0);

});

test("appends the event returned by remainder", () => {

    const events = [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(120).key(60)
    ];

    const filler = new TextEvent(50).text("filled");

    const actual = fit(50, events, () => filler);

    expect(actual).toHaveLength(2);
    expect(actual[1]).toBe(filler);

});

test("appends multiple events returned by remainder", () => {

    const events = [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(120).key(60)
    ];

    const fillers = [
        new TextEvent(30).text("a"),
        new TextEvent(20).text("b")
    ];

    const actual = fit(50, events, () => fillers);

    expect(actual).toHaveLength(3);
    expect(actual[1]).toBe(fillers[0]);
    expect(actual[2]).toBe(fillers[1]);

});

test("accepts a callback that returns events as the input", () => {

    const actual = fit(50, () => [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(120).key(60)
    ], noop);

    expect(actual).toHaveLength(1);

});

test("returns an empty array when no events are supplied and remainder returns nothing", () => {

    expect(fit(100, [], noop)).toHaveLength(0);

});

test("calls remainder with the full duration when no events are supplied", () => {

    let received: number | undefined;

    fit(100, [], (remainder) => {
        received = remainder;
        return [];
    });

    expect(received).toEqual(100);

});

test("throws if duration is fractional", () => {

    expect(() => fit(1.5, [], noop)).toThrow();

});

test("throws if duration is negative", () => {

    expect(() => fit(-1, [], noop)).toThrow();

});
