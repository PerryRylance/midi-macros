import JSZip from "jszip";
import { PERFORMANCE_FILE_NAME } from "./performanceEvaluator";

// Shared with mm-editable-title.ts, which falls back to this same string when
// no title has ever been saved - keeping the two in sync here means a blank
// title always downloads under the same name the editable heading itself
// falls back to displaying.
export const DEFAULT_TITLE = "MIDI Macros";

export function archiveFileName(title: string): string {
    const trimmed = title.trim();

    return `${trimmed.length > 0 ? trimmed : DEFAULT_TITLE}.zip`;
}

export function titleFromArchiveFileName(fileName: string): string {
    return fileName.replace(/\.zip$/i, "");
}

export const GENERATED_MIDI_FILE_NAME = "generated.mid";

export interface DownloadArchiveInput {
    source: string;
    packageJson: string;
    packageLockJson: string;
    // Omitted by the autosave snapshot (see autosave.ts) - that archive is
    // only ever read back by parseUploadArchive, which never looks at
    // generated.mid, so there's no reason to pay for a fresh render on every
    // debounce tick.
    midi?: ArrayBuffer;
}

export async function buildDownloadArchive(input: DownloadArchiveInput): Promise<Blob> {
    const zip = new JSZip();

    zip.file(PERFORMANCE_FILE_NAME, input.source);
    zip.file("package.json", input.packageJson);
    zip.file("package-lock.json", input.packageLockJson);

    if (input.midi) zip.file(GENERATED_MIDI_FILE_NAME, input.midi);

    // JSZip defaults to STORE (no compression) unless told otherwise.
    return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
}

export interface UploadedArchiveFiles {
    source: string;
    packageJson: string;
    packageLockJson: string;
}

const REQUIRED_ARCHIVE_FILES = [PERFORMANCE_FILE_NAME, "package.json", "package-lock.json"] as const;

// Deliberately doesn't validate the JSON's integrity or the TS source's
// validity - npm and tsserver already do that once the files reach the
// container/editor, so this only checks the one thing they can't: that the
// archive actually is a ZIP, and actually contains the files we're about to
// hand them.
export class InvalidArchiveError extends Error {}

export async function parseUploadArchive(data: Blob | ArrayBuffer): Promise<UploadedArchiveFiles> {
    let zip: JSZip;

    try {
        zip = await JSZip.loadAsync(data);
    } catch {
        throw new InvalidArchiveError("Could not read the uploaded file as a ZIP archive.");
    }

    const missing = REQUIRED_ARCHIVE_FILES.filter(name => !zip.file(name));

    if (missing.length > 0) {
        throw new InvalidArchiveError(`The uploaded ZIP is missing: ${missing.join(", ")}.`);
    }

    const [source, packageJson, packageLockJson] = await Promise.all([
        zip.file(PERFORMANCE_FILE_NAME)!.async("string"),
        zip.file("package.json")!.async("string"),
        zip.file("package-lock.json")!.async("string")
    ]);

    return { source, packageJson, packageLockJson };
}
