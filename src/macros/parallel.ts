import { Event, Track } from "@perry-rylance/midi";
import TrackCollection from "@perry-rylance/midi/dist/TrackCollection";

/**
 * Takes multiple lines of events and turns them into a single line, useful for things like syncopation and claves
 * @param lines Each line should be an array of events
 * @returns The combined lines as a flat array of events
 */
export default function parallel(lines: Event[][]): Event[]
{
    const tracks = new TrackCollection(...lines.map(events => new Track().events(events)));

    tracks.flatten({ appendEndOfTrackEvent: false });

    if(tracks.length !== 1)
        throw new Error();

    // NB: Track.events is a CallableArray (see @perry-rylance/midi), not a plain array - it must
    // be spread into a real array here, otherwise callers relying on EventsOrCallable's
    // typeof-based branching (e.g. channel(), repeat()) misidentify it as a callback.
    return [...tracks[0]!.events];
}
