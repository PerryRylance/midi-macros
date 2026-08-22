import type { WebContainerProcess } from "@webcontainer/api";
import { encodeTsServerCommand, TsServerMessageBuffer } from "./tsServerProtocol";
import type { EchoFilter } from "./echoFilter";
import type { SentMessageTracker } from "./sentMessageTracker";

export interface TsServerEvent {
    seq: number;
    type: "event";
    event: string;
    body?: unknown;
}

export interface TsServerClient {
    sendCommand(command: Record<string, unknown>): Promise<void>;
    onEvent(callback: (event: TsServerEvent) => void): void;
    onError(callback: (error: Error) => void): void;
    onClose(callback: () => void): void;
}

function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value));
}

function isTsServerEvent(message: unknown): message is TsServerEvent {
    return typeof message === "object" && message !== null && (message as { type?: unknown }).type === "event";
}

// TEMPORARY: mirror all tsserver traffic into a global array for debugging
// (see agents/REGRESSION.md). Guarded for non-browser environments (e.g.
// Vitest's Node test environment has no `window`).
function debugLog(entry: Record<string, unknown>): void {
    if (typeof window === "undefined") return;

    const target = window as unknown as { __lspLog?: unknown[] };

    target.__lspLog ??= [];
    target.__lspLog.push({ t: Date.now(), ...entry });
}

export function createTsServerClient(
    process: WebContainerProcess,
    echoFilter?: EchoFilter,
    sentMessageTracker?: SentMessageTracker
): TsServerClient {
    const buffer = new TsServerMessageBuffer();
    const writer = process.input.getWriter();
    const eventListeners = new Set<(event: TsServerEvent) => void>();
    const errorListeners = new Set<(error: Error) => void>();
    const closeListeners = new Set<() => void>();

    (async () => {
        const reader = process.output.getReader();

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            const chunk = echoFilter ? echoFilter.filterIncoming(value) : value;

            debugLog({ dir: "in", kind: "raw", value, chunk });

            if (!chunk) continue;

            for (const raw of buffer.append(chunk)) {
                let message: unknown;

                try {
                    message = JSON.parse(raw);
                } catch (error) {
                    debugLog({ dir: "in", kind: "parse-error", raw, error: String(error) });
                    errorListeners.forEach(callback => callback(toError(error)));
                    continue;
                }

                if (sentMessageTracker?.isEcho(message)) {
                    debugLog({ dir: "in", kind: "dropped-echo", message });
                    continue;
                }

                debugLog({ dir: "in", kind: "message", message });

                if (isTsServerEvent(message)) {
                    eventListeners.forEach(callback => callback(message));
                }
            }
        }

        debugLog({ dir: "in", kind: "closed" });

        closeListeners.forEach(callback => callback());
    })();

    return {
        async sendCommand(command) {
            const encoded = encodeTsServerCommand(command);

            echoFilter?.recordWrite(encoded);
            sentMessageTracker?.recordSent(command);

            debugLog({ dir: "out", kind: "message", message: command });

            await writer.write(encoded);
        },
        onEvent(callback) {
            eventListeners.add(callback);
        },
        onError(callback) {
            errorListeners.add(callback);
        },
        onClose(callback) {
            closeListeners.add(callback);
        }
    };
}
