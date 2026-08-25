import JSZip from "jszip";
import { PERFORMANCE_FILE_NAME } from "./performanceEvaluator";

export interface DownloadArchiveInput {
    source: string;
    packageJson: string;
    packageLockJson: string;
}

export async function buildDownloadArchive(input: DownloadArchiveInput): Promise<Blob> {
    const zip = new JSZip();

    zip.file(PERFORMANCE_FILE_NAME, input.source);
    zip.file("package.json", input.packageJson);
    zip.file("package-lock.json", input.packageLockJson);

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
