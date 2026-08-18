import type { Event } from "@perry-rylance/midi";
import type { Generator, Interpolator } from "./types";
import { lerp } from "./lerp";
import { interpolate } from "./interpolate";

/**
 * Convenience function for making a linear ramp from one value to another
 * @param duration Number of ticks the interpolation should take place over
 * @param parts Number of parts or steps the interpolation should be divided into
 * @param from Starting value
 * @param to Ending value
 * @param generator Callback function taking the delta and interpolated value, and returning one or more events
 * @param ease Optinal easing function, defaults to linear
 * @returns
 */
export function ramp(duration: number, parts: number, from: number, to: number, generator: Generator<[delta: number, value: number, index: number]>, ease: Interpolator = lerp): Event[]
{
    return interpolate(duration, parts, (delta, interpolant, index) => generator(delta, ease(from, to, interpolant), index));
}
