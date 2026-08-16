import { NoteOffEvent, NoteOnEvent } from "@perry-rylance/midi";
import { expect, test } from "vitest";
import { repeat } from "../src/Macros";

const events = [
    new NoteOnEvent().key(60),
    new NoteOffEvent().delta(120).key(60)
];

test("repeats twice by default", () => {

    const actual = repeat(events);

    expect(actual).toHaveLength(4);

    for(let i = 0; i < 4; i += 2)
    {
        expect(actual[i]).toBeInstanceOf(NoteOnEvent);
        expect((actual[i] as NoteOnEvent).key).toLooseEqual(60);

        expect(actual[i + 1]).toBeInstanceOf(NoteOffEvent);
        expect((actual[i + 1] as NoteOffEvent).delta).toLooseEqual(120);
        expect((actual[i + 1] as NoteOffEvent).key).toLooseEqual(60);
    }

});

test("repeats specified number of times", () => {

    const actual = repeat(events, 3);

    expect(actual).toHaveLength(6);

    for(let i = 0; i < 6; i += 2)
    {
        expect(actual[i]).toBeInstanceOf(NoteOnEvent);
        expect((actual[i] as NoteOnEvent).key).toLooseEqual(60);

        expect(actual[i + 1]).toBeInstanceOf(NoteOffEvent);
        expect((actual[i + 1] as NoteOffEvent).delta).toLooseEqual(120);
        expect((actual[i + 1] as NoteOffEvent).key).toLooseEqual(60);
    }

});

test("repeating array yields same event instances", () => {

    const actual = repeat(events);

    expect(actual[0]).toBe(actual[2]);
    expect(actual[1]).toBe(actual[3]);

});

test("repeating with callback yields different instances", () => {

    const actual = repeat(() => [
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(120).key(60)
    ], 2);

    expect(actual[0]).not.toBe(actual[2]);
    expect(actual[1]).not.toBe(actual[3]);

});

test("throws if fractional count supplied", () => {

    expect(() => repeat(events, 1.5)).toThrow();

});
