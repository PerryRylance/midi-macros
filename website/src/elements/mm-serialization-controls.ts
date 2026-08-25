import { createElement, Download } from "lucide";
import { bootWebContainer, onNpmBusyChange } from "../webcontainer";
import { buildDownloadArchive } from "../serialization";
import { dispatchBuildOutput, dispatchBuildOutputClear } from "../events";
import type { MmEditorElement } from "./mm-editor";
import type { MmTabsElement } from "./mm-tabs";

const BUILD_TABS_ID = "build-tabs";
const OUTPUT_PANEL_ID = "tab-output";
const ARCHIVE_FILE_NAME = "midi-macros.zip";

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
    #npmBusy = false;
    #downloading = false;
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

        this.append(this.#downloadButton);
    }

    connectedCallback(): void {
        this.#unsubscribeNpmBusy = onNpmBusyChange(this.#onNpmBusyChange);
    }

    disconnectedCallback(): void {
        this.#unsubscribeNpmBusy?.();
    }

    #updateDisabled(): void {
        this.#downloadButton.disabled = this.#npmBusy || this.#downloading;
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

            triggerDownload(archive, ARCHIVE_FILE_NAME);

            dispatchBuildOutput({ status: "success", message: "Download ready." });
        } catch (error) {
            dispatchBuildOutput({ status: "error", message: toErrorMessage(error) });
        } finally {
            this.#downloading = false;
            this.#updateDisabled();
        }
    }
}

customElements.define("mm-serialization-controls", MmSerializationControlsElement);
