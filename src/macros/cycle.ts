import type { Generator } from "./types";
import { interpolate } from "./interpolate";

/**
 * Cycle a wave function over a duration, useful for effects like tremolo and vibrato
 * @param duration Time over which the cycles take place
 * @param parts Granularity of the cycle, number of parts to break duration up into
 * @param period The number of ticks to complete a full 360° revolution
 * @param generator Callback that receives the event delta and the output from the wave function
 * @param wave The wave function, defaults to sine
 * @returns The generated events
 */
export function cycle(duration: number, parts: number, period: number, generator: Generator<[delta: number, value: number]>, wave: (angle: number) => number = Math.sin)
{
    return interpolate(duration, parts, (delta, interpolant) => generator(delta, wave(interpolant * (duration / period) * 2 * Math.PI)));
}
