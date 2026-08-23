import { SOUND_FONTS, loadSoundfont } from "../soundfont";
import { dispatchSoundfontLoaded } from "../events";

export class MmSoundfontSelectElement extends HTMLElement {
    #status: HTMLParagraphElement;
    #select: HTMLSelectElement;

    constructor() {
        super();

        this.#status = document.createElement("p");
        this.#status.id = "audio-status";
        this.#status.textContent = "Loading...";

        const label = document.createElement("label");
        label.htmlFor = "soundfont-select";
        label.textContent = "SoundFont";

        this.#select = document.createElement("select");
        this.#select.id = "soundfont-select";

        for (const font of SOUND_FONTS) {
            const option = document.createElement("option");
            option.value = font.url;
            option.textContent = font.name;
            this.#select.append(option);
        }

        this.#select.addEventListener("change", () => void this.#load());

        this.append(this.#status, label, this.#select);
    }

    connectedCallback(): void {
        // Loads regardless of whether this tab is currently visible -
        // playback shouldn't have to wait on the user opening the Audio tab first.
        void this.#load();
    }

    async #load(): Promise<void> {
        const font = SOUND_FONTS.find(candidate => candidate.url === this.#select.value) ?? SOUND_FONTS[0];

        if (!font) return;

        this.#status.textContent = "Loading...";

        try {
            const buffer = await loadSoundfont(font.url);

            dispatchSoundfontLoaded({ name: font.name, buffer });
            this.#status.textContent = "Ready.";
        } catch {
            this.#status.textContent = "Error.";
        }
    }
}

customElements.define("mm-soundfont-select", MmSoundfontSelectElement);
