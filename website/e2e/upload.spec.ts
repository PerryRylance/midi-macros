import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { BOOT_TIMEOUT, OPERATION_TIMEOUT, waitUntilContainerSettled } from "./support/waits";

const UPLOAD_MARKER = "// mm-e2e-upload-marker";

function editorRoot(page: Page) {
    return page.locator(".monaco-editor[data-uri]");
}

// Downloads the page's own current package.json/package-lock.json (real,
// npm-generated files from this session's WebContainer) so the fixture zip
// built from them is guaranteed to satisfy `npm ci`'s strict consistency
// check, rather than risking a hand-crafted lockfile that doesn't quite match.
async function downloadCurrentProjectFiles(page: Page): Promise<{ packageJson: string; packageLockJson: string }> {
    const downloadButton = page.locator("#serialization-controls").getByRole("button", { name: "Download" });

    await waitUntilContainerSettled(downloadButton);

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        downloadButton.click()
    ]);

    const archivePath = await download.path();
    const zip = await JSZip.loadAsync(await readFile(archivePath!));

    return {
        packageJson: await zip.file("package.json")!.async("string"),
        packageLockJson: await zip.file("package-lock.json")!.async("string")
    };
}

async function buildUploadFixture(page: Page, source: string): Promise<Buffer> {
    const { packageJson, packageLockJson } = await downloadCurrentProjectFiles(page);

    const zip = new JSZip();
    zip.file("performance.ts", source);
    zip.file("package.json", packageJson);
    zip.file("package-lock.json", packageLockJson);

    return zip.generateAsync({ type: "nodebuffer" });
}

async function openImportDialog(page: Page): Promise<void> {
    await page.locator("#upload-button").click();
}

async function importFromDisk(page: Page, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    await openImportDialog(page);
    await page.locator("#import-file-input").setInputFiles(file);
    await page.locator("#import-button").click();
}

async function importFromUrl(page: Page, url: string, archive: Buffer): Promise<void> {
    await page.route(url, route => route.fulfill({ status: 200, contentType: "application/zip", body: archive }));

    await openImportDialog(page);
    await page.locator("#import-url-input").fill(url);
    await page.locator("#import-button").click();
}

const MARKER_SOURCE = `${UPLOAD_MARKER}
import { NoteOnEvent, NoteOffEvent, Track, File } from "@perry-rylance/midi";

export default new File().tracks([
    new Track().events([
        new NoteOnEvent().key(64),
        new NoteOffEvent().delta(480).key(64)
    ])
]);
`;

test("shows an Upload button in the toolbar", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#serialization-controls");

    await expect(controls.getByRole("button", { name: "Upload" })).toBeVisible();
});

test("opens a dialog with a file input and a URL input when Upload is clicked", async ({ page }) => {
    await page.goto("/");

    const uploadButton = page.locator("#serialization-controls").getByRole("button", { name: "Upload" });
    const dialog = page.locator("#import-dialog");

    await waitUntilContainerSettled(uploadButton);

    await expect(dialog).toBeHidden();
    await uploadButton.click();

    await expect(dialog).toBeVisible();
    await expect(page.locator("#import-file-input")).toBeVisible();
    await expect(page.locator("#import-url-input")).toBeVisible();

    await page.locator("#cancel-import-button").click();
    await expect(dialog).toBeHidden();
});

test("uploads a zip, replacing the editor's performance and reinstalling dependencies", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#serialization-controls");
    const uploadButton = controls.getByRole("button", { name: "Upload" });
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(uploadButton);

    const archive = await buildUploadFixture(page, MARKER_SOURCE);

    await importFromDisk(page, { name: "midi-macros.zip", mimeType: "application/zip", buffer: archive });

    await expect(output).toContainText("Upload complete.", { timeout: OPERATION_TIMEOUT });
    await expect(editorRoot(page)).toContainText(UPLOAD_MARKER);

    // The uploaded project's dependencies were reinstalled, not just its
    // source swapped in - Play should still work against the new performance.
    const playbackControls = page.locator("#playback-controls");
    await expect(playbackControls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: OPERATION_TIMEOUT });
    await playbackControls.getByRole("button", { name: "Play" }).click();
    await expect(output).toContainText("Build successful.", { timeout: OPERATION_TIMEOUT });
});

test("sets the title from the uploaded archive's filename", async ({ page }) => {
    await page.goto("/");

    const uploadButton = page.locator("#serialization-controls").getByRole("button", { name: "Upload" });
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(uploadButton);

    const archive = await buildUploadFixture(page, MARKER_SOURCE);

    await importFromDisk(page, { name: "my-performance.zip", mimeType: "application/zip", buffer: archive });

    await expect(output).toContainText("Upload complete.", { timeout: OPERATION_TIMEOUT });
    await expect(page.locator("#editable-title").getByRole("heading")).toHaveText("my-performance");
});

