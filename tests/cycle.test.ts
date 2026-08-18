import { expect, test } from "vitest";
import { cycle } from "../src/macros";
import { TextEvent } from "@perry-rylance/midi";

test("completes one full sine revolution when duration equals period", () => {

    const actual: number[] = [];

    cycle(100, 4, 100, (delta, value) => {
        actual.push(value);
        return new TextEvent(delta);
    });

    expect(actual).toHaveLength(4);

    expect(actual[0]).toBeCloseTo(1);   // 25 ticks of 100: quarter revolution, 90°
    expect(actual[1]).toBeCloseTo(0);   // 50 ticks of 100: half revolution, 180°
    expect(actual[2]).toBeCloseTo(-1);  // 75 ticks of 100: three-quarter revolution, 270°
    expect(actual[3]).toBeCloseTo(0);   // 100 ticks of 100: full revolution, 360°

});

test("passes an angle in radians derived from ticks elapsed over the period", () => {

    const actual: number[] = [];

    cycle(200, 4, 100, (delta, value) => {
        actual.push(value);
        return new TextEvent(delta);
    }, angle => angle);

    // Ticks elapsed at each step: 50, 100, 150, 200. Period is 100 ticks per revolution,
    // so the angle should be 2π * (ticks elapsed / period), regardless of duration.
    expect(actual[0]).toBeCloseTo(Math.PI);
    expect(actual[1]).toBeCloseTo(2 * Math.PI);
    expect(actual[2]).toBeCloseTo(3 * Math.PI);
    expect(actual[3]).toBeCloseTo(4 * Math.PI);

});

test("only completes a fraction of a revolution when period exceeds duration", () => {

    const actual: number[] = [];

    cycle(50, 1, 200, (delta, value) => {
        actual.push(value);
        return new TextEvent(delta);
    });

    // 50 of 200 ticks elapsed: quarter revolution, 90°
    expect(actual[0]).toBeCloseTo(1);

});

test("completes multiple full cycles when duration spans several periods", () => {

    const actual: number[] = [];

    cycle(300, 12, 100, (delta, value) => {
        actual.push(value);
        return new TextEvent(delta);
    });

    // duration is 3 full periods of 100 ticks, sampled 12 times: 3 complete sine cycles
    const expected = [1, 0, -1, 0, 1, 0, -1, 0, 1, 0, -1, 0];

    expect(actual).toHaveLength(12);

    for(let i = 0; i < expected.length; i++)
        expect(actual[i]).toBeCloseTo(expected[i]!);

});

test("uses a custom wave function in place of the default sine", () => {

    const wave = (angle: number) => angle;
    const actual: number[] = [];

    cycle(100, 2, 100, (delta, value) => {
        actual.push(value);
        return new TextEvent(delta);
    }, wave);

    expect(actual[0]).toBeCloseTo(Math.PI);
    expect(actual[1]).toBeCloseTo(2 * Math.PI);

});

test("delta sums to specified duration", () => {

    const events = cycle(1000, 13, 250, (delta) => new TextEvent(delta));
    const total = events.reduce((sum, { delta }) => sum + delta, 0);

    expect(total).toEqual(1000);

});
