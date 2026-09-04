import type { Event } from "@perry-rylance/midi";

export type EventsOrCallable<Args extends unknown[] = []> = Event[] | ((...args: Args) => Event[]);

/**
 * Distinguishes the callback branch of EventsOrCallable from an events array.
 *
 * `typeof x === "function"` alone isn't safe here: @perry-rylance/midi's CallableArray (used by
 * Track.events, File.tracks) is a Proxy whose target is a function so it can double as a
 * setter, but it's otherwise a plain iterable array. `typeof` reports "function" for it too,
 * so callers must also check iterability to avoid mistaking such an array for a callback.
 */
export function isCallable<Args extends unknown[]>(input: EventsOrCallable<Args>): input is (...args: Args) => Event[]
{
    return typeof input === "function" && typeof (input as any)[Symbol.iterator] !== "function";
}
export type Interpolator = (start: number, end: number, progress: number) => number;
export type Generator<
  Args extends [delta: number, ...rest: unknown[]] = [delta: number]
> = (...args: Args) => Event | Event[];
