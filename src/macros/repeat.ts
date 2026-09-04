import type { Event } from "@perry-rylance/midi";
import { isCallable, type EventsOrCallable } from "../types";

/**
 * Repeats the input count number of times
 * @param count The number of repeats, in musical terms. Zero will return an empty array, one will return the same events, two will return two repeats
 * @param input An array of events or a callback that receives the repeat index and returns an array of events
 * @returns The repeated events
 */
const repeat = (count: number, input: EventsOrCallable<[i: number]>): Event[] =>
{
    const result = [];

    if(!Number.isInteger(count))
        throw new Error("Fractional repeat count not supported");

    for(let i = 0; i < count; i++)
    {
        if(isCallable(input))
            result.push(...input(i));
        else
            result.push(...input);
    }

    return result;
}

export default repeat;
