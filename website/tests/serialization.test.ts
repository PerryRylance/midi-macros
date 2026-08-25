import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildDownloadArchive } from "../src/serialization";

describe("buildDownloadArchive", () => {
    it("zips the program source, package.json and package-lock.json under fixed names", async () => {
        const blob = await buildDownloadArchive({
            source: "export default 1;\n",
            packageJson: "{\"name\":\"sandbox\"}",
            packageLockJson: "{\"lockfileVersion\":3}"
        });

        const zip = await JSZip.loadAsync(await blob.arrayBuffer());

        expect(Object.keys(zip.files).sort()).toEqual(["package-lock.json", "package.json", "program.ts"]);
        expect(await zip.file("program.ts")!.async("string")).toBe("export default 1;\n");
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
