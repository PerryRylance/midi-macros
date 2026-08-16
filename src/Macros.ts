import { Event } from "@perry-rylance/midi";

export type EventsOrCallable = Event[] | ((temp: string) => Event[]);
export type Interpolator = (start: number, end: number, progress: number) => number;
export type Generator = (delta: number) => Event | Event[];

export const lerp: Interpolator = (start, end, progress) => {
    return (end * progress) + (start * (1 - progress));
}

export const repeat = (input: EventsOrCallable, count: number = 2): Event[] =>
{
    const result = [];

    if(!Number.isInteger(count))
        throw new Error("Fractional repeat count not supported");

    for(let i = 0; i < count; i++)
    {
        if(typeof input === "function")
            result.push(...input(count));
        else
            result.push(...input);
    }

    return result;
}

export function partition(duration: number, parts: number, generator: Generator): Event[]
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
        const generated = generator(delta);

        if(Array.isArray(generated))
            result.push(...generated);
        else
            result.push(generated);
    }

    return result;
}

export function interpolate()
{

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
