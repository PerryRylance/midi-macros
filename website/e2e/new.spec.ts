import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { BOOT_TIMEOUT, OPERATION_TIMEOUT, SETTLE_TIMEOUT, waitUntilContainerSettled } from "./support/waits";

const STORAGE_KEY = "mm-saved-performance";
const MARKER = "// mm-e2e-new-marker";

function editorRoot(page: Page) {
    return page.locator(".monaco-editor[data-uri]");
}

async function replaceEditorContent(page: Page, text: string): Promise<void> {
    await editorRoot(page).locator("textarea").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(text);
}

const MARKER_SOURCE = `${MARKER}
import { NoteOnEvent, NoteOffEvent, Track, File } from "@perry-rylance/midi";

export default new File().tracks([
    new Track().events([
        new NoteOnEvent().key(72),
        new NoteOffEvent().delta(480).key(72)
    ])
]);
`;

test("shows a New button in the toolbar", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#serialization-controls").getByRole("button", { name: "New" })).toBeVisible();
});

test("does not prompt for confirmation when nothing has changed, and leaves the default performance usable", async ({ page }) => {
    await page.goto("/");

    const newButton = page.locator("#serialization-controls").getByRole("button", { name: "New" });
    const dialog = page.locator("#confirm-new-dialog");
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(newButton);

    await newButton.click();

    await expect(dialog).toBeHidden();
    await expect(output).toContainText("Started a new performance.", { timeout: OPERATION_TIMEOUT });

    const playbackControls = page.locator("#playback-controls");
    await expect(playbackControls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: OPERATION_TIMEOUT });
    await playbackControls.getByRole("button", { name: "Play" }).click();
    await expect(output).toContainText("Build successful.", { timeout: OPERATION_TIMEOUT });
});

test("prompts for confirmation once the editor has been modified, and Cancel leaves the current performance untouched", async ({ page }) => {
    await page.goto("/");

    const newButton = page.locator("#serialization-controls").getByRole("button", { name: "New" });
    const dialog = page.locator("#confirm-new-dialog");

    await waitUntilContainerSettled(newButton);

    await replaceEditorContent(page, MARKER_SOURCE);
    await newButton.click();

    await expect(dialog).toBeVisible();
    await page.locator("#cancel-new-button").click();

    await expect(dialog).toBeHidden();
    await expect(editorRoot(page)).toContainText(MARKER);
});

test("confirming resets the performance and title back to their defaults, with dependencies still working", async ({ page }) => {
    await page.goto("/");

    const newButton = page.locator("#serialization-controls").getByRole("button", { name: "New" });
    const dialog = page.locator("#confirm-new-dialog");
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(newButton);

    await page.locator("#editable-title").hover();
    await page.locator("#editable-title").getByRole("button", { name: "Edit title" }).click();
    await page.locator("#title-input").fill("My Song");
    await page.locator("#title-input").press("Enter");

    await replaceEditorContent(page, MARKER_SOURCE);
    await newButton.click();

    await expect(dialog).toBeVisible();
    await page.locator("#confirm-new-button").click();

    await expect(output).toContainText("Started a new performance.", { timeout: OPERATION_TIMEOUT });
    await expect(editorRoot(page)).not.toContainText(MARKER);
    await expect(editorRoot(page)).toContainText("key(60)");
    await expect(page.locator("#editable-title").getByRole("heading")).toHaveText("MIDI Macros");

    const playbackControls = page.locator("#playback-controls");
    await expect(playbackControls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: OPERATION_TIMEOUT });
    await playbackControls.getByRole("button", { name: "Play" }).click();
    await expect(output).toContainText("Build successful.", { timeout: OPERATION_TIMEOUT });

    // Having just reset back to the pristine default, New shouldn't prompt again.
    await newButton.click();
    await expect(dialog).toBeHidden();
});

test("prompts for confirmation after a performance has been uploaded", async ({ page }) => {
    await page.goto("/");

    const newButton = page.locator("#serialization-controls").getByRole("button", { name: "New" });
    const uploadButton = page.locator("#serialization-controls").getByRole("button", { name: "Upload" });
    const output = page.locator("#build-output-message");
    const dialog = page.locator("#confirm-new-dialog");

    await waitUntilContainerSettled(newButton);

    const archive = await readFile("tests/fixtures/C Major ascending.zip");

    await uploadButton.click();
    await page.locator("#import-file-input").setInputFiles({
        name: "C Major ascending.zip",
        mimeType: "application/zip",
        buffer: archive
    });
    await page.locator("#import-button").click();

    await expect(output).toContainText("Upload complete.", { timeout: OPERATION_TIMEOUT });

    await newButton.click();
    await expect(dialog).toBeVisible();
});

test("prompts for confirmation after a performance has been restored from local storage on reload", async ({ page }) => {
    await page.goto("/");

    const newButton = page.locator("#serialization-controls").getByRole("button", { name: "New" });
    const dialog = page.locator("#confirm-new-dialog");

    await waitUntilContainerSettled(newButton);

    await replaceEditorContent(page, MARKER_SOURCE);

    await expect.poll(
        () => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY),
        { timeout: SETTLE_TIMEOUT }
    ).not.toBeNull();

    await page.reload();

    await expect(editorRoot(page)).toContainText(MARKER, { timeout: BOOT_TIMEOUT });

    const reloadedNewButton = page.locator("#serialization-controls").getByRole("button", { name: "New" });
    await waitUntilContainerSettled(reloadedNewButton);

    await reloadedNewButton.click();
    await expect(dialog).toBeVisible();
});

test("exporting clears the modified flag, so New no longer prompts afterward", async ({ page }) => {
    await page.goto("/");

    const newButton = page.locator("#serialization-controls").getByRole("button", { name: "New" });
    const downloadButton = page.locator("#serialization-controls").getByRole("button", { name: "Download" });
    const dialog = page.locator("#confirm-new-dialog");
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(newButton);

    await replaceEditorContent(page, MARKER_SOURCE);

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        downloadButton.click()
    ]);
    await download.path();

    await expect(output).toContainText("Download ready.", { timeout: OPERATION_TIMEOUT });

    await newButton.click();
    await expect(dialog).toBeHidden();
});

test("disables New alongside download and upload while it's resetting the project", async ({ page }) => {
    await page.goto("/");

    const newButton = page.locator("#serialization-controls").getByRole("button", { name: "New" });
    const downloadButton = page.locator("#serialization-controls").getByRole("button", { name: "Download" });
    const uploadButton = page.locator("#serialization-controls").getByRole("button", { name: "Upload" });

    await waitUntilContainerSettled(newButton);

    await newButton.click();

    await expect(newButton).toBeDisabled();
    await expect(downloadButton).toBeDisabled();
    await expect(uploadButton).toBeDisabled();

    await expect(newButton).toBeEnabled({ timeout: OPERATION_TIMEOUT });
    await expect(downloadButton).toBeEnabled({ timeout: OPERATION_TIMEOUT });
    await expect(uploadButton).toBeEnabled({ timeout: OPERATION_TIMEOUT });
});
