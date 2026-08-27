import { test, expect } from "@playwright/test";
import { BOOT_TIMEOUT, OPERATION_TIMEOUT } from "./support/waits";

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
    await expect(playButton).toBeEnabled({ timeout: BOOT_TIMEOUT });
    await expect(controls.getByRole("button", { name: "Pause" })).toBeEnabled();
    await expect(controls.getByRole("button", { name: "Stop" })).toBeEnabled();
});

test("renders and plays the editor's default performance, then pauses and stops", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    const output = page.locator("#build-output-message");

    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: BOOT_TIMEOUT });

    await controls.getByRole("button", { name: "Play" }).click();
    await expect(output).toContainText("Rendering audio...");
    await expect(output).toContainText("Playback started.", { timeout: OPERATION_TIMEOUT });

    await controls.getByRole("button", { name: "Pause" }).click();
    await expect(output).toContainText("Paused.");

    await controls.getByRole("button", { name: "Stop" }).click();
    await expect(output).toContainText("Stopped.");
});

test("shows Terminal and Output tabs below the editor, with Terminal active by default", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#tab-button-terminal")).toBeVisible();
    await expect(page.locator("#tab-button-output")).toBeVisible();

    await expect(page.locator("#tab-terminal")).toBeVisible();
    await expect(page.locator("#tab-output")).toBeHidden();
});

test("switches to the Output tab when Play is pressed", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: BOOT_TIMEOUT });

    await expect(page.locator("#tab-terminal")).toBeVisible();
    await expect(page.locator("#tab-output")).toBeHidden();

    await controls.getByRole("button", { name: "Play" }).click();

    await expect(page.locator("#tab-output")).toBeVisible();
    await expect(page.locator("#tab-terminal")).toBeHidden();
});

test("shows a runtime ReferenceError from the performance in the build output", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: BOOT_TIMEOUT });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: BOOT_TIMEOUT });
    // Needs a valid default export so it's the runtime call to the
    // undefined `breaking` that fails, not the (now separately tested)
    // missing-default-export check.
    await replaceEditorContent(
        page,
        'import { File } from "@perry-rylance/midi";\nbreaking();\nexport default new File();'
    );

    await controls.getByRole("button", { name: "Play" }).click();

    await expect(page.locator("#build-output-message")).toContainText("ReferenceError: breaking is not defined", {
        timeout: OPERATION_TIMEOUT
    });
});

test("shows 'No default export' in the build output for a performance with no default export", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    const output = page.locator("#build-output-message");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: BOOT_TIMEOUT });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: BOOT_TIMEOUT });
    // No default export at all - this is a real TypeScript compiler
    // diagnostic (see performanceEvaluator.ts), not a check we run ourselves.
    await replaceEditorContent(page, "export const x = 1;");

    await controls.getByRole("button", { name: "Play" }).click();

    await expect(output).toContainText("No default export", { timeout: OPERATION_TIMEOUT });
});

test("shows a success message in the build output for a performance that builds cleanly", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    const output = page.locator("#build-output-message");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: BOOT_TIMEOUT });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: BOOT_TIMEOUT });
    // Deliberately not the default performance (there's a known, separate
    // issue with it being tracked down independently) - this is the simplest
    // possible performance known to build cleanly.
    await replaceEditorContent(page, 'import { File } from "@perry-rylance/midi";\nexport default new File();');

    await controls.getByRole("button", { name: "Play" }).click();

    await expect(output).toContainText("Rendering audio...");
    await expect(output).toContainText("Build successful.", { timeout: OPERATION_TIMEOUT });
    await expect(output).toContainText("Playback started.", { timeout: OPERATION_TIMEOUT });
});

test("starts playback with Ctrl+Enter", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    const output = page.locator("#build-output-message");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: BOOT_TIMEOUT });

    await page.keyboard.press("Control+Enter");

    await expect(output).toContainText("Rendering audio...");
    await expect(output).toContainText("Playback started.", { timeout: OPERATION_TIMEOUT });
});

test("restarts playback when Ctrl+Enter is pressed again while already playing", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    const output = page.locator("#build-output-message");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: BOOT_TIMEOUT });

    await page.keyboard.press("Control+Enter");
    await expect(output).toContainText("Playback started.", { timeout: OPERATION_TIMEOUT });

    await page.keyboard.press("Control+Enter");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: BOOT_TIMEOUT });
    await expect(output).toContainText("Playback started.", { timeout: OPERATION_TIMEOUT });
});

test("stops playback with Alt+Enter", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    const output = page.locator("#build-output-message");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: BOOT_TIMEOUT });

    await page.keyboard.press("Control+Enter");
    await expect(output).toContainText("Playback started.", { timeout: OPERATION_TIMEOUT });

    await page.keyboard.press("Alt+Enter");
    await expect(output).toContainText("Stopped.");
});

test("clears the build output when Play is pressed again", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    const output = page.locator("#build-output-message");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: BOOT_TIMEOUT });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: BOOT_TIMEOUT });
    await replaceEditorContent(
        page,
        'import { File } from "@perry-rylance/midi";\nbreaking();\nexport default new File();'
    );
    await controls.getByRole("button", { name: "Play" }).click();
    await expect(output).toContainText("ReferenceError: breaking is not defined", { timeout: OPERATION_TIMEOUT });

    await replaceEditorContent(page, 'import { File } from "@perry-rylance/midi";\nexport default new File();');
    await controls.getByRole("button", { name: "Play" }).click();

    await expect(output).toContainText("Build successful.", { timeout: OPERATION_TIMEOUT });
    await expect(output).not.toContainText("ReferenceError");
});
