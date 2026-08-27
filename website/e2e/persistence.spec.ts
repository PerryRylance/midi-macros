import { test, expect, type Page } from "@playwright/test";
import { BOOT_TIMEOUT, OPERATION_TIMEOUT, SETTLE_TIMEOUT } from "./support/waits";

const STORAGE_KEY = "mm-saved-performance";
const MARKER = "// mm-e2e-persistence-marker";

function editorRoot(page: Page) {
    return page.locator(".monaco-editor[data-uri]");
}

async function replaceEditorContent(page: Page, text: string): Promise<void> {
    await editorRoot(page).locator("textarea").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(text);
}

function readSavedPerformance(page: Page): Promise<string | null> {
    return page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
}

const MARKER_SOURCE = `${MARKER}
import { NoteOnEvent, NoteOffEvent, Track, File } from "@perry-rylance/midi";

export default new File().tracks([
    new Track().events([
        new NoteOnEvent().key(67),
        new NoteOffEvent().delta(480).key(67)
    ])
]);
`;

test("saves the performance after a period of inactivity and restores it on reload", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: BOOT_TIMEOUT });
    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: BOOT_TIMEOUT });

    await replaceEditorContent(page, MARKER_SOURCE);

    // Waits for the real autosave debounce to fire and actually write to
    // localStorage, rather than guessing at the timing with a fixed sleep.
    await expect.poll(() => readSavedPerformance(page), { timeout: SETTLE_TIMEOUT }).not.toBeNull();

    await page.reload();

    await expect(editorRoot(page)).toContainText(MARKER, { timeout: BOOT_TIMEOUT });

    const reloadedControls = page.locator("#playback-controls");
    await expect(reloadedControls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: OPERATION_TIMEOUT });
    await reloadedControls.getByRole("button", { name: "Play" }).click();
    await expect(page.locator("#build-output-message")).toContainText("Build successful.", { timeout: OPERATION_TIMEOUT });
});

test("falls back to the default performance and clears the entry when saved data is corrupt", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(key => localStorage.setItem(key, "not valid base64 zip data!!"), STORAGE_KEY);

    await page.reload();

    await expect(page.locator("#build-output-message")).toContainText("Could not restore saved performance", { timeout: BOOT_TIMEOUT });
    await expect(page.locator("#playback-controls").getByRole("button", { name: "Play" })).toBeEnabled({ timeout: OPERATION_TIMEOUT });

    // The editor's preloader spans the whole restore attempt (success or
    // failure - see dispatchUploadBusy/Idle in autosave.ts's
    // restoreSavedPerformance) - it must not be left showing, and blocking
    // the editor, once that attempt has finished.
    await expect(page.locator("#preloader")).toBeHidden();

    expect(await readSavedPerformance(page)).toBeNull();
});
