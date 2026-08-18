import { Event, Track } from "@perry-rylance/midi";
import InvalidNumberOfPartsError from "./errors/InvalidNumberOfPartsError";
import UnexpectedSumDeltaError from "./errors/UnexpectedSumDeltaError";
import TrackCollection from "@perry-rylance/midi/dist/TrackCollection";

export type EventsOrCallable<Args extends unknown[] = []> = Event[] | ((...args: Args) => Event[]);
export type Interpolator = (start: number, end: number, progress: number) => number;
export type Generator<
  Args extends [delta: number, ...rest: unknown[]] = [delta: number]
> = (...args: Args) => Event | Event[];

export const lerp: Interpolator = (start, end, progress) => {
    return (end * progress) + (start * (1 - progress));
}

/**
 * Repeats the input count number of times
 * @param count The number of repeats, in musical terms. Zero will return an empty array, one will return the same events, two will return two repeats
 * @param input An array of events or a callback that receives the repeat index and returns an array of events
 * @returns The repeated events
 */
export const repeat = (count: number, input: EventsOrCallable<[i: number]>): Event[] =>
{
    const result = [];

    if(!Number.isInteger(count))
        throw new Error("Fractional repeat count not supported");

    for(let i = 0; i < count; i++)
    {
        if(typeof input === "function")
            result.push(...input(i));
        else
            result.push(...input);
    }

    return result;
}

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

/**
 * Makes a partition of parts over duration using the generator supplied. Please note that the interpolant will always be non-zero. It is assumed that you have already set the initial conditions outside the call, or will do so on index zero.
 * @param duration Number of ticks the interpolation should take place over
 * @param parts Number of parts or steps the interpolation should be divided into
 * @param generator Callback function taking the delta and interpolant and returning one or more events
 * @returns The generated events
 */
export function interpolate(duration: number, parts: number, generator: Generator<[delta: number, interpolant: number, index: number]>): Event[]
{
    let absolute = 0;

    return partition(duration, parts, (delta: number, index: number) => {
        absolute += delta;
        return generator(delta, absolute / duration, index);
    });
}

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

/**
 * Takes multiple lines of events and turns them into a single line, useful for things like syncopation and claves
 * @param lines Each line should be an array of events
 * @returns The combined lines as a flat array of events
 */
export function parallel(lines: Event[][]): Event[]
{
    const tracks = new TrackCollection(...lines.map(events => new Track().events(events)));

    tracks.flatten({ appendEndOfTrackEvent: false });

    if(tracks.length !== 1)
        throw new Error();

    return tracks[0]!.events;
}
