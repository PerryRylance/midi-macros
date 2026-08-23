export const TERMINAL_OUTPUT_EVENT = "mm-terminal-output";

export function dispatchTerminalOutput(text: string): void {
    document.dispatchEvent(new CustomEvent<string>(TERMINAL_OUTPUT_EVENT, { detail: text }));
}

export const SOUNDFONT_LOADED_EVENT = "mm-soundfont-loaded";

export interface SoundfontLoadedDetail {
    name: string;
    buffer: ArrayBuffer;
}

// Lets the (future) playback step pick up whichever SoundFont the Audio tab
// most recently loaded, without needing to reach into its internals.
export function dispatchSoundfontLoaded(detail: SoundfontLoadedDetail): void {
    document.dispatchEvent(new CustomEvent<SoundfontLoadedDetail>(SOUNDFONT_LOADED_EVENT, { detail }));
}
