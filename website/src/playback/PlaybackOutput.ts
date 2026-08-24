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
    // Current playback position in milliseconds, for syncing UI (e.g. editor
    // highlighting) to playback - an output with nothing loaded/playing yet
    // just returns 0.
    getCurrentTime(): number;
    // Called when the loaded song finishes playing on its own (not when the
    // user presses Stop, which callers already know about directly) - an
    // output that can't report this simply never calls back.
    onEnded(callback: () => void): void;
}
