// A second, content-based line of defence against WebContainer's pseudo-terminal
// echoing our own writes back into the process's output stream. Unlike
// byte-level matching, this survives the stream getting mangled in transit
// (e.g. an extra separator spliced in) because it only compares parsed,
// structured messages once they've been correctly framed.
export interface SentMessageTracker {
    recordSent(message: unknown): void;
    isEcho(message: unknown): boolean;
}

const MAX_TRACKED = 20;

export function createSentMessageTracker(): SentMessageTracker {
    const sent: string[] = [];

    return {
        recordSent(message) {
            sent.push(JSON.stringify(message));

            if (sent.length > MAX_TRACKED) {
                sent.shift();
            }
        },
        isEcho(message) {
            const serialized = JSON.stringify(message);
            const index = sent.indexOf(serialized);

            if (index === -1) return false;

            sent.splice(index, 1);

            return true;
        }
    };
}
