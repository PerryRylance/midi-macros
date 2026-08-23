export const TERMINAL_OUTPUT_EVENT = "mm-terminal-output";

export function dispatchTerminalOutput(text: string): void {
    document.dispatchEvent(new CustomEvent<string>(TERMINAL_OUTPUT_EVENT, { detail: text }));
}

export const SOUNDFONT_LOADING_EVENT = "mm-soundfont-loading";

// Lets playback controls disable themselves while a (re)load is in flight,
// including reloads triggered by switching the SoundFont selection - not
// just the initial one.
export function dispatchSoundfontLoading(): void {
    document.dispatchEvent(new CustomEvent(SOUNDFONT_LOADING_EVENT));
}

export const SOUNDFONT_LOADED_EVENT = "mm-soundfont-loaded";

export interface SoundfontLoadedDetail {
    name: string;
    buffer: ArrayBuffer;
}

// Lets playback pick up whichever SoundFont the Audio tab most recently
// loaded, without needing to reach into its internals.
export function dispatchSoundfontLoaded(detail: SoundfontLoadedDetail): void {
    document.dispatchEvent(new CustomEvent<SoundfontLoadedDetail>(SOUNDFONT_LOADED_EVENT, { detail }));
}

export const BUILD_OUTPUT_EVENT = "mm-build-output";

export interface BuildOutputDetail {
    status: "success" | "error";
    message: string;
}

// Lets the playback engine report the result of rendering the editor's
// program to the "Output" tab, without it needing to know that tab exists.
export function dispatchBuildOutput(detail: BuildOutputDetail): void {
    document.dispatchEvent(new CustomEvent<BuildOutputDetail>(BUILD_OUTPUT_EVENT, { detail }));
}
