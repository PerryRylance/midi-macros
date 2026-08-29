import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { archiveFileName, buildDownloadArchive, filenameFromUrl, InvalidArchiveError, parseUploadArchive, titleFromArchiveFileName } from "../src/serialization";
import dockerfileContents from "../src/stubs/Dockerfile.stub?raw";
import dockerComposeContents from "../src/stubs/docker-compose.yml.stub?raw";
import runScriptContents from "../src/stubs/run.ts.stub?raw";
import launchJsonContents from "../src/stubs/launch.json.stub?raw";
import dockerReadmeContents from "../src/stubs/README.md.stub?raw";

const DOCKER_EXPORT_FILE_NAMES = [".vscode/", ".vscode/launch.json", "Dockerfile", "README.md", "docker-compose.yml", "run.ts"];

const VALID_FILES = {
    source: "export default 1;\n",
    packageJson: "{\"name\":\"sandbox\"}",
    packageLockJson: "{\"lockfileVersion\":3}"
};

const MIDI_BYTES = new Uint8Array([0x4d, 0x54, 0x68, 0x64]).buffer;

function buildZip(files: Partial<Record<"performance.ts" | "package.json" | "package-lock.json", string>>): Promise<ArrayBuffer> {
    const zip = new JSZip();

    for (const [name, contents] of Object.entries(files)) {
        zip.file(name, contents);
    }

    return zip.generateAsync({ type: "arraybuffer" });
}

describe("buildDownloadArchive", () => {
    it("zips the performance source, package.json, package-lock.json and generated MIDI under fixed names", async () => {
        const blob = await buildDownloadArchive({
            source: "export default 1;\n",
            packageJson: "{\"name\":\"sandbox\"}",
            packageLockJson: "{\"lockfileVersion\":3}",
            midi: MIDI_BYTES
        });

        const zip = await JSZip.loadAsync(await blob.arrayBuffer());

        expect(Object.keys(zip.files).sort()).toEqual(
            ["generated.mid", "package-lock.json", "package.json", "performance.ts", ...DOCKER_EXPORT_FILE_NAMES].sort()
        );
        expect(await zip.file("performance.ts")!.async("string")).toBe("export default 1;\n");
        expect(await zip.file("package.json")!.async("string")).toBe("{\"name\":\"sandbox\"}");
        expect(await zip.file("package-lock.json")!.async("string")).toBe("{\"lockfileVersion\":3}");
        expect(await zip.file("generated.mid")!.async("arraybuffer")).toEqual(MIDI_BYTES);
    });

    it("includes the Docker debugging setup, matching the stub files exactly", async () => {
        const blob = await buildDownloadArchive(VALID_FILES);

        const zip = await JSZip.loadAsync(await blob.arrayBuffer());

        expect(await zip.file("Dockerfile")!.async("string")).toBe(dockerfileContents);
        expect(await zip.file("docker-compose.yml")!.async("string")).toBe(dockerComposeContents);
        expect(await zip.file("run.ts")!.async("string")).toBe(runScriptContents);
        expect(await zip.file("README.md")!.async("string")).toBe(dockerReadmeContents);
        expect(await zip.file(".vscode/launch.json")!.async("string")).toBe(launchJsonContents);
    });

    it("includes the Docker debugging setup even when no MIDI could be rendered", async () => {
        const blob = await buildDownloadArchive({
            source: "export const x = 1;\n",
            packageJson: "{\"name\":\"sandbox\"}",
            packageLockJson: "{\"lockfileVersion\":3}"
        });

        const zip = await JSZip.loadAsync(await blob.arrayBuffer());

        for (const name of DOCKER_EXPORT_FILE_NAMES) {
            expect(Object.keys(zip.files)).toContain(name);
        }
    });

    it("compresses the archive instead of storing files uncompressed", async () => {
        const repetitive = "console.log(\"hello world\");\n".repeat(2000);

        const blob = await buildDownloadArchive({
            source: repetitive,
            packageJson: repetitive,
            packageLockJson: repetitive,
            midi: MIDI_BYTES
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

describe("filenameFromUrl", () => {
    it("extracts the last path segment", () => {
        expect(filenameFromUrl("https://example.com/path/to/my-song.zip")).toBe("my-song.zip");
    });

    it("ignores a query string", () => {
        expect(filenameFromUrl("https://example.com/my-song.zip?token=abc")).toBe("my-song.zip");
    });

    it("decodes percent-encoded characters", () => {
        expect(filenameFromUrl("https://example.com/my%20song.zip")).toBe("my song.zip");
    });

    it("returns an empty string for a URL with no path segment", () => {
        expect(filenameFromUrl("https://example.com/")).toBe("");
    });
});
