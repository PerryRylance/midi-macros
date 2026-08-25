import { NoteOnEvent, NoteOffEvent, Track, File } from "@perry-rylance/midi";

export default new File().tracks([
    new Track().events([
        new NoteOnEvent().key(60),
        new NoteOffEvent().delta(480).key(60)
    ])
]);

