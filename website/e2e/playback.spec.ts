import { test, expect } from "@playwright/test";

test("shows Play, Pause and Stop buttons in the toolbar", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");

    await expect(controls.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Stop" })).toBeVisible();
});