test("imports a real fixture zip from a URL, replacing the editor's performance and reinstalling dependencies", async ({ page }) => {
    await page.goto("/");

    const uploadButton = page.locator("#serialization-controls").getByRole("button", { name: "Upload" });
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(uploadButton);

    const archive = await readFile("tests/fixtures/C Major ascending.zip");

    await importFromUrl(page, "https://example.com/fixtures/C%20Major%20ascending.zip", archive);

    await expect(output).toContainText("Upload complete.", { timeout: OPERATION_TIMEOUT });
    await expect(editorRoot(page)).toContainText("semitone");
    await expect(page.locator("#editable-title").getByRole("heading")).toHaveText("C Major ascending");

    // The uploaded project's own dependencies were reinstalled, not just its
    // source swapped in - Play should still work against this performance.
    const playbackControls = page.locator("#playback-controls");
    await expect(playbackControls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: OPERATION_TIMEOUT });
    await playbackControls.getByRole("button", { name: "Play" }).click();
    await expect(output).toContainText("Build successful.", { timeout: OPERATION_TIMEOUT });
});

test("shows an error when the URL can't be fetched", async ({ page }) => {
    await page.goto("/");

    const uploadButton = page.locator("#serialization-controls").getByRole("button", { name: "Upload" });
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(uploadButton);

    const url = "https://example.com/fixtures/missing.zip";
    await page.route(url, route => route.fulfill({ status: 404, body: "Not found" }));

    await openImportDialog(page);
    await page.locator("#import-url-input").fill(url);
    await page.locator("#import-button").click();

    await expect(output).toContainText("HTTP 404", { timeout: BOOT_TIMEOUT });
    await expect(uploadButton).toBeEnabled();
});

test("disables playback, download and upload while an upload is processing, then re-enables them", async ({ page }) => {
    await page.goto("/");

    const uploadButton = page.locator("#serialization-controls").getByRole("button", { name: "Upload" });
    const downloadButton = page.locator("#serialization-controls").getByRole("button", { name: "Download" });
    const playButton = page.locator("#playback-controls").getByRole("button", { name: "Play" });
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(uploadButton);

    const archive = await buildUploadFixture(page, MARKER_SOURCE);

    await importFromDisk(page, { name: "midi-macros.zip", mimeType: "application/zip", buffer: archive });

    await expect(uploadButton).toBeDisabled();
    await expect(downloadButton).toBeDisabled();
    await expect(playButton).toBeDisabled();

    await expect(output).toContainText("Upload complete.", { timeout: OPERATION_TIMEOUT });

    // A generous timeout here too: the upload's own npm ci may still be
    // overlapping with the tail of the container's own tsserver tooling
    // install (see waitUntilContainerSettled above), which only clears once
    // that unrelated, coincidentally-overlapping install finishes too.
    await expect(uploadButton).toBeEnabled({ timeout: OPERATION_TIMEOUT });
    await expect(downloadButton).toBeEnabled({ timeout: OPERATION_TIMEOUT });
    await expect(playButton).toBeEnabled({ timeout: OPERATION_TIMEOUT });
});

test("shows an error and leaves playback usable when the archive is missing a required file", async ({ page }) => {
    await page.goto("/");

    const uploadButton = page.locator("#serialization-controls").getByRole("button", { name: "Upload" });
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(uploadButton);

    const zip = new JSZip();
    zip.file("performance.ts", MARKER_SOURCE);
    zip.file("package.json", "{}");
    // package-lock.json deliberately omitted.
    const archive = await zip.generateAsync({ type: "nodebuffer" });

    await importFromDisk(page, { name: "midi-macros.zip", mimeType: "application/zip", buffer: archive });

    await expect(output).toContainText("package-lock.json", { timeout: BOOT_TIMEOUT });
    await expect(editorRoot(page)).not.toContainText(UPLOAD_MARKER);

    await expect(uploadButton).toBeEnabled();
    await expect(page.locator("#playback-controls").getByRole("button", { name: "Play" })).toBeEnabled();
});

test("shows an error for a file that isn't a valid ZIP", async ({ page }) => {
    await page.goto("/");

    const uploadButton = page.locator("#serialization-controls").getByRole("button", { name: "Upload" });
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(uploadButton);

    await importFromDisk(page, {
        name: "not-a-zip.zip",
        mimeType: "application/zip",
        buffer: Buffer.from("this is definitely not a zip file")
    });

    await expect(output).toContainText("ZIP", { timeout: BOOT_TIMEOUT });
    await expect(uploadButton).toBeEnabled();
});
