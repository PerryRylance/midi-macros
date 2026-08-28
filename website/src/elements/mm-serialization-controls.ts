import { createElement, Download, Upload } from "lucide";
import { bootWebContainer, loadUploadedProject, onNpmBusyChange } from "../webcontainer";
import { archiveFileName, buildDownloadArchive, parseUploadArchive, titleFromArchiveFileName } from "../serialization";
import {
    dispatchBuildOutput,
    dispatchBuildOutputClear,
    dispatchTerminalOutput,
    dispatchUploadBusy,
    dispatchUploadIdle
} from "../events";
import type { MmEditableTitleElement } from "./mm-editable-title";
import type { MmEditorElement } from "./mm-editor";
import type { MmTabsElement } from "./mm-tabs";

const BUILD_TABS_ID = "build-tabs";
const OUTPUT_PANEL_ID = "tab-output";

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// Revoking on the next tick, rather than immediately after click(), gives
// the browser a chance to actually start the download first - some browsers
// abort it if the object URL is gone by the time they get to it.
function triggerDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 0);
}

export class MmSerializationControlsElement extends HTMLElement {
    #downloadButton: HTMLButtonElement;
    #uploadButton: HTMLButtonElement;
    #fileInput: HTMLInputElement;

    #npmBusy = false;
    #downloading = false;
    #uploading = false;
    #unsubscribeNpmBusy: (() => void) | undefined;

    #onNpmBusyChange = (busy: boolean): void => {
        this.#npmBusy = busy;
        this.#updateDisabled();
    };

    constructor() {
        super();

        this.#downloadButton = document.createElement("button");
        this.#downloadButton.id = "download-button";
        this.#downloadButton.type = "button";
        this.#downloadButton.disabled = true;
        this.#downloadButton.setAttribute("aria-label", "Download");
        this.#downloadButton.append(createElement(Download));

        this.#downloadButton.addEventListener("click", () => void this.#handleDownload());

        this.#uploadButton = document.createElement("button");
        this.#uploadButton.id = "upload-button";
        this.#uploadButton.type = "button";
        this.#uploadButton.disabled = true;
        this.#uploadButton.setAttribute("aria-label", "Upload");
        this.#uploadButton.append(createElement(Upload));

        // The button is what's shown/clicked - the file input just supplies
        // the native file picker, kept out of the layout since it renders as
        // an unstyleable platform widget.
        this.#fileInput = document.createElement("input");
        this.#fileInput.id = "upload-input";
        this.#fileInput.type = "file";
        this.#fileInput.accept = ".zip,application/zip";
        this.#fileInput.hidden = true;

        this.#uploadButton.addEventListener("click", () => this.#fileInput.click());
        this.#fileInput.addEventListener("change", () => void this.#handleUpload());

        this.append(this.#downloadButton, this.#uploadButton, this.#fileInput);
    }

    connectedCallback(): void {
        this.#unsubscribeNpmBusy = onNpmBusyChange(this.#onNpmBusyChange);
    }

    disconnectedCallback(): void {
        this.#unsubscribeNpmBusy?.();
    }

    #updateDisabled(): void {
        const disabled = this.#npmBusy || this.#downloading || this.#uploading;

        this.#downloadButton.disabled = disabled;
        this.#uploadButton.disabled = disabled;
    }

    async #handleDownload(): Promise<void> {
        const editor = document.querySelector<MmEditorElement>("#editor");

        if (!editor) return;

        this.#downloading = true;
        this.#updateDisabled();
        dispatchBuildOutputClear();
        dispatchBuildOutput({ status: "info", message: "Preparing download..." });
        document.querySelector<MmTabsElement>(`#${BUILD_TABS_ID}`)?.activatePanel(OUTPUT_PANEL_ID);

        try {
            const container = await bootWebContainer();

            const [packageJson, packageLockJson] = await Promise.all([
                container.fs.readFile("package.json", "utf-8"),
                container.fs.readFile("package-lock.json", "utf-8")
            ]);

            const archive = await buildDownloadArchive({
                source: editor.getSource(),
                packageJson,
                packageLockJson
            });

            const title = document.querySelector<MmEditableTitleElement>("#editable-title")?.getTitle() ?? "";

            triggerDownload(archive, archiveFileName(title));

            dispatchBuildOutput({ status: "success", message: "Download ready." });
        } catch (error) {
            dispatchBuildOutput({ status: "error", message: toErrorMessage(error) });
        } finally {
            this.#downloading = false;
            this.#updateDisabled();
        }
    }

    async #handleUpload(): Promise<void> {
        const file = this.#fileInput.files?.[0];
        const editor = document.querySelector<MmEditorElement>("#editor");

        // Cleared up front (rather than in `finally`) so re-selecting the
        // same file still fires a fresh "change" event next time.
        this.#fileInput.value = "";

        if (!file || !editor) return;

        this.#uploading = true;
        this.#updateDisabled();
        dispatchUploadBusy();
        dispatchBuildOutputClear();
        dispatchBuildOutput({ status: "info", message: "Reading uploaded archive..." });
        document.querySelector<MmTabsElement>(`#${BUILD_TABS_ID}`)?.activatePanel(OUTPUT_PANEL_ID);

        try {
            const { source, packageJson, packageLockJson } = await parseUploadArchive(await file.arrayBuffer());

            dispatchBuildOutput({ status: "info", message: "Installing dependencies..." });

            const container = await bootWebContainer();
            const result = await loadUploadedProject(
                container,
                { packageJson, packageLockJson },
                chunk => dispatchTerminalOutput(chunk)
            );

            if (result.exitCode !== 0) {
                throw new Error(result.output.trim() || `npm ci exited with code ${result.exitCode}.`);
            }

            editor.setSource(source);
            document.querySelector<MmEditableTitleElement>("#editable-title")?.setTitle(titleFromArchiveFileName(file.name));

            dispatchBuildOutput({ status: "success", message: "Upload complete." });
        } catch (error) {
            dispatchBuildOutput({ status: "error", message: toErrorMessage(error) });
        } finally {
            this.#uploading = false;
            this.#updateDisabled();
            dispatchUploadIdle();
        }
    }
}

customElements.define("mm-serialization-controls", MmSerializationControlsElement);
