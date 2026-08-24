import { createElement, Pause, Play, Square } from "lucide";
import { bootWebContainer } from "../webcontainer";
import { startTsServer } from "../tsServer";
import { evaluateProgram, type TimelineEntry } from "../programEvaluator";
import {
    dispatchBuildOutput,
    dispatchBuildOutputClear,
    SOUNDFONT_LOADED_EVENT,
    SOUNDFONT_LOADING_EVENT,
    type SoundfontLoadedDetail
} from "../events";
import { SpessaSynthOutput } from "../playback/SpessaSynthOutput";
import type { PlaybackOutput } from "../playback/PlaybackOutput";
import type { MmEditorElement } from "./mm-editor";
import type { MmTabsElement } from "./mm-tabs";

const BUILD_TABS_ID = "build-tabs";
const OUTPUT_PANEL_ID = "tab-output";

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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

    #onSoundfontLoading = (): void => {
        this.#setDisabled(true);
    };

    #onSoundfontLoaded = (event: Event): void => {
        this.#soundfont = (event as CustomEvent<SoundfontLoadedDetail>).detail;
        this.#setDisabled(false);
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

        this.#setDisabled(true);

        this.append(this.#playButton, this.#pauseButton, this.#stopButton);
    }

    connectedCallback(): void {
        document.addEventListener(SOUNDFONT_LOADING_EVENT, this.#onSoundfontLoading);
        document.addEventListener(SOUNDFONT_LOADED_EVENT, this.#onSoundfontLoaded);
        document.addEventListener("keydown", this.#onKeyDown, true);

        this.#highlightLoopHandle = requestAnimationFrame(() => this.#runHighlightLoop());
    }

    disconnectedCallback(): void {
        document.removeEventListener(SOUNDFONT_LOADING_EVENT, this.#onSoundfontLoading);
        document.removeEventListener(SOUNDFONT_LOADED_EVENT, this.#onSoundfontLoaded);
        document.removeEventListener("keydown", this.#onKeyDown, true);

        if (this.#highlightLoopHandle !== undefined) cancelAnimationFrame(this.#highlightLoopHandle);
    }

    #setDisabled(disabled: boolean): void {
        this.#playButton.disabled = disabled;
        this.#pauseButton.disabled = disabled;
        this.#stopButton.disabled = disabled;
    }

    async #handlePlay(): Promise<void> {
        const editor = document.querySelector<MmEditorElement>("#editor");

        if (!editor || !this.#soundfont) return;

        const source = editor.getSource();

        this.#setDisabled(true);
        dispatchBuildOutputClear();
        dispatchBuildOutput({ status: "info", message: "Rendering audio..." });
        document.querySelector<MmTabsElement>(`#${BUILD_TABS_ID}`)?.activatePanel(OUTPUT_PANEL_ID);
        editor.clearHighlights();

        try {
            const container = await bootWebContainer();
            await startTsServer(container);

            const { midi, timeline } = await evaluateProgram(container, source);

            await this.#output.addSoundBank(this.#soundfont.name, this.#soundfont.buffer);
            this.#output.load(midi, "program");

            this.#timeline = timeline;
            this.#lastHighlightMs = 0;
            this.#isPlaying = true;

            this.#output.play();

            dispatchBuildOutput({ status: "success", message: "Build successful." });
            dispatchBuildOutput({ status: "info", message: "Playback started." });
        } catch (error) {
            dispatchBuildOutput({ status: "error", message: toErrorMessage(error) });
        } finally {
            this.#setDisabled(false);
        }
    }

    #handlePause(): void {
        this.#output.pause();
        dispatchBuildOutput({ status: "info", message: "Paused." });
    }

    #handleStop(): void {
        this.#output.stop();
        dispatchBuildOutput({ status: "info", message: "Stopped." });

        // Stops the highlight loop from reacting to it too - getCurrentTime()
        // can briefly still report a stale (pre-stop) value for a frame or
        // two, since it round-trips through an AudioWorklet message, which
        // would otherwise re-derive and re-apply a highlight right after
        // this clears it.
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

            if (active.length > 0) editor?.highlightRanges(active);

            this.#lastHighlightMs = milliseconds;
        }

        this.#highlightLoopHandle = requestAnimationFrame(() => this.#runHighlightLoop());
    }
}

customElements.define("mm-playback-controls", MmPlaybackControlsElement);
