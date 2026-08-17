import { expect, test } from "vitest";
import { interpolate } from "../src/Macros";

test("interpolant as expected", () => {

    const actual: number[] = [];
    const events = interpolate(100, 10, (delta, interpolant) => {
        actual.push(interpolant)
        return []; // NB: Satisfy types
    });

    expect(actual).toHaveLength(10);

    for(let i = 1; i <= actual.length; i++)
        expect(actual[i - 1]).toBeCloseTo(i * 0.1);

});
