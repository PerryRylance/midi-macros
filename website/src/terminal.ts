import { Terminal } from "@xterm/xterm";

export function createTerminal(container: HTMLElement): Terminal {
    const terminal = new Terminal({ convertEol: true, disableStdin: true });

    terminal.open(container);

    return terminal;
}
