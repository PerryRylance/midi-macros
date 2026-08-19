import { ControllerEvent, ControllerType, File, Format, NoteOffEvent, NoteOnEvent, Track, Event, EndOfTrackEvent, ProgramChangeEvent, ProgramType, PitchWheelEvent } from "@perry-rylance/midi";
import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import cycle from "../src/macros/cycle";

const ppqn = 96;

const generators: Record<string, () => Event[]> = {
    tremolo: () => {
        const beats = 4;
        const type = ControllerType.EXPRESSION_COARSE2;
        const depth = 63;

        return [
            new ProgramChangeEvent()
                .program(ProgramType.FLUTE),
            new NoteOnEvent()
                .key(60),
            ...cycle(
                ppqn * beats, 
                ppqn * beats, 
                ppqn / 4, 
                (delta, value) => new ControllerEvent(delta)
                    .controller(type)
                    .value(
                        64 + Math.round(value * depth) // TODO: This should guard against out of range values, I think it's only checking up to 0xFF at the minute
                    ),
                Math.cos
            ),
            new ControllerEvent()
                .controller(type)
                .value(127),
            new NoteOffEvent()
                .key(60)
        ];
    },
    vibrato: () => {
        const beats = 4;
        const depth = .5;

        return [
            new ProgramChangeEvent()
                .program(ProgramType.FLUTE),
            new NoteOnEvent()
                .key(60),
            ...cycle(
                ppqn * beats, 
                ppqn * beats, 
                ppqn / 4, 
                (delta, value) => new PitchWheelEvent(delta)
                    .amount(
                        .5 + value * depth
                    ),
                Math.sin
            ),
            new NoteOffEvent()
                .key(60)
        ];
    }
}

for(const name in generators)
{
    const events = generators[name]!();
    const file = new File()
        .tracks([
            new Track().events([
                ...events,
                new EndOfTrackEvent
            ])
        ]);
    
    file.resolution.ticksPerQuarterNote = ppqn;

    const buffer = file.toArrayBuffer();

    writeFileSync(join(import.meta.dirname, `${name}.mid`), Buffer.from(buffer));
}
