import { createElement, Pause, Play, Square } from "lucide";
import { bootWebContainer } from "../webcontainer";
import { startTsServer } from "../tsServer";
import { evaluatePerformance, type TimelineEntry } from "../performanceEvaluator";
import {
    dispatchBuildOutput,
    dispatchBuildOutputClear,
    SOUNDFONT_LOADED_EVENT,
    SOUNDFONT_LOADING_EVENT,
    type SoundfontLoadedDetail,
    UPLOAD_BUSY_EVENT,
    UPLOAD_IDLE_EVENT
} from "../events";
import { SpessaSynthOutput } from "../playback/SpessaSynthOutput";
import type { PlaybackOutput } from "../playback/PlaybackOutput";
import type { Highlight, MmEditorElement } from "./mm-editor";
import type { MmTabsElement } from "./mm-tabs";

const BUILD_TABS_ID = "build-tabs";
const OUTPUT_PANEL_ID = "tab-output";

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// Each currently-active event contributes its own constructor call, plus one
// highlight per enclosing .map()/.forEach()/.flatMap() whose iterated array
// could be traced back to a literal (see agents/SPIKE.md) - e.g. for a note
// built inside `notes.map(n => new NoteOnEvent().key(n))`, both the
// constructor call and the specific literal note currently being processed.
function toHighlights(entries: TimelineEntry[]): Highlight[] {
    return entries.flatMap(entry => [
        { range: entry, className: "mm-highlighted-event" },
        ...entry.elementRanges.map(range => ({ range, className: "mm-highlighted-element" }))
    ]);
}

function createIconButton(id: string, label: string, icon: typeof Play): HTMLButtonElement {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.append(createElement(icon));

    return button;
}

export class MmPlaybackControlsElement extends HTMLElement {
    #playButton: HTMLButtonElement;
    #pauseButton: HTMLButtonElement;
    #stopButton: HTMLButtonElement;

    #output: PlaybackOutput = new SpessaSynthOutput();
    #soundfont: SoundfontLoadedDetail | undefined;
    #timeline: TimelineEntry[] = [];
    #lastHighlightMs = 0;
    #highlightLoopHandle: number | undefined;
    #isPlaying = false;

    #soundfontLoading = true;
    #uploadBusy = false;
    #rendering = false;

