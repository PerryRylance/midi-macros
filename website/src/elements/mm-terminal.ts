import { Terminal } from "@xterm/xterm";
import { TERMINAL_OUTPUT_EVENT } from "../events";

export class MmTerminalElement extends HTMLElement {
    #terminal: Terminal | undefined;

    #onOutput = (event: Event): void => {
        this.#terminal?.write((event as CustomEvent<string>).detail);
    };

    connectedCallback(): void {
        this.#terminal = new Terminal({ convertEol: true, disableStdin: true });
        this.#terminal.open(this);

        document.addEventListener(TERMINAL_OUTPUT_EVENT, this.#onOutput);
    }

    disconnectedCallback(): void {
        document.removeEventListener(TERMINAL_OUTPUT_EVENT, this.#onOutput);

        this.#terminal?.dispose();
        this.#terminal = undefined;
    }
}

customElements.define("mm-terminal", MmTerminalElement);
