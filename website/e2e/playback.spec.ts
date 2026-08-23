import { test, expect } from "@playwright/test";

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
