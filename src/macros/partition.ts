import type { Event } from "@perry-rylance/midi";
import InvalidNumberOfPartsError from "../errors/InvalidNumberOfPartsError";
import UnexpectedSumDeltaError from "../errors/UnexpectedSumDeltaError";
import type { Generator } from "./types";

// TODO: Support callback for t - so time can be non-linear
/**
 * Partitions the supplied duration into the supplied number of parts, then calls the generator with the delta and index for the events. The expectation is for the caller to give back one or more events whos sum delta equals the given delta.
 * @param duration Number of ticks the interpolation should take place over
 * @param parts Number of parts or steps the interpolation should be divided into
 * @param generator Callback function taking the delta and interpolant and returning one or more events
 * @returns The generated events
 */
export function partition(duration: number, parts: number, generator: Generator<[delta: number, index: number]>): Event[]
{
    if(!Number.isInteger(duration) || !Number.isInteger(parts))
        throw new InvalidNumberOfPartsError("Fractional duration or parts not supported");

    if(parts <= 0)
        throw new InvalidNumberOfPartsError("Parts must be greater than zero");

    if(parts > duration)
        throw new InvalidNumberOfPartsError("Parts cannot exceed duration");

    const result: Event[] = [];
    const base = Math.floor(duration / parts);
    const remainder = duration % parts;

    for(let i = 0; i < parts; i++)
    {
        const delta = base + (i < remainder ? 1 : 0);
        const generated = generator(delta, i);

        // TODO: Might not play well with fluent API, might need to check if instanceof Event instead
        if(Array.isArray(generated))
        {
            if(generated.reduce((sum, { delta }) => sum + delta, 0) != delta)
                throw new UnexpectedSumDeltaError();

            result.push(...generated);
        }
        else
        {
            if(generated.delta != delta)
                throw new UnexpectedSumDeltaError();

            result.push(generated);
        }

    }

    return result;
}
