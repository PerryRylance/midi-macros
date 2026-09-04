import { ControlEvent, Event } from "@perry-rylance/midi";
import { isCallable, type EventsOrCallable } from "../types";

export default function channel(channel: number, input: EventsOrCallable)
{
    const result: Event[] = [];

    if(isCallable(input))
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
