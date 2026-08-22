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

interface TsServerResponse {
    seq: number;
    type: "response";
    command: string;
    request_seq: number;
    success: boolean;
    body?: unknown;
    message?: string;
}

export interface TsServerClient {
    sendCommand(command: string, args?: unknown): Promise<void>;
    sendRequest<T = unknown>(command: string, args?: unknown): Promise<T>;
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

function isTsServerResponse(message: unknown): message is TsServerResponse {
    return typeof message === "object" && message !== null && (message as { type?: unknown }).type === "response";
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
    const pendingRequests = new Map<number, { resolve: (body: unknown) => void; reject: (error: Error) => void }>();
    let nextSeq = 0;

    function dispatch(message: unknown): void {
        if (isTsServerEvent(message)) {
            eventListeners.forEach(callback => callback(message));

            return;
        }

        if (isTsServerResponse(message)) {
            const pending = pendingRequests.get(message.request_seq);

            if (!pending) return;

            pendingRequests.delete(message.request_seq);

            if (message.success) {
                pending.resolve(message.body);
            } else {
                pending.reject(new Error(message.message ?? `tsserver "${message.command}" request failed.`));
            }
        }
    }

    // Assigns the seq and starts the write synchronously (no `await` before
    // returning) so a caller can register a pending-request resolver before
    // any microtask gap - otherwise a fast-arriving response could be
    // dispatched before its resolver exists and would be silently dropped.
    function send(command: string, args: unknown): { seq: number; written: Promise<void> } {
        const seq = nextSeq++;
        const encoded = encodeTsServerCommand({ seq, type: "request", command, arguments: args });

        echoFilter?.recordWrite(encoded);
        sentMessageTracker?.recordSent({ seq, type: "request", command, arguments: args });

        debugLog({ dir: "out", kind: "message", message: { seq, type: "request", command, arguments: args } });

        return { seq, written: writer.write(encoded) };
    }

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

                dispatch(message);
            }
        }

        debugLog({ dir: "in", kind: "closed" });

        closeListeners.forEach(callback => callback());
    })();

    return {
        async sendCommand(command, args) {
            await send(command, args).written;
        },
        sendRequest(command, args) {
            return new Promise((resolve, reject) => {
                const { seq, written } = send(command, args);

                pendingRequests.set(seq, { resolve: resolve as (body: unknown) => void, reject });

                written.catch(error => {
                    pendingRequests.delete(seq);
                    reject(toError(error));
                });
            });
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
