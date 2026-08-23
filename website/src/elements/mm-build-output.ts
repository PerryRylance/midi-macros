import { BUILD_OUTPUT_CLEAR_EVENT, BUILD_OUTPUT_EVENT, type BuildOutputDetail } from "../events";

export class MmBuildOutputElement extends HTMLElement {
    #log: HTMLPreElement;

    #onBuildOutput = (event: Event): void => {
        const { status, message } = (event as CustomEvent<BuildOutputDetail>).detail;

        const line = document.createElement("div");
        line.textContent = message;
        line.dataset.status = status;

        this.#log.append(line);
    };

    #onClear = (): void => {
        this.#log.replaceChildren();
    };

    constructor() {
        super();

        // Custom elements default to display:inline, which doesn't reserve
        // block-level layout space for a (possibly still-empty) child - see
        // the same fix in mm-package-terminal.ts.
        this.style.display = "block";

        this.#log = document.createElement("pre");
        this.#log.id = "build-output-message";

        this.append(this.#log);
    }

    connectedCallback(): void {
        document.addEventListener(BUILD_OUTPUT_EVENT, this.#onBuildOutput);
        document.addEventListener(BUILD_OUTPUT_CLEAR_EVENT, this.#onClear);
    }

    disconnectedCallback(): void {
        document.removeEventListener(BUILD_OUTPUT_EVENT, this.#onBuildOutput);
        document.removeEventListener(BUILD_OUTPUT_CLEAR_EVENT, this.#onClear);
    }
}

customElements.define("mm-build-output", MmBuildOutputElement);
