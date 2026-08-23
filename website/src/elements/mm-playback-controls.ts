import { createElement, Pause, Play, Square } from "lucide";

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

    constructor() {
        super();

        this.#playButton = createIconButton("play-button", "Play", Play);
        this.#pauseButton = createIconButton("pause-button", "Pause", Pause);
        this.#stopButton = createIconButton("stop-button", "Stop", Square);

        this.append(this.#playButton, this.#pauseButton, this.#stopButton);
    }
}

customElements.define("mm-playback-controls", MmPlaybackControlsElement);
