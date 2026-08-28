import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { archiveFileName, buildDownloadArchive, InvalidArchiveError, parseUploadArchive, titleFromArchiveFileName } from "../src/serialization";

const VALID_FILES = {
    source: "export default 1;\n",
    packageJson: "{\"name\":\"sandbox\"}",
    packageLockJson: "{\"lockfileVersion\":3}"
};

function buildZip(files: Partial<Record<"performance.ts" | "package.json" | "package-lock.json", string>>): Promise<ArrayBuffer> {
    const zip = new JSZip();

    for (const [name, contents] of Object.entries(files)) {
        zip.file(name, contents);
    }

    return zip.generateAsync({ type: "arraybuffer" });
}

describe("buildDownloadArchive", () => {
    it("zips the performance source, package.json and package-lock.json under fixed names", async () => {
        const blob = await buildDownloadArchive({
            source: "export default 1;\n",
            packageJson: "{\"name\":\"sandbox\"}",
            packageLockJson: "{\"lockfileVersion\":3}"
        });

        const zip = await JSZip.loadAsync(await blob.arrayBuffer());

        expect(Object.keys(zip.files).sort()).toEqual(["package-lock.json", "package.json", "performance.ts"]);
        expect(await zip.file("performance.ts")!.async("string")).toBe("export default 1;\n");
        expect(await zip.file("package.json")!.async("string")).toBe("{\"name\":\"sandbox\"}");
        expect(await zip.file("package-lock.json")!.async("string")).toBe("{\"lockfileVersion\":3}");
    });

    it("compresses the archive instead of storing files uncompressed", async () => {
        const repetitive = "console.log(\"hello world\");\n".repeat(2000);

        const blob = await buildDownloadArchive({
            source: repetitive,
            packageJson: repetitive,
            packageLockJson: repetitive
        });

        expect(blob.size).toBeLessThan(repetitive.length / 10);
    });
});

describe("parseUploadArchive", () => {
    it("extracts the performance source, package.json and package-lock.json", async () => {
        const archive = await buildZip({
            "performance.ts": VALID_FILES.source,
            "package.json": VALID_FILES.packageJson,
            "package-lock.json": VALID_FILES.packageLockJson
        });

        const result = await parseUploadArchive(archive);

        expect(result).toEqual(VALID_FILES);
    });

    it("rejects an archive missing package-lock.json, naming it", async () => {
        const archive = await buildZip({
            "performance.ts": VALID_FILES.source,
            "package.json": VALID_FILES.packageJson
        });

        await expect(parseUploadArchive(archive)).rejects.toThrow(InvalidArchiveError);
        await expect(parseUploadArchive(archive)).rejects.toThrow(/package-lock\.json/);
    });

    it("rejects an archive missing multiple files, naming all of them", async () => {
        const archive = await buildZip({ "performance.ts": VALID_FILES.source });

        await expect(parseUploadArchive(archive)).rejects.toThrow(/package\.json/);
        await expect(parseUploadArchive(archive)).rejects.toThrow(/package-lock\.json/);
    });

    it("rejects data that isn't a valid ZIP at all", async () => {
        const notAZip = new TextEncoder().encode("this is definitely not a zip file").buffer;

        await expect(parseUploadArchive(notAZip)).rejects.toThrow(InvalidArchiveError);
        await expect(parseUploadArchive(notAZip)).rejects.toThrow(/ZIP/);
    });
});

describe("archiveFileName", () => {
    it("appends .zip to the given title", () => {
        expect(archiveFileName("My Song")).toBe("My Song.zip");
    });

    it("trims surrounding whitespace", () => {
        expect(archiveFileName("  My Song  ")).toBe("My Song.zip");
    });

    it("falls back to the default title when blank", () => {
        expect(archiveFileName("")).toBe("MIDI Macros.zip");
        expect(archiveFileName("   ")).toBe("MIDI Macros.zip");
    });
});

describe("titleFromArchiveFileName", () => {
    it("strips a trailing .zip extension", () => {
        expect(titleFromArchiveFileName("My Song.zip")).toBe("My Song");
    });

    it("is case-insensitive about the extension", () => {
        expect(titleFromArchiveFileName("My Song.ZIP")).toBe("My Song");
    });

    it("leaves a name with no .zip extension untouched", () => {
        expect(titleFromArchiveFileName("My Song")).toBe("My Song");
    });
});
