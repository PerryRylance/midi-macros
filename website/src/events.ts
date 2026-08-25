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
    status: "info" | "success" | "error";
    message: string;
}

// Lets the playback engine report progress/results of rendering and playing
// the editor's performance to the "Output" tab, without it needing to know
// that tab exists. Every line is appended, never replaces a previous one.
export function dispatchBuildOutput(detail: BuildOutputDetail): void {
    document.dispatchEvent(new CustomEvent<BuildOutputDetail>(BUILD_OUTPUT_EVENT, { detail }));
}

export const BUILD_OUTPUT_CLEAR_EVENT = "mm-build-output-clear";

// Lets a new Play run start from a clean Output tab, rather than piling onto
// whatever a previous run left behind.
export function dispatchBuildOutputClear(): void {
    document.dispatchEvent(new CustomEvent(BUILD_OUTPUT_CLEAR_EVENT));
}

export const UPLOAD_BUSY_EVENT = "mm-upload-busy";

// Lets playback controls disable themselves for the *entire* span of an
// upload (reading/validating the archive, npm ci, loading the new source
// into the editor) - not just the npm-busy sub-window within it, which
// webcontainer.ts's onNpmBusyChange alone wouldn't cover.
export function dispatchUploadBusy(): void {
    document.dispatchEvent(new CustomEvent(UPLOAD_BUSY_EVENT));
}

export const UPLOAD_IDLE_EVENT = "mm-upload-idle";

export function dispatchUploadIdle(): void {
    document.dispatchEvent(new CustomEvent(UPLOAD_IDLE_EVENT));
}

export const EDITOR_CHANGED_EVENT = "mm-editor-changed";

// Fires on every content change (typed or programmatic, e.g. setSource()) -
// lets autosave.ts debounce its own save without mm-editor needing to know
// autosave exists.
export function dispatchEditorChanged(): void {
    document.dispatchEvent(new CustomEvent(EDITOR_CHANGED_EVENT));
}
