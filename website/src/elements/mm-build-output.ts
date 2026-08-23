import { BUILD_OUTPUT_EVENT, type BuildOutputDetail } from "../events";

export class MmBuildOutputElement extends HTMLElement {
    #message: HTMLPreElement;

    #onBuildOutput = (event: Event): void => {
        const { status, message } = (event as CustomEvent<BuildOutputDetail>).detail;

        this.#message.textContent = message;
        this.#message.dataset.status = status;
    };

    constructor() {
        super();

        this.#message = document.createElement("pre");
        this.#message.id = "build-output-message";

        this.append(this.#message);
    }

    connectedCallback(): void {
        document.addEventListener(BUILD_OUTPUT_EVENT, this.#onBuildOutput);
    }

    disconnectedCallback(): void {
        document.removeEventListener(BUILD_OUTPUT_EVENT, this.#onBuildOutput);
    }
}

customElements.define("mm-build-output", MmBuildOutputElement);
