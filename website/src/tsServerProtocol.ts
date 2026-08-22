// tsserver's native protocol (distinct from LSP) is newline-delimited JSON:
// one JSON object per line, no Content-Length framing.
export function encodeTsServerCommand(command: unknown): string {
    return `${JSON.stringify(command)}\n`;
}

export class TsServerMessageBuffer {
    #buffer = "";

    append(chunk: string): string[] {
        this.#buffer += chunk;

        const messages: string[] = [];

        let newlineIndex: number;

        while ((newlineIndex = this.#buffer.indexOf("\n")) !== -1) {
            const line = this.#buffer.slice(0, newlineIndex).replace(/\r$/, "");

            this.#buffer = this.#buffer.slice(newlineIndex + 1);

            // WebContainer's pseudo-terminal can double up newlines when
            // echoing a write back - a blank line never carries a real
            // message, so it's always safe to skip.
            if (line.length === 0) continue;

            messages.push(line);
        }

        return messages;
    }
}
