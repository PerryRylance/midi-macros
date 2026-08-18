import { NoteOffEvent, NoteOnEvent } from "@perry-rylance/midi";
import { expect, test } from "vitest";
import parallel from "../src/macros/parallel";

test("merges two lines of events sorted by absolute time", () => {

    const a1 = new NoteOnEvent().key(60);
    const a2 = new NoteOffEvent().delta(100).key(60);

    const b1 = new NoteOnEvent().delta(50).key(64);
    const b2 = new NoteOffEvent().delta(100).key(64);

    const actual = parallel([
        [a1, a2],
        [b1, b2]
    ]);

    expect(actual).toHaveLength(4);

    expect(actual[0]).toBe(a1);
    expect(actual[1]).toBe(b1);
    expect(actual[2]).toBe(a2);
    expect(actual[3]).toBe(b2);

    expect(a1.delta).toLooseEqual(0);
    expect(b1.delta).toLooseEqual(50);
    expect(a2.delta).toLooseEqual(50);
    expect(b2.delta).toLooseEqual(50);

});

test("preserves line order for events at the same absolute time", () => {

    const a = new NoteOnEvent().key(60);
    const b = new NoteOnEvent().key(64);

    const actual = parallel([
        [a],
        [b]
    ]);

    expect(actual[0]).toBe(a);
    expect(actual[1]).toBe(b);

});

test("total delta reflects the longest combined timeline", () => {

    const events = parallel([
        [new NoteOnEvent(), new NoteOffEvent().delta(100)],
        [new NoteOnEvent().delta(50), new NoteOffEvent().delta(200)]
    ]);

    const total = events.reduce((sum, { delta }) => sum + delta, 0);

    expect(total).toEqual(250);

});

test("single line passes through unchanged", () => {

    const original = [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(120).key(60)
    ];

    const actual = parallel([original]);

    expect(actual).toHaveLength(2);

    expect(actual[0]).toBe(original[0]);
    expect(actual[1]).toBe(original[1]);

    expect((actual[1] as NoteOffEvent).delta).toLooseEqual(120);

});

test("returns an empty array when no lines are supplied", () => {

    expect(parallel([])).toHaveLength(0);

});
