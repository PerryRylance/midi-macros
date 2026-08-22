import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js";
// Side-effect import registering Monaco's built-in editor contributions
// (hover, parameter hints, go-to-definition, autocomplete UI, etc.) -
// `editor.api.js` alone only exposes the bare API surface with no UI
// controllers wired up to invoke any of the providers we register below.
import "monaco-editor/esm/vs/editor/editor.all.js";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { buildWorkerDefinition } from "monaco-editor-workers";
import { bootWebContainer } from "../webcontainer";
import { startTsServer } from "../tsServer";
import { createTsServerClient, type TsServerClient, type TsServerEvent } from "../tsServerClient";
import { createEchoFilter } from "../echoFilter";
import { createSentMessageTracker } from "../sentMessageTracker";
import { toMonacoMarkers, type TsServerDiagnosticEventBody } from "../tsServerDiagnostics";
import { toHoverContent, type TsServerQuickInfo } from "../tsServerHover";
import { hasDefaultExport } from "../defaultExport";

// The worker scripts actually live at "dist/workers/*.js" (see
// public/dist/workers) - passing just "dist" here builds a URL one directory
// short of the real file, which 404s and (since Vite's dev server falls back
// to index.html for unmatched routes) gets executed as JS, throwing
// "Unexpected token '<'" from the leading "<!doctype html>".
buildWorkerDefinition("dist/workers", new URL("", window.location.href).href, false);

const DEFAULT_EXPORT_MARKER_OWNER = "midi-macros-default-export";
const SYNTAX_MARKER_OWNER = "tsserver-syntax";
const SEMANTIC_MARKER_OWNER = "tsserver-semantic";
const SUGGESTION_MARKER_OWNER = "tsserver-suggestion";

// Must match the WebContainer's real workdir (set via `workdirName: "workspace"`
// in webcontainer.ts) or tsserver can't resolve node_modules imports relative
// to this file - it needs a real, on-disk-equivalent path, not just a URI.
const WORKDIR_FILE_PATH = "/home/workspace/index.ts";
const MODEL_URI = `file://${WORKDIR_FILE_PATH}`;

const DEFAULT_SOURCE = `import { File } from "@perry-rylance/midi";

export default new File();
`;

const NO_DEFAULT_EXPORT_MESSAGE = "No default export found. Expected a default export of type File from \"@perry-rylance/midi\".";

// tsserver's own debounce for diagnostics is per-request (the `delay` field
// on `geterr`), not per-keystroke - this avoids flooding it with a fresh
// open+geterr pair on every single keystroke while typing.
const DOCUMENT_SYNC_DEBOUNCE_MS = 300;

export class MmEditorElement extends HTMLElement {
    #model: monaco.editor.ITextModel;
    #status: HTMLParagraphElement;
    #host: HTMLDivElement;
    #tsServerClient: TsServerClient | undefined;
    #syncTimer: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        super();

        this.#status = document.createElement("p");
        this.#status.id = "editor-status";

        this.#host = document.createElement("div");
        // Monaco needs an explicitly sized host to render into - this is
        // functional (a zero-height box is unusable), not decorative.
        this.#host.style.height = "480px";

        this.append(this.#status, this.#host);

        this.#model = monaco.editor.createModel(DEFAULT_SOURCE, "typescript", monaco.Uri.parse(MODEL_URI));
        this.#model.onDidChangeContent(() => {
            this.#checkDefaultExport();
            this.#scheduleDocumentSync();
        });

        monaco.languages.registerHoverProvider("typescript", {
            provideHover: (model, position) => this.#provideHover(model, position)
        });
    }

    connectedCallback(): void {
        monaco.editor.create(this.#host, { model: this.#model });
        this.#checkDefaultExport();

        void this.#connectTsServer();
    }

    #checkDefaultExport(): void {
        const missingDefaultExport = !hasDefaultExport(this.#model.getValue());

        const markers: monaco.editor.IMarkerData[] = missingDefaultExport
            ? [{
                severity: monaco.MarkerSeverity.Error,
                message: NO_DEFAULT_EXPORT_MESSAGE,
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: 1,
                endColumn: 1
            }]
            : [];

        monaco.editor.setModelMarkers(this.#model, DEFAULT_EXPORT_MARKER_OWNER, markers);
        this.#status.textContent = missingDefaultExport ? NO_DEFAULT_EXPORT_MESSAGE : "";
    }

    async #connectTsServer(): Promise<void> {
        // TEMPORARY: dump tsserver <-> Monaco connection lifecycle to the console for debugging.
        console.log("[lsp] booting container...");
        const container = await bootWebContainer();
        console.log("[lsp] container ready, installing/starting tsserver...");
        const process = await startTsServer(container);
        console.log("[lsp] tsserver process spawned");

        // WebContainer attaches a pseudo-terminal to spawned processes, which
        // echoes stdin writes back into stdout - filter that out before it
        // reaches the message framing/parsing logic, or it gets parsed as
        // (garbled) server traffic.
        const echoFilter = createEchoFilter();
        const sentMessageTracker = createSentMessageTracker();
        const client = createTsServerClient(process, echoFilter, sentMessageTracker);

        client.onError(error => console.error("[lsp] client error", error));
        client.onClose(() => console.log("[lsp] tsserver connection closed"));
        client.onEvent(event => this.#handleTsServerEvent(event));

        this.#tsServerClient = client;

        console.log("[lsp] opening document...");
        this.#syncDocument();
    }

    #scheduleDocumentSync(): void {
        if (this.#syncTimer !== undefined) clearTimeout(this.#syncTimer);

        this.#syncTimer = setTimeout(() => this.#syncDocument(), DOCUMENT_SYNC_DEBOUNCE_MS);
    }

    #syncDocument(): void {
        const client = this.#tsServerClient;

        if (!client) return;

        // tsserver treats `open` on an already-open file as a full content
        // replacement, so re-opening on every change avoids having to track
        // incremental edit ranges ourselves.
        void client.sendCommand("open", { file: WORKDIR_FILE_PATH, fileContent: this.#model.getValue(), scriptKindName: "TS" });
        void client.sendCommand("geterr", { files: [WORKDIR_FILE_PATH], delay: 0 });
    }

    async #provideHover(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): Promise<monaco.languages.Hover | null> {
        const client = this.#tsServerClient;

        if (!client || model.uri.toString() !== this.#model.uri.toString()) return null;

        try {
            const info = await client.sendRequest<TsServerQuickInfo>("quickinfo", {
                file: WORKDIR_FILE_PATH,
                line: position.lineNumber,
                offset: position.column
            });

            return toHoverContent(info);
        } catch {
            // tsserver rejects with success: false ("No content available.")
            // for positions with nothing to show - not a real error.
            return null;
        }
    }

    #handleTsServerEvent(event: TsServerEvent): void {
        switch (event.event) {
            case "syntaxDiag":
                this.#applyDiagnostics(SYNTAX_MARKER_OWNER, event.body);
                break;
            case "semanticDiag":
                this.#applyDiagnostics(SEMANTIC_MARKER_OWNER, event.body);
                break;
            case "suggestionDiag":
                this.#applyDiagnostics(SUGGESTION_MARKER_OWNER, event.body);
                break;
        }
    }

    #applyDiagnostics(owner: string, body: unknown): void {
        const { diagnostics } = body as TsServerDiagnosticEventBody;

        monaco.editor.setModelMarkers(this.#model, owner, toMonacoMarkers(diagnostics) as monaco.editor.IMarkerData[]);
    }
}

customElements.define("mm-editor", MmEditorElement);