    #onSoundfontLoading = (): void => {
        this.#soundfontLoading = true;
        this.#updateDisabled();
    };

    #onSoundfontLoaded = (event: Event): void => {
        this.#soundfont = (event as CustomEvent<SoundfontLoadedDetail>).detail;
        this.#soundfontLoading = false;
        this.#updateDisabled();
    };

    #onUploadBusy = (): void => {
        this.#uploadBusy = true;
        this.#updateDisabled();
    };

    #onUploadIdle = (): void => {
        this.#uploadBusy = false;
        this.#updateDisabled();
    };

    // Ctrl+Enter starts playback (or restarts it, if already playing - #handlePlay
    // always re-renders from scratch regardless of current state). Alt+Enter
    // stops it. Registered on document with capture so it fires regardless of
    // focus (e.g. while the Monaco editor has it) and ahead of any of Monaco's
    // own keybindings for the same combination.
    #onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Enter") return;

        if (event.ctrlKey && !event.altKey) {
            if (this.#playButton.disabled) return;

            event.preventDefault();
            void this.#handlePlay();
        } else if (event.altKey && !event.ctrlKey) {
            if (this.#stopButton.disabled) return;

            event.preventDefault();
            this.#handleStop();
        }
    };

    constructor() {
        super();

        this.#playButton = createIconButton("play-button", "Play", Play);
        this.#pauseButton = createIconButton("pause-button", "Pause", Pause);
        this.#stopButton = createIconButton("stop-button", "Stop", Square);

        this.#playButton.addEventListener("click", () => void this.#handlePlay());
        this.#pauseButton.addEventListener("click", () => this.#handlePause());
        this.#stopButton.addEventListener("click", () => this.#handleStop());

        // Only the highlight state, not a "Stopped." message or a call to
        // output.stop() - the song already finished on its own here, the
        // user didn't press Stop.
        this.#output.onEnded(() => this.#resetHighlightState());

        this.#updateDisabled();

        this.append(this.#playButton, this.#pauseButton, this.#stopButton);
    }

    connectedCallback(): void {
        document.addEventListener(SOUNDFONT_LOADING_EVENT, this.#onSoundfontLoading);
        document.addEventListener(SOUNDFONT_LOADED_EVENT, this.#onSoundfontLoaded);
        document.addEventListener(UPLOAD_BUSY_EVENT, this.#onUploadBusy);
        document.addEventListener(UPLOAD_IDLE_EVENT, this.#onUploadIdle);
        document.addEventListener("keydown", this.#onKeyDown, true);

        this.#highlightLoopHandle = requestAnimationFrame(() => this.#runHighlightLoop());
    }

    disconnectedCallback(): void {
        document.removeEventListener(SOUNDFONT_LOADING_EVENT, this.#onSoundfontLoading);
        document.removeEventListener(SOUNDFONT_LOADED_EVENT, this.#onSoundfontLoaded);
        document.removeEventListener(UPLOAD_BUSY_EVENT, this.#onUploadBusy);
        document.removeEventListener(UPLOAD_IDLE_EVENT, this.#onUploadIdle);
        document.removeEventListener("keydown", this.#onKeyDown, true);

        if (this.#highlightLoopHandle !== undefined) cancelAnimationFrame(this.#highlightLoopHandle);
    }

    #updateDisabled(): void {
        const disabled = this.#soundfontLoading || this.#uploadBusy || this.#rendering;

        this.#playButton.disabled = disabled;
        this.#pauseButton.disabled = disabled;
        this.#stopButton.disabled = disabled;
    }

    async #handlePlay(): Promise<void> {
        const editor = document.querySelector<MmEditorElement>("#editor");

        if (!editor || !this.#soundfont) return;

        const source = editor.getSource();

        this.#rendering = true;
        this.#updateDisabled();
        dispatchBuildOutputClear();
        dispatchBuildOutput({ status: "info", message: "Rendering audio..." });
        document.querySelector<MmTabsElement>(`#${BUILD_TABS_ID}`)?.activatePanel(OUTPUT_PANEL_ID);
        editor.clearHighlights();

        try {
            const container = await bootWebContainer();
            await startTsServer(container);

            const { midi, timeline } = await evaluatePerformance(container, source);

            await this.#output.addSoundBank(this.#soundfont.name, this.#soundfont.buffer);
            this.#output.load(midi, "performance");

            this.#timeline = timeline;
            this.#lastHighlightMs = 0;
            this.#isPlaying = true;

            this.#output.play();

            dispatchBuildOutput({ status: "success", message: "Build successful." });
            dispatchBuildOutput({ status: "info", message: "Playback started." });
        } catch (error) {
            dispatchBuildOutput({ status: "error", message: toErrorMessage(error) });
        } finally {
            this.#rendering = false;
            this.#updateDisabled();
        }
    }

    #handlePause(): void {
        this.#output.pause();
        dispatchBuildOutput({ status: "info", message: "Paused." });
    }

    #handleStop(): void {
        this.#output.stop();
        dispatchBuildOutput({ status: "info", message: "Stopped." });

        this.#resetHighlightState();
    }

    // Stops the highlight loop from reacting further and clears whatever's
    // currently highlighted - shared by the user pressing Stop and the song
    // ending on its own. Setting #isPlaying false matters even here:
    // getCurrentTime() can briefly still report a stale (pre-stop) value for
    // a frame or two, since it round-trips through an AudioWorklet message,
    // which would otherwise re-derive and re-apply a highlight right after
    // this clears it.
    #resetHighlightState(): void {
        this.#isPlaying = false;
        document.querySelector<MmEditorElement>("#editor")?.clearHighlights();
        this.#lastHighlightMs = 0;
    }

    // Runs for the lifetime of this element, polling the output's playback
    // position - spessasynth_lib has no per-note "now playing" callback (per
    // PLAN.md), and its "timeChange" event only fires once, not continuously,
    // so this polls currentTime directly instead, matching
    // @perry-rylance/midi-to-milliseconds' own suggested usage (compare the
    // previous frame's time to the current one).
    #runHighlightLoop(): void {
        const milliseconds = this.#output.getCurrentTime();

        if (this.#isPlaying && milliseconds !== this.#lastHighlightMs && this.#timeline.length > 0) {
            const editor = document.querySelector<MmEditorElement>("#editor");

            const active = this.#timeline.filter(
                entry => entry.milliseconds >= this.#lastHighlightMs && entry.milliseconds < milliseconds
            );

            if (active.length > 0) editor?.highlightRanges(toHighlights(active));

            this.#lastHighlightMs = milliseconds;
        }

        this.#highlightLoopHandle = requestAnimationFrame(() => this.#runHighlightLoop());
    }
}

customElements.define("mm-playback-controls", MmPlaybackControlsElement);
