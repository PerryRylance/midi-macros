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
import {
    toAdditionalTextEdits,
    toCompletionItems,
    type TsServerCompletionEntryDetails,
    type TsServerCompletionInfo
} from "../tsServerCompletions";
import { toSignatureHelp, type TsServerSignatureHelpItems } from "../tsServerSignatureHelp";

// The worker scripts actually live at "dist/workers/*.js" (see
// public/dist/workers) - passing just "dist" here builds a URL one directory
// short of the real file, which 404s and (since Vite's dev server falls back
// to index.html for unmatched routes) gets executed as JS, throwing
// "Unexpected token '<'" from the leading "<!doctype html>".
buildWorkerDefinition("dist/workers", new URL("", window.location.href).href, false);

const SYNTAX_MARKER_OWNER = "tsserver-syntax";
const SEMANTIC_MARKER_OWNER = "tsserver-semantic";
const SUGGESTION_MARKER_OWNER = "tsserver-suggestion";

// Must match the WebContainer's real workdir (set via `workdirName: "workspace"`
// in webcontainer.ts) or tsserver can't resolve node_modules imports relative
// to this file - it needs a real, on-disk-equivalent path, not just a URI.
const WORKDIR_ROOT_PATH = "/home/workspace";
const WORKDIR_FILE_PATH = `${WORKDIR_ROOT_PATH}/index.ts`;
const MODEL_URI = `file://${WORKDIR_FILE_PATH}`;
// Never shown to the user - see the "warming up" comment in #connectTsServer.
const WARMUP_FILE_PATH = `${WORKDIR_ROOT_PATH}/.warmup.ts`;

import DEFAULT_SOURCE from "../default.program?raw";

// tsserver's own debounce for diagnostics is per-request (the `delay` field
// on `geterr`), not per-keystroke - this avoids flooding it with a fresh
// open+geterr pair on every single keystroke while typing.
const DOCUMENT_SYNC_DEBOUNCE_MS = 300;

// The very first `open` tsserver ever processes in a session doesn't produce
// a response, even with `projectRootPath` set, so there's nothing to await -
// this fixed delay is the only reliable way found to let it finish its
// internal project setup before the real document's `open` arrives as
// tsserver's *second* file (which behaves correctly). See the "warming up"
// comment in #connectTsServer and agents/REGRESSION.md for how this was
// diagnosed.
const WARMUP_SETTLE_DELAY_MS = 2000;

// Extra provider-owned data stashed on a completion item so
// #resolveCompletionItem can identify which tsserver entry it came from -
// only present on auto-import candidates (see #resolveCompletionItem).
interface AutoImportCompletionItem extends monaco.languages.CompletionItem {
    tsAutoImportEntry?: { name: string; source?: string; data?: unknown };
}

export interface HighlightRange {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}

export interface Highlight {
    range: HighlightRange;
    // A CSS class name to apply - left for the user to style; distinct
    // callers use distinct classes (e.g. the event constructor itself vs.
    // the array element driving it) so they can be styled differently.
    className: string;
}

export class MmEditorElement extends HTMLElement {
    #model: monaco.editor.ITextModel;
    #host: HTMLDivElement;
    #editorInstance: monaco.editor.IStandaloneCodeEditor | undefined;
    #highlightDecorationIds: string[] = [];
    #tsServerClient: TsServerClient | undefined;
    #syncTimer: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        super();

        this.#host = document.createElement("div");
        // Monaco needs an explicitly sized host to render into - this is
        // functional (a zero-height box is unusable), not decorative. The
        // host fills whatever space the (possibly resizable) parent gives
        // this element; automaticLayout below keeps Monaco in sync with it.
        this.#host.style.flex = "1";
        this.#host.style.minHeight = "0";

        this.style.display = "flex";
        this.style.flexDirection = "column";

