import { expect, test } from "vitest";
import ramp from "../src/macros/ramp";
import { TextEvent } from "@perry-rylance/midi";

test("interpolates linearly from start to end value by default", () => {

    const actual: number[] = [];

    ramp(100, 10, 0, 200, (delta, value) => {
        actual.push(value);
        return new TextEvent(delta);
    });

    expect(actual).toHaveLength(10);

    for(let i = 1; i <= actual.length; i++)
        expect(actual[i - 1]).toBeCloseTo(i * 20);

});

test("reaches the exact target value on the final step", () => {

    const actual: number[] = [];

    ramp(100, 4, 10, 50, (delta, value) => {
        actual.push(value);
        return new TextEvent(delta);
    });

    expect(actual[actual.length - 1]).toEqual(50);

});

test("supports descending ranges", () => {

    const actual: number[] = [];

    ramp(100, 10, 200, 0, (delta, value) => {
        actual.push(value);
        return new TextEvent(delta);
    });

    for(let i = 1; i <= actual.length; i++)
        expect(actual[i - 1]).toBeCloseTo(200 - (i * 20));

});

test("uses supplied easing function instead of linear interpolation", () => {

    const ease = (start: number, end: number, progress: number) => start + (end - start) * progress * progress;
    const actual: number[] = [];

    ramp(100, 10, 0, 100, (delta, value) => {
        actual.push(value);
        return new TextEvent(delta);
    }, ease);

    for(let i = 1; i <= actual.length; i++)
    {
        const progress = i / 10;
        expect(actual[i - 1]).toBeCloseTo(ease(0, 100, progress));
    }

});

test("generator receives index alongside interpolated value", () => {

    let expected = 0;

    ramp(100, 10, 0, 100, (delta, value, index) => {
        expect(index).toEqual(expected++);
        return new TextEvent(delta);
    });

});

test("delta sums to specified duration", () => {

    const events = ramp(1000, 13, 0, 1, (delta) => new TextEvent(delta));
    const total = events.reduce((sum, { delta }) => sum + delta, 0);

    expect(total).toEqual(1000);

});
