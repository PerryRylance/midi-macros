import { ControlEvent, Event } from "@perry-rylance/midi";
import type { EventsOrCallable } from "../types";

export default function channel(channel: number, input: EventsOrCallable)
{
    const result: Event[] = [];

    if(typeof input === "function")
        result.push(...input());
    else
        result.push(...input);

    result.forEach(event => {
        if(!(event instanceof ControlEvent))
            return true;

        event.channel = channel;
    });

    return result;
}