        this.append(this.#host);

        this.#model = monaco.editor.createModel(DEFAULT_SOURCE, "typescript", monaco.Uri.parse(MODEL_URI));
        this.#model.onDidChangeContent(() => this.#scheduleDocumentSync());

        monaco.languages.registerHoverProvider("typescript", {
            provideHover: (model, position) => this.#provideHover(model, position)
        });

        // Matches the trigger characters VS Code's own TypeScript extension
        // uses - Monaco already triggers completion on plain word characters
        // by default, so this is only needed for the special ones.
        monaco.languages.registerCompletionItemProvider("typescript", {
            triggerCharacters: [".", "\"", "'", "`", "/", "@", "<", "#"],
            provideCompletionItems: (model, position) => this.#provideCompletionItems(model, position),
            resolveCompletionItem: item => this.#resolveCompletionItem(item as AutoImportCompletionItem)
        });

        monaco.languages.registerSignatureHelpProvider("typescript", {
            signatureHelpTriggerCharacters: ["(", ","],
            signatureHelpRetriggerCharacters: [")"],
            provideSignatureHelp: (model, position) => this.#provideSignatureHelp(model, position)
        });
    }

    connectedCallback(): void {
        this.#editorInstance = monaco.editor.create(this.#host, { model: this.#model, automaticLayout: true });

        void this.#connectTsServer();
    }

    getSource(): string {
        return this.#model.getValue();
    }

    // Used when loading an uploaded performance - clears highlights too,
    // since any previously-applied decorations point at ranges in the old
    // (now discarded) content. onDidChangeContent's existing listener picks
    // up the change and resyncs tsserver, same as if the user had typed it.
    setSource(source: string): void {
        this.clearHighlights();
        this.#model.setValue(source);
    }

    // Applies (replacing any previous set) a highlight decoration for each
    // given entry - the CSS classes themselves are left for the user to
    // style, this only owns applying/clearing them as playback progresses.
    highlightRanges(highlights: Highlight[]): void {
        if (!this.#editorInstance) return;

        const decorations: monaco.editor.IModelDeltaDecoration[] = highlights.map(({ range, className }) => ({
            range: new monaco.Range(range.startLine, range.startColumn, range.endLine, range.endColumn),
            options: { inlineClassName: className }
        }));

        this.#highlightDecorationIds = this.#editorInstance.deltaDecorations(this.#highlightDecorationIds, decorations);
    }

    clearHighlights(): void {
        this.highlightRanges([]);
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

        // tsserver never attaches a real project to the very first file
        // opened in a session - confirmed empirically: `quickinfo` fails
        // with "No Project" for whichever file is opened first regardless of
        // name/content/projectRootPath, while the *second* file opened works
        // correctly. Opening a disposable warm-up file first works around
        // this so the user's actual document is never "file #1".
        console.log("[lsp] warming up tsserver's project service...");
        void client.sendCommand("open", {
            file: WARMUP_FILE_PATH,
            fileContent: "",
            scriptKindName: "TS",
            projectRootPath: WORKDIR_ROOT_PATH
        });
        await new Promise(resolve => setTimeout(resolve, WARMUP_SETTLE_DELAY_MS));

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
        //
        // `projectRootPath` is required for tsserver to durably associate a
        // real project with this file - without it, `open` still "succeeds"
        // and `geterr` diagnostics still work (they use a lenient lookup),
        // but any later request needing a project (e.g. `quickinfo` for
        // hover) fails with "No Project", since the file is treated as a
        // rootless, ad-hoc "dynamic" file with no durable project lifecycle.
        void client.sendCommand("open", {
            file: WORKDIR_FILE_PATH,
            fileContent: this.#model.getValue(),
            scriptKindName: "TS",
            projectRootPath: WORKDIR_ROOT_PATH
        });
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
                offset: position.column,
                projectRootPath: WORKDIR_ROOT_PATH
            });

            const { range, contents } = toHoverContent(info);

