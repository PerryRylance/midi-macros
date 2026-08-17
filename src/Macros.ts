import { Event } from "@perry-rylance/midi";

export type EventsOrCallable<Args extends unknown[] = []> = Event[] | ((...args: Args) => Event[]);
export type Interpolator = (start: number, end: number, progress: number) => number;
export type Generator<
  Args extends [delta: number, ...rest: unknown[]] = [delta: number]
> = (...args: Args) => Event | Event[];

export const lerp: Interpolator = (start, end, progress) => {
    return (end * progress) + (start * (1 - progress));
}

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
export function partition(duration: number, parts: number, generator: Generator<[delta: number, index: number]>): Event[]
{
    if(!Number.isInteger(duration) || !Number.isInteger(parts))
        throw new Error("Fractional duration or parts not supported");

    if(parts <= 0)
        throw new Error("Parts must be greater than zero");

    if(parts > duration)
        throw new Error("Parts cannot exceed duration");

    const result: Event[] = [];
    const base = Math.floor(duration / parts);
    const remainder = duration % parts;

    for(let i = 0; i < parts; i++)
    {
        const delta = base + (i < remainder ? 1 : 0);
        const generated = generator(delta, i);

        if(Array.isArray(generated)) // TODO: Might not play well with fluent API, might need to check if instanceof Event instead
            result.push(...generated);
        else
            result.push(generated);
    }

    return result;
}

// TODO: Add index folks probs going to want it for lookups
/**
 * Makes a partition of parts over duration using the generator supplied. Please note that the interpolant will always be non-zero. It is assumed that you have already set the initial conditions outside the call, or will do so on index zero.
 * @param duration Number of ticks the interpolation should take place over
 * @param parts Number of parts or steps the interpolation should be divided into
 * @param generator Callback function taking the delta and interpolant and returning one or more events
 * @returns 
 */
export function interpolate(duration: number, parts: number, generator: Generator<[delta: number, interpolant: number, index: number]>)
{
    let absolute = 0;
    let index = 0;

    return partition(duration, parts, (delta: number, index: number) => {
        absolute += delta;
        return generator(delta, absolute / duration, index);
    });
}

export function ramp()
{
}

export function vibrato()
{

}

export function tremolo()
{

}

export function parallel(lines: Event[][])
{

}

/*export default class Macros
{
    constructor(private readonly ppqn: number) {}

    repeat(events: Event[], count: number = 2): Event[]
    {
        const result = [];

        for(let i = 0; i < count; i++)
            result.push(...events);

        return result;
    }

    ramp(generator: (delta: number, value: number) => Event, start: number, end: number, duration: number, steps?: number): Event[]
    {
        const result: Event[] = [];

        if(!steps)
            steps = Math.round(duration / (this.ppqn / 64));

        // TODO: Handle drift / floating point accumulation
        const delta = Math.round(duration / steps);
        
        for(let i = 0; i < steps; i++)
        {
            const interpolation = i / (steps - 1);
            const value = (end * interpolation) - (start * (1 - interpolation));
            const event = generator(delta, value);

            result.push(event);
        }

        return result;
    }
}
*/
