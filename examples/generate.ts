import { ControllerEvent, ControllerType, File, Format, NoteOffEvent, NoteOnEvent, Track, Event, EndOfTrackEvent, ProgramChangeEvent, ProgramType, PitchWheelEvent } from "@perry-rylance/midi";
import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import cycle from "../src/macros/cycle";
import partition from "../src/macros/partition";
import parallel from "../src/macros/parallel";

const SOUND_BANK_URL = "https://raw.githubusercontent.com/arbruijn/TimGM6mb/master/TimGM6mb.sf2";

const generatedDir = join(import.meta.dirname, "generated");
const midiDir = join(generatedDir, "midi");
const soundBankPath = join(generatedDir, "soundfont", "TimGM6mb.sf2");

const ppqn = 96;

const generators: Record<string, () => Event[]> = {
    major: () => {
        const ascending = [0, 2, 4, 5, 7, 9, 11, 12];
        const descending = [...ascending].reverse();
        const root = 60;

        return [...ascending, ...descending].flatMap(semitone => [
            new NoteOnEvent().key(root + semitone),
            new NoteOffEvent().delta(ppqn).key(root + semitone)
        ]);
    },
    contrary: () => {
        const ascending = [0, 2, 4, 5, 7, 9, 11, 12];
        const descending = [...ascending].reverse();
        const root = 60;

        const right = [...ascending, ...descending];
        const left = [...descending, ...ascending];

        const scale = (semitone: number, left: boolean) => [
            new NoteOnEvent().key(root + (left ? -12 : 0) + semitone),
            new NoteOffEvent().delta(ppqn).key(root + (left ? -12 : 0) + semitone)
        ];

        return parallel([
            right.flatMap(semitone => scale(semitone, true)),
            left.flatMap(semitone => scale(semitone, false))
        ]);
    },
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

async function main()
{
    mkdirSync(midiDir, { recursive: true });

    if (!existsSync(soundBankPath)) {
        mkdirSync(join(generatedDir, "soundfont"), { recursive: true });

        const response = await fetch(SOUND_BANK_URL);
        const soundBank = await response.arrayBuffer();

        writeFileSync(soundBankPath, Buffer.from(soundBank));
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

        writeFileSync(join(midiDir, `${name}.mid`), Buffer.from(buffer));
    }

    writeFileSync(join(generatedDir, "manifest.json"), JSON.stringify(Object.keys(generators)));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
