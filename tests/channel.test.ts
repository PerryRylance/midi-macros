import { Event, NoteOnEvent, SysExEvent, TextEvent } from "@perry-rylance/midi";
import { expect, test } from "vitest";
import channel from "../src/macros/channel";

test("sets all control events channel when called with array", () => {

    const actual = channel(2, [
        new NoteOnEvent()
    ]);

    expect(actual[0]).toBeInstanceOf(NoteOnEvent);
    expect((actual[0] as NoteOnEvent).channel).toLooseEqual(2);

});

test("sets all control events channel when called with function", () => {

    const actual = channel(9, () => {

        const events: Event[] = [];

        for(let i = 0; i < 16; i++)
            events.push(new NoteOnEvent().channel(i).key(35 + i));

        return events;

    });

    expect(actual).toHaveLength(16);

    for(const event of actual)
    {
        expect(event).toBeInstanceOf(NoteOnEvent);
        expect((event as NoteOnEvent).channel).toLooseEqual(9);
    }

});

test("ignores meta events", () => {

    const expected = [new TextEvent().text("MIDI is cool")];
    const actual = channel(1, expected);

    expect(actual[0]).toBe(expected[0]);

});

test("ignores sysex events", () => {

    const expected = [new SysExEvent()];
    const actual = channel(1, expected);

    expect(actual[0]).toBe(expected[0]);

});

test("throws on out of range number", () => {

    expect(() => channel(-1, [new NoteOnEvent])).toThrow(RangeError);
    expect(() => channel(16, [new NoteOnEvent])).toThrow(RangeError);

});

test("throws on floating point number", () => {

    expect(() => channel(1.23, [new NoteOnEvent])).toThrow(Error);

});
