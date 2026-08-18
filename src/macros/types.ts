import type { Event } from "@perry-rylance/midi";

export type EventsOrCallable<Args extends unknown[] = []> = Event[] | ((...args: Args) => Event[]);
export type Interpolator = (start: number, end: number, progress: number) => number;
export type Generator<
  Args extends [delta: number, ...rest: unknown[]] = [delta: number]
> = (...args: Args) => Event | Event[];
