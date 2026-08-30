import { createElement, Download, FilePlus, Upload } from "lucide";
import { bootWebContainer, loadUploadedProject, onNpmBusyChange, resetToDefaultProject } from "../webcontainer";
import { archiveFileName, buildDownloadArchive, filenameFromUrl, parseUploadArchive, titleFromArchiveFileName } from "../serialization";
import { evaluatePerformance } from "../performanceEvaluator";
import { installToolingDependencies, startTsServer } from "../tsServer";
import { clearModified, isModified } from "../modifiedState";
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

import DEFAULT_SOURCE from "../stubs/default.performance.ts.stub?raw";

const BUILD_TABS_ID = "build-tabs";
const OUTPUT_PANEL_ID = "tab-output";

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function fetchArchive(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Could not download the archive (HTTP ${response.status}).`);
    }

    return response.arrayBuffer();
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
    #newButton: HTMLButtonElement;
    #downloadButton: HTMLButtonElement;
    #uploadButton: HTMLButtonElement;
    #confirmNewDialog: HTMLDialogElement;
    #importDialog: HTMLDialogElement;
    #fileInput: HTMLInputElement;
    #urlInput: HTMLInputElement;

    #npmBusy = false;
    #creatingNew = false;
    #downloading = false;
    #uploading = false;
    #unsubscribeNpmBusy: (() => void) | undefined;

    #onNpmBusyChange = (busy: boolean): void => {
        this.#npmBusy = busy;
        this.#updateDisabled();
    };

    constructor() {
        super();

        this.#newButton = document.createElement("button");
        this.#newButton.id = "new-button";
        this.#newButton.type = "button";
        this.#newButton.disabled = true;
        this.#newButton.setAttribute("aria-label", "New");
        this.#newButton.append(createElement(FilePlus));
        this.#newButton.addEventListener("click", () => this.#handleNewClick());

        const confirmNewMessage = document.createElement("p");
        confirmNewMessage.textContent = "Starting a new performance will discard your current one. This can't be undone.";

        const confirmNewButton = document.createElement("button");
        confirmNewButton.id = "confirm-new-button";
        confirmNewButton.type = "submit";
        confirmNewButton.textContent = "Start new";

        const cancelNewButton = document.createElement("button");
        cancelNewButton.id = "cancel-new-button";
        cancelNewButton.type = "button";
        cancelNewButton.addEventListener("click", () => this.#confirmNewDialog.close());
        cancelNewButton.textContent = "Cancel";

        const confirmNewButtonContainer = document.createElement("div");
        confirmNewButtonContainer.className = "button-container";
        confirmNewButtonContainer.append(confirmNewButton, cancelNewButton);

        const confirmNewForm = document.createElement("form");
        confirmNewForm.id = "confirm-new-form";
        confirmNewForm.append(confirmNewMessage, confirmNewButtonContainer);
        confirmNewForm.addEventListener("submit", event => {
            event.preventDefault();
            this.#confirmNewDialog.close();
            void this.#performNew();
        });

        this.#confirmNewDialog = document.createElement("dialog");
        this.#confirmNewDialog.id = "confirm-new-dialog";
        this.#confirmNewDialog.append(confirmNewForm);

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
        this.#uploadButton.addEventListener("click", () => this.#openImportDialog());

        const fileLabel = document.createElement("label");
        fileLabel.htmlFor = "import-file-input";
        fileLabel.textContent = "From disk";

        this.#fileInput = document.createElement("input");
        this.#fileInput.id = "import-file-input";
        this.#fileInput.type = "file";
        this.#fileInput.accept = ".zip,application/zip";

        const urlLabel = document.createElement("label");
        urlLabel.htmlFor = "import-url-input";
        urlLabel.textContent = "From URL";

        this.#urlInput = document.createElement("input");
        this.#urlInput.id = "import-url-input";
        this.#urlInput.type = "url";

        const importButton = document.createElement("button");
        importButton.id = "import-button";
        importButton.type = "submit";
        importButton.textContent = "Import";

        const cancelButton = document.createElement("button");
        cancelButton.id = "cancel-import-button";
        cancelButton.type = "button";
        cancelButton.addEventListener("click", () => this.#importDialog.close());
        cancelButton.textContent = "Cancel";

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "button-container";
        buttonContainer.append(importButton, cancelButton);

        const form = document.createElement("form");
        form.id = "import-form";
        form.append(fileLabel, this.#fileInput, urlLabel, this.#urlInput, buttonContainer);
        form.addEventListener("submit", event => this.#handleImportSubmit(event));

        this.#importDialog = document.createElement("dialog");
        this.#importDialog.id = "import-dialog";
        this.#importDialog.append(form);

        this.append(this.#newButton, this.#confirmNewDialog, this.#downloadButton, this.#uploadButton, this.#importDialog);
    }

    connectedCallback(): void {
        this.#unsubscribeNpmBusy = onNpmBusyChange(this.#onNpmBusyChange);
    }

    disconnectedCallback(): void {
        this.#unsubscribeNpmBusy?.();
    }

    #updateDisabled(): void {
        const disabled = this.#npmBusy || this.#creatingNew || this.#downloading || this.#uploading;

        this.#newButton.disabled = disabled;
        this.#downloadButton.disabled = disabled;
        this.#uploadButton.disabled = disabled;
    }

    #handleNewClick(): void {
        if (isModified()) {
            this.#confirmNewDialog.showModal();
            return;
        }

        void this.#performNew();
    }

    async #performNew(): Promise<void> {
        const editor = document.querySelector<MmEditorElement>("#editor");

        if (!editor) return;

        this.#creatingNew = true;
        this.#updateDisabled();
        dispatchBuildOutputClear();
        dispatchBuildOutput({ status: "info", message: "Starting a new performance..." });
        document.querySelector<MmTabsElement>(`#${BUILD_TABS_ID}`)?.activatePanel(OUTPUT_PANEL_ID);

        try {
            const container = await bootWebContainer();

            const result = await resetToDefaultProject(container, chunk => dispatchTerminalOutput(chunk));

            if (result.exitCode !== 0) {
                throw new Error(result.output.trim() || `npm install exited with code ${result.exitCode}.`);
            }

            // resetToDefaultProject's fresh package.json only declares the
            // user-facing DEFAULT_DEPENDENCIES - restore the editor tooling
            // (typescript, midi-to-milliseconds) it also wiped, since
            // startTsServer won't repeat this itself (memoized to run once
            // per page load).
            await installToolingDependencies(container);

            editor.setSource(DEFAULT_SOURCE);
            document.querySelector<MmEditableTitleElement>("#editable-title")?.resetTitle();
            clearModified();

            dispatchBuildOutput({ status: "success", message: "Started a new performance." });
        } catch (error) {
            dispatchBuildOutput({ status: "error", message: toErrorMessage(error) });
        } finally {
            this.#creatingNew = false;
            this.#updateDisabled();
        }
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
            await startTsServer(container);

            const source = editor.getSource();

            const [packageJson, packageLockJson] = await Promise.all([
                container.fs.readFile("package.json", "utf-8"),
                container.fs.readFile("package-lock.json", "utf-8")
            ]);

            // A performance that can't currently be rendered (e.g. mid-edit,
            // or a genuine bug) shouldn't block exporting the source itself -
            // only generated.mid is skipped, with an error noted alongside
            // the eventual "Download ready." success message.
            let midi: ArrayBuffer | undefined;

            try {
                ({ midi } = await evaluatePerformance(container, source));
            } catch (error) {
                dispatchBuildOutput({ status: "error", message: `Could not generate MIDI: ${toErrorMessage(error)}` });
            }

            const archive = await buildDownloadArchive({
                source,
                packageJson,
                packageLockJson,
                ...(midi ? { midi } : {})
            });

            const title = document.querySelector<MmEditableTitleElement>("#editable-title")?.getTitle() ?? "";

            triggerDownload(archive, archiveFileName(title));
            clearModified();

            dispatchBuildOutput({ status: "success", message: "Download ready." });
        } catch (error) {
            dispatchBuildOutput({ status: "error", message: toErrorMessage(error) });
        } finally {
            this.#downloading = false;
            this.#updateDisabled();
        }
    }

    #openImportDialog(): void {
        this.#fileInput.value = "";
        this.#urlInput.value = "";
        this.#importDialog.showModal();
    }

    async #handleImportSubmit(event: SubmitEvent): Promise<void> {
        event.preventDefault();

        // The file takes precedence if both are somehow filled in - picking
        // a file is the more deliberate of the two actions.
        const file = this.#fileInput.files?.[0];
        const url = this.#urlInput.value.trim();

        if (!file && !url) return;

        this.#importDialog.close();

        if (file) {
            await this.#importArchive(file.name, () => file.arrayBuffer());
        } else {
            await this.#importArchive(filenameFromUrl(url), () => fetchArchive(url));
        }
    }

    async #importArchive(name: string, readData: () => Promise<ArrayBuffer>): Promise<void> {
        const editor = document.querySelector<MmEditorElement>("#editor");

        if (!editor) return;

        this.#uploading = true;
        this.#updateDisabled();
        dispatchUploadBusy();
        dispatchBuildOutputClear();
        dispatchBuildOutput({ status: "info", message: "Reading uploaded archive..." });
        document.querySelector<MmTabsElement>(`#${BUILD_TABS_ID}`)?.activatePanel(OUTPUT_PANEL_ID);

        try {
            const { source, packageJson, packageLockJson } = await parseUploadArchive(await readData());

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
            document.querySelector<MmEditableTitleElement>("#editable-title")?.setTitle(titleFromArchiveFileName(name));

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
