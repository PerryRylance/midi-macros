import { createElement, Pause, Play, Square } from "lucide";
import { bootWebContainer } from "../webcontainer";
import { startTsServer } from "../tsServer";
import { evaluateProgram, ProgramEvaluationError } from "../programEvaluator";
import { hasDefaultExport } from "../defaultExport";
import { SOUNDFONT_LOADED_EVENT, SOUNDFONT_LOADING_EVENT, type SoundfontLoadedDetail } from "../events";
import { SpessaSynthOutput } from "../playback/SpessaSynthOutput";
import type { PlaybackOutput } from "../playback/PlaybackOutput";
import type { MmEditorElement } from "./mm-editor";

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
    #status: HTMLParagraphElement;

    #output: PlaybackOutput = new SpessaSynthOutput();
    #soundfont: SoundfontLoadedDetail | undefined;

    #onSoundfontLoading = (): void => {
        this.#setDisabled(true);
    };

    #onSoundfontLoaded = (event: Event): void => {
        this.#soundfont = (event as CustomEvent<SoundfontLoadedDetail>).detail;
        this.#setDisabled(false);
    };

    constructor() {
        super();

        this.#playButton = createIconButton("play-button", "Play", Play);
        this.#pauseButton = createIconButton("pause-button", "Pause", Pause);
        this.#stopButton = createIconButton("stop-button", "Stop", Square);

        this.#status = document.createElement("p");
        this.#status.id = "playback-status";

        this.#playButton.addEventListener("click", () => void this.#handlePlay());
        this.#pauseButton.addEventListener("click", () => this.#handlePause());
        this.#stopButton.addEventListener("click", () => this.#handleStop());

        this.#setDisabled(true);

        this.append(this.#playButton, this.#pauseButton, this.#stopButton, this.#status);
    }

    connectedCallback(): void {
        document.addEventListener(SOUNDFONT_LOADING_EVENT, this.#onSoundfontLoading);
        document.addEventListener(SOUNDFONT_LOADED_EVENT, this.#onSoundfontLoaded);
    }

    disconnectedCallback(): void {
        document.removeEventListener(SOUNDFONT_LOADING_EVENT, this.#onSoundfontLoading);
        document.removeEventListener(SOUNDFONT_LOADED_EVENT, this.#onSoundfontLoaded);
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

        if (!hasDefaultExport(source)) {
            this.#status.textContent = "No default export.";
            return;
        }

        this.#setDisabled(true);
        this.#status.textContent = "Rendering...";

        try {
            const container = await bootWebContainer();
            await startTsServer(container);

            const midi = await evaluateProgram(container, source);

            await this.#output.addSoundBank(this.#soundfont.name, this.#soundfont.buffer);
            this.#output.load(midi, "program");
            this.#output.play();

            this.#status.textContent = "Playing.";
        } catch (error) {
            this.#status.textContent = error instanceof ProgramEvaluationError ? error.message : "Error.";
        } finally {
            this.#setDisabled(false);
        }
    }

    #handlePause(): void {
        this.#output.pause();
        this.#status.textContent = "Paused.";
    }

    #handleStop(): void {
        this.#output.stop();
        this.#status.textContent = "Stopped.";
    }
}

customElements.define("mm-playback-controls", MmPlaybackControlsElement);
