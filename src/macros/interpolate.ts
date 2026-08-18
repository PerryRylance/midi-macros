import type { Event } from "@perry-rylance/midi";
import type { Generator } from "../types";
import partition from "./partition";

/**
 * Makes a partition of parts over duration using the generator supplied. Please note that the interpolant will always be non-zero. It is assumed that you have already set the initial conditions outside the call, or will do so on index zero.
 * @param duration Number of ticks the interpolation should take place over
 * @param parts Number of parts or steps the interpolation should be divided into
 * @param generator Callback function taking the delta and interpolant and returning one or more events
 * @returns The generated events
 */
export default function interpolate(duration: number, parts: number, generator: Generator<[delta: number, interpolant: number, index: number]>): Event[]
{
    let absolute = 0;

    return partition(duration, parts, (delta: number, index: number) => {
        absolute += delta;
        return generator(delta, absolute / duration, index);
    });
}
