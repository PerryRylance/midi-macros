import { Terminal } from "@xterm/xterm";
import { TERMINAL_OUTPUT_EVENT } from "../events";

export class MmTerminalElement extends HTMLElement {
    #terminal: Terminal | undefined;
    #pending = "";
    #flushTimer: ReturnType<typeof setTimeout> | undefined;

    #onOutput = (event: Event): void => {
        this.#pending += (event as CustomEvent<string>).detail;

        // Coalesce rapid bursts (e.g. npm's spinner redraw sequence) into a
        // single write call rather than one per chunk.
        this.#flushTimer ??= setTimeout(() => {
            this.#flushTimer = undefined;

            const chunk = this.#pending;
            this.#pending = "";
            this.#terminal?.write(chunk);
        }, 0);
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
