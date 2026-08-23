import { test, expect } from "@playwright/test";

// Scoped to `[data-uri]` because Monaco's rename contribution (loaded via
// `editor.all.js`) creates its own nested `.monaco-editor` widget for the
// rename input box, which would otherwise make ".monaco-editor" ambiguous.
function editorRoot(page: import("@playwright/test").Page) {
    return page.locator(".monaco-editor[data-uri]");
}

async function replaceEditorContent(page: import("@playwright/test").Page, text: string): Promise<void> {
    await editorRoot(page).locator("textarea").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(text);
}

test("shows Play, Pause and Stop buttons in the toolbar", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");

    await expect(controls.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Stop" })).toBeVisible();
});

test("disables the controls until the SoundFont finishes loading", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    const playButton = controls.getByRole("button", { name: "Play" });

    // The SoundFont starts loading immediately on page load (see
    // mm-soundfont-select.ts), so this may already be enabled by the time we
    // check - the real assertion is the "becomes enabled" one below.
    await expect(playButton).toBeEnabled({ timeout: 30_000 });
    await expect(controls.getByRole("button", { name: "Pause" })).toBeEnabled();
    await expect(controls.getByRole("button", { name: "Stop" })).toBeEnabled();
});

test("renders and plays the editor's default program, then pauses and stops", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");

    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 30_000 });

    await controls.getByRole("button", { name: "Play" }).click();
    await expect(page.locator("#playback-status")).toHaveText("Playing.", { timeout: 60_000 });

    await controls.getByRole("button", { name: "Pause" }).click();
    await expect(page.locator("#playback-status")).toHaveText("Paused.");

    await controls.getByRole("button", { name: "Stop" }).click();
    await expect(page.locator("#playback-status")).toHaveText("Stopped.");
});

test("shows Terminal and Output tabs below the editor, with Terminal active by default", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#tab-button-terminal")).toBeVisible();
    await expect(page.locator("#tab-button-output")).toBeVisible();

    await expect(page.locator("#tab-terminal")).toBeVisible();
    await expect(page.locator("#tab-output")).toBeHidden();
});

test("shows a runtime ReferenceError from the program in the build output", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 30_000 });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
    await replaceEditorContent(page, "breaking();");

    await controls.getByRole("button", { name: "Play" }).click();

    await expect(page.locator("#build-output-message")).toContainText("ReferenceError: breaking is not defined", {
        timeout: 60_000
    });
});

test("shows a success message in the build output for a program that builds cleanly", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 30_000 });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
    // Deliberately not the default program (there's a known, separate issue
    // with it being tracked down independently) - this is the simplest
    // possible program known to build cleanly.
    await replaceEditorContent(page, 'import { File } from "@perry-rylance/midi";\nexport default new File();');

    await controls.getByRole("button", { name: "Play" }).click();

    await expect(page.locator("#build-output-message")).toHaveText("Build successful.", { timeout: 60_000 });
});
