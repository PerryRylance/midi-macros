import JSZip from "jszip";
import { PROGRAM_FILE_NAME } from "./programEvaluator";

export interface DownloadArchiveInput {
    source: string;
    packageJson: string;
    packageLockJson: string;
}

export async function buildDownloadArchive(input: DownloadArchiveInput): Promise<Blob> {
    const zip = new JSZip();

    zip.file(PROGRAM_FILE_NAME, input.source);
    zip.file("package.json", input.packageJson);
    zip.file("package-lock.json", input.packageLockJson);

    // JSZip defaults to STORE (no compression) unless told otherwise.
    return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
}
