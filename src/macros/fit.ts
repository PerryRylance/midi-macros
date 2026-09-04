import type { Event } from "@perry-rylance/midi";
import { isCallable, type EventsOrCallable, type Generator } from "../types";

/**
 * Truncates the input events to a duration. Events are kept, as the same instances, for as
 * long as their cumulative delta (including their own) does not exceed duration. The first
 * event that would cross duration, and everything after it, is dropped entirely.
 *
 * MIDI delta is the time *before* an event fires, so shortening a kept event's delta to make
 * it fit would change when it actually sounds rather than just cutting the timeline - hence
 * dropping instead of clipping.
 * @param duration Maximum number of ticks the returned events may span, in total delta
 * @param input An array of events or a callback that returns an array of events
 * @param remainder Called once with the ticks left over (duration minus the summed delta of
 * kept events). Returns one or more events to do something with that gap, e.g. a SysEx event
 * used as a delay
 * @returns The truncated events, followed by whatever remainder returns
 */
export default function truncate(duration: number, input: EventsOrCallable, remainder: Generator<[remainder: number]>): Event[]
{
    if(!Number.isInteger(duration) || duration < 0)
        throw new Error("Duration must be a non-negative integer");

    const events = isCallable(input) ? input() : input;
    const result: Event[] = [];
    let cumulative = 0;

    for(const event of events)
    {
        if(cumulative + event.delta > duration)
            break;

        result.push(event);
        cumulative += event.delta;
    }

    const generated = remainder(duration - cumulative);
    result.push(...(Array.isArray(generated) ? generated : [generated]));

    return result;
}
