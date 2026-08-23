// Abstraction over "something that can play back a rendered MIDI file", so
// alternative output implementations (a different synth, a MIDI-out device,
// a silent renderer for tests) can be swapped in without touching the
// controls that drive them.
export interface PlaybackOutput {
    addSoundBank(id: string, buffer: ArrayBuffer): Promise<void>;
    load(midi: ArrayBuffer, fileName: string): void;
    play(): void;
    pause(): void;
    stop(): void;
}
