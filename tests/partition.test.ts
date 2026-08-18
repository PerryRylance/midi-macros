import { Event, NoteOffEvent, NoteOnEvent, TextEvent } from "@perry-rylance/midi";
import { expect, test } from "vitest";
import { partition } from "../src/macros";
import InvalidNumberOfPartsError from "../src/errors/InvalidNumberOfPartsError";
import UnexpectedSumDeltaError from "../src/errors/UnexpectedSumDeltaError";

const getTotalDelta = (events: Event[]) => events.reduce((sum, { delta }) => sum + delta, 0);

test("generator receives index", () => {

    let expected = 0;

    partition(1000, 10, (delta, index) => {
        expect(index).toEqual(expected++);
        return new TextEvent(delta);
    });

});

test.each([7, 13, 101])("delta for %d parts sums to specified duration", (parts) => {

    const expected = 1000;
    const events = partition(expected, parts, (delta) => new NoteOnEvent(delta));
    const actual = getTotalDelta(events);

    expect(actual).toEqual(expected);

});

test("generator can yield multiple events", () => {

    const events = partition(1000, 10, (delta) => [
        new NoteOnEvent().key(60),
        new NoteOffEvent().key(60).delta(100)
    ]);

    for(let i = 0; i < 20; i += 2)
    {
        expect(events[i]).toBeInstanceOf(NoteOnEvent);
        expect(events[i + 1]).toBeInstanceOf(NoteOffEvent);
    }

    expect(getTotalDelta(events)).toEqual(1000);

});

test("throws if parts is greater than duration", () => {

    expect(() => partition(100, 101, () => [])).toThrow(InvalidNumberOfPartsError);

});


test("throws if delta not respected generating single event", () => {

    expect(() => partition(1, 1, () => new NoteOnEvent)).toThrow(UnexpectedSumDeltaError);

});

test("throws if delta not respected generating multiple events", () => {

    expect(() => partition(10, 10, () => new NoteOnEvent(50))).toThrow(UnexpectedSumDeltaError);

});
