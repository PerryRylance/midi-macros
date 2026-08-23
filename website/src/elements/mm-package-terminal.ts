import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { TERMINAL_OUTPUT_EVENT } from "../events";

export class MmPackageTerminalElement extends HTMLElement {
    #terminal: Terminal | undefined;
    #fitAddon: FitAddon | undefined;
    #resizeObserver: ResizeObserver | undefined;
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

    constructor() {
        super();

        // Custom elements default to display:inline, which reports 0 for
        // clientWidth/clientHeight - FitAddon.fit() reads those directly, so
        // without this the terminal renders at ~0 rows/cols regardless of
        // how much visual space its container actually gives it.
        this.style.display = "block";
    }

    connectedCallback(): void {
        this.#terminal = new Terminal({ convertEol: true, disableStdin: true });
        this.#fitAddon = new FitAddon();
        this.#terminal.loadAddon(this.#fitAddon);

        this.#terminal.open(this);
        this.#fitAddon.fit();

        this.#resizeObserver = new ResizeObserver(() => this.#fitAddon?.fit());
        this.#resizeObserver.observe(this);

        document.addEventListener(TERMINAL_OUTPUT_EVENT, this.#onOutput);
    }

    disconnectedCallback(): void {
        document.removeEventListener(TERMINAL_OUTPUT_EVENT, this.#onOutput);

        this.#resizeObserver?.disconnect();
        this.#resizeObserver = undefined;

        this.#terminal?.dispose();
        this.#terminal = undefined;
        this.#fitAddon = undefined;
    }
}

customElements.define("mm-package-terminal", MmPackageTerminalElement);
