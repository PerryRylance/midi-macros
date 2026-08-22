// tsserver's protocol is asymmetric: commands sent TO it are read via
// Node's `readline` off stdin, so plain newline-delimited JSON is enough.
export function encodeTsServerCommand(command: unknown): string {
    return `${JSON.stringify(command)}\n`;
}

// Messages tsserver sends back, however, are written via its own
// `formatMessage`/`sys.write`, which frames them with an LSP-style
// Content-Length header - not newline-delimited. This is only exported for
// building test fixtures; the app never constructs one of these itself, only
// parses them (see TsServerMessageBuffer below).
const RAW_HEADER_SEPARATOR = "\r\n\r\n";

export function encodeTsServerMessage(message: unknown): string {
    // tsserver counts its own trailing newline as part of Content-Length.
    const body = `${JSON.stringify(message)}\n`;
    const byteLength = new TextEncoder().encode(body).length;

    return `Content-Length: ${byteLength}${RAW_HEADER_SEPARATOR}${body}`;
}

// WebContainer's pseudo-terminal applies terminal-style output processing
// (ONLCR: "\n" -> "\r\n") to a spawned process's own stdout, not just to
// echoed input - so tsserver's real "\r\n\r\n"/"\n" framing bytes arrive
// doubled-up as "\r\r\n\r\r\n"/"\r\n" on the wire. JSON.stringify always
// escapes literal CR/LF inside string content as "\\r"/"\\n" text, so a raw
// CR or LF byte can only ever be one of tsserver's own framing characters,
// never message content - meaning it's always safe to collapse any run of
// "\r"s immediately followed by "\n" down to a single "\n" before parsing.
const HEADER_SEPARATOR = "\n\n";

// WebContainer's process I/O is string-based (already UTF-8 decoded), but the
// Content-Length header counts bytes, not JS string length - so a message
// containing multi-byte characters needs byte-aware slicing to find the
// correct end-of-body character offset.
function sliceByUtf8ByteLength(value: string, byteLength: number): string {
    const bytes = new TextEncoder().encode(value).slice(0, byteLength);

    return new TextDecoder().decode(bytes);
}

export class TsServerMessageBuffer {
    #buffer = "";

    append(chunk: string): string[] {
        this.#buffer = (this.#buffer + chunk).replace(/\r+\n/g, "\n");

        const messages: string[] = [];

        while (true) {
            const headerEnd = this.#buffer.indexOf(HEADER_SEPARATOR);

            if (headerEnd === -1) break;

            const header = this.#buffer.slice(0, headerEnd);
            const match = /Content-Length:\s*(\d+)/i.exec(header);

            if (!match) {
                throw new Error(`Malformed tsserver message header: ${JSON.stringify(header)}`);
            }

            const contentLength = Number(match[1]);

            // WebContainer's pseudo-terminal occasionally echoes a write back
            // with an extra blank-line separator spliced in right after the
            // header. A real message body is always a JSON object and can
            // never start with a blank line, so skipping any repeats here is safe.
            let bodyStart = headerEnd + HEADER_SEPARATOR.length;

            while (this.#buffer.startsWith(HEADER_SEPARATOR, bodyStart)) {
                bodyStart += HEADER_SEPARATOR.length;
            }

            const remainder = this.#buffer.slice(bodyStart);

            if (new TextEncoder().encode(remainder).length < contentLength) break;

            const body = sliceByUtf8ByteLength(remainder, contentLength);

            // tsserver's own Content-Length count includes a trailing
            // newline it appends after the JSON - strip it back off.
            messages.push(body.trimEnd());
            this.#buffer = remainder.slice(body.length);
        }

        return messages;
    }
}
