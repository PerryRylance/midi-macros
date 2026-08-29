import { bootWebContainer, loadUploadedProject } from "./webcontainer";
import { buildDownloadArchive, parseUploadArchive } from "./serialization";
import { clearArchive, hasSavedArchive, loadArchive, saveArchive } from "./persistenceStorage";
import { dispatchBuildOutput, dispatchUploadBusy, dispatchUploadIdle, EDITOR_CHANGED_EVENT } from "./events";
import type { MmEditorElement } from "./elements/mm-editor";

// How long the editor has to sit idle before the current performance is
// saved - deliberately longer than mm-editor's own 300ms tsserver sync
// debounce, since this also reads the container's package.json/lock and
// builds a zip, which isn't worth doing on every short typing pause.
const SAVE_DEBOUNCE_MS = 3000;

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// Reuses the exact same archive format/flow as Download/Upload - a saved
// performance is just an uploaded one whose "file" happens to be
// localStorage instead of something the user picked. Shares UPLOAD_BUSY/IDLE
// too, so playback/serialization stay disabled while this restore's own
// npm ci is running, same as a real upload.
async function restoreSavedPerformance(editor: MmEditorElement): Promise<void> {
    if (!hasSavedArchive()) return;

    dispatchUploadBusy();
    dispatchBuildOutput({ status: "info", message: "Restoring your saved performance..." });

    try {
        // loadArchive() can throw synchronously too (decodeArchive's atob()
        // call, on malformed base64) - kept inside this same try/catch so
        // that failure is reported and cleared identically to a parse/install
        // failure below, rather than needing its own separate handling.
        const archive = loadArchive();

        if (!archive) return;

        const { source, packageJson, packageLockJson } = await parseUploadArchive(archive);

        const container = await bootWebContainer();
        const result = await loadUploadedProject(container, { packageJson, packageLockJson });

        if (result.exitCode !== 0) {
            throw new Error(result.output.trim() || `npm ci exited with code ${result.exitCode}.`);
        }

        editor.setSource(source);

        dispatchBuildOutput({ status: "success", message: "Restored your saved performance." });
    } catch (error) {
        // A saved archive that can't be restored (corrupt, or a lockfile
        // that no longer resolves) would otherwise fail the same way on
        // every future load - clear it so the app falls back to the default
        // performance instead of getting stuck.
        clearArchive();
        dispatchBuildOutput({ status: "error", message: `Could not restore saved performance: ${toErrorMessage(error)}` });
    } finally {
        dispatchUploadIdle();
    }
}

async function saveCurrentPerformance(editor: MmEditorElement): Promise<void> {
    try {
        const container = await bootWebContainer();

        const [packageJson, packageLockJson] = await Promise.all([
            container.fs.readFile("package.json", "utf-8"),
            container.fs.readFile("package-lock.json", "utf-8")
        ]);

        const archive = await buildDownloadArchive({ source: editor.getSource(), packageJson, packageLockJson });

        await saveArchive(archive);
    } catch (error) {
        dispatchBuildOutput({ status: "error", message: `Could not save your progress: ${toErrorMessage(error)}` });
    }
}

let initialRestore: Promise<void> = Promise.resolve();

// mm-editor.ts awaits this before starting tsserver - restoreSavedPerformance's
// `npm ci` and startTsServer's tooling install both go through webcontainer.ts's
// shared npmQueue, but tsserver.js's own `node` process spawn does not, so
// without this a `npm ci` still in flight (or not yet even enqueued, e.g.
// while parseUploadArchive/mount are still running) can wipe/reinstall
// node_modules while tsserver is mid-`require()`, crashing it with
// "Cannot find module .../tsserver.js".
export function waitForInitialRestore(): Promise<void> {
    return initialRestore;
}

function initAutosave(): void {
    const editor = document.querySelector<MmEditorElement>("#editor");

    if (!editor) return;

    initialRestore = restoreSavedPerformance(editor);

    let timer: ReturnType<typeof setTimeout> | undefined;

    document.addEventListener(EDITOR_CHANGED_EVENT, () => {
        if (timer !== undefined) clearTimeout(timer);

        timer = setTimeout(() => void saveCurrentPerformance(editor), SAVE_DEBOUNCE_MS);
    });
}

initAutosave();