            // Monaco's hover aggregation appears to require a real `Range`
            // instance (not just a duck-typed object matching `IRange`) -
            // a plain object was silently dropped with no content ever shown.
            return {
                contents,
                range: new monaco.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn)
            };
        } catch {
            // tsserver rejects with success: false ("No content available.")
            // for positions with nothing to show - not a real error.
            return null;
        }
    }

    async #provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): Promise<monaco.languages.CompletionList | undefined> {
        const client = this.#tsServerClient;

        if (!client || model.uri.toString() !== this.#model.uri.toString()) return undefined;

        try {
            // Completion is triggered on every keystroke (immediately, no
            // debounce), so the debounced `#syncDocument()` resync may not
            // have reached tsserver yet - send the latest content directly
            // first. tsserver processes commands strictly in order, so this
            // guarantees `completionInfo` below sees it, without needing to
            // wait for a response.
            void client.sendCommand("open", {
                file: WORKDIR_FILE_PATH,
                fileContent: model.getValue(),
                scriptKindName: "TS",
                projectRootPath: WORKDIR_ROOT_PATH
            });

            const info = await client.sendRequest<TsServerCompletionInfo>("completionInfo", {
                file: WORKDIR_FILE_PATH,
                line: position.lineNumber,
                offset: position.column,
                // Surfaces symbols not yet imported (e.g. "Track" from
                // "@perry-rylance/midi" when only "File" is imported) as
                // completion candidates - accepting one adds the import via
                // #resolveCompletionItem below.
                includeExternalModuleExports: true,
                projectRootPath: WORKDIR_ROOT_PATH
            });

            const word = model.getWordUntilPosition(position);
            const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);

            return {
                suggestions: toCompletionItems(info).map((item): AutoImportCompletionItem => ({
                    // `description` renders dimmed on the right of the row -
                    // this is what shows "@perry-rylance/midi" next to
                    // "Track" for disambiguation, VS Code-style.
                    label: item.sourcePackage === undefined
                        ? item.label
                        : { label: item.label, description: item.sourcePackage },
                    kind: item.kind as monaco.languages.CompletionItemKind,
                    insertText: item.insertText,
                    sortText: item.sortText,
                    range,
                    ...(item.hasAction
                        ? {
                            tsAutoImportEntry: {
                                name: item.label,
                                ...(item.source === undefined ? {} : { source: item.source }),
                                data: item.data
                            }
                        }
                        : {})
                }))
            };
        } catch {
            // tsserver rejects when there's genuinely nothing to complete
            // (e.g. inside a string with no matching paths) - not a real error.
            return undefined;
        }
    }

    async #resolveCompletionItem(item: AutoImportCompletionItem): Promise<monaco.languages.CompletionItem> {
        const client = this.#tsServerClient;
        const entry = item.tsAutoImportEntry;

        if (!client || !entry) return item;

        try {
            // The item's own range (always a plain IRange - #provideCompletionItems
            // never uses the insert/replace variant) starts where completion
            // was requested - completionEntryDetails needs that same
            // position to resolve which declaration this entry refers to.
            const range = item.range as monaco.IRange;

            const [details] = await client.sendRequest<TsServerCompletionEntryDetails[]>("completionEntryDetails", {
                file: WORKDIR_FILE_PATH,
                line: range.startLineNumber,
                offset: range.startColumn,
                entryNames: [entry],
                projectRootPath: WORKDIR_ROOT_PATH
            });

            if (!details) return item;

            const additionalTextEdits = toAdditionalTextEdits(details, WORKDIR_FILE_PATH).map(edit => ({
                range: new monaco.Range(edit.range.startLineNumber, edit.range.startColumn, edit.range.endLineNumber, edit.range.endColumn),
                text: edit.text
            }));

            return { ...item, additionalTextEdits };
        } catch {
            return item;
        }
    }

    async #provideSignatureHelp(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): Promise<monaco.languages.SignatureHelpResult | undefined> {
        const client = this.#tsServerClient;

        if (!client || model.uri.toString() !== this.#model.uri.toString()) return undefined;

        try {
            // Same reasoning as completion above: this fires immediately on
            // typing "(" / "," with no debounce, so send the latest content
            // first to guarantee tsserver sees it before answering.
            void client.sendCommand("open", {
                file: WORKDIR_FILE_PATH,
                fileContent: model.getValue(),
                scriptKindName: "TS",
                projectRootPath: WORKDIR_ROOT_PATH
            });

            const info = await client.sendRequest<TsServerSignatureHelpItems>("signatureHelp", {
                file: WORKDIR_FILE_PATH,
                line: position.lineNumber,
                offset: position.column,
                projectRootPath: WORKDIR_ROOT_PATH
            });

            return { value: toSignatureHelp(info), dispose() {} };
        } catch {
            // tsserver rejects when the caret isn't inside a call/argument
            // list at all - not a real error.
            return undefined;
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
