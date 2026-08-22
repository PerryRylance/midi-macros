// WebContainer attaches a pseudo-terminal to every spawned process, and PTYs
// echo back whatever is written to stdin - so our own outgoing LSP messages
// reappear in the process's output stream alongside real responses. This
// tracks what we've written and strips a matching prefix off incoming data
// before it reaches the message framing/parsing logic.
export interface EchoFilter {
    recordWrite(text: string): void;
    filterIncoming(chunk: string): string;
}

export function createEchoFilter(): EchoFilter {
    let pending = "";

    return {
        recordWrite(text) {
            pending += text;
        },
        filterIncoming(chunk) {
            if (!pending) return chunk;

            if (pending.startsWith(chunk)) {
                pending = pending.slice(chunk.length);

                return "";
            }

            if (chunk.startsWith(pending)) {
                const rest = chunk.slice(pending.length);

                pending = "";

                return rest;
            }

            // Doesn't line up with what we expected echoed back - give up on
            // filtering rather than risk silently eating real server data.
            pending = "";

            return chunk;
        }
    };
}
