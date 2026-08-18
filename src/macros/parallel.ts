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

    return tracks[0]!.events;
}
