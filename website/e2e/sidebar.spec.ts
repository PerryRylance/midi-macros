import { test, expect } from "@playwright/test";
import { BOOT_TIMEOUT } from "./support/waits";

test("shows Welcome, Packages, Audio and Reference tabs, with Welcome visible by default", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#tab-button-welcome")).toBeVisible();
    await expect(page.locator("#tab-button-packages")).toBeVisible();
    await expect(page.locator("#tab-button-audio")).toBeVisible();
    await expect(page.locator("#tab-button-reference")).toBeVisible();

    await expect(page.locator("#tab-welcome")).toBeVisible();
    await expect(page.locator("#tab-packages")).toBeHidden();
    await expect(page.locator("#tab-audio")).toBeHidden();
    await expect(page.locator("#tab-reference")).toBeHidden();
});

test("switches tabs when clicking a tab button, showing only that tab's panel", async ({ page }) => {
    await page.goto("/");

    await page.locator("#tab-button-audio").click();

    await expect(page.locator("#tab-audio")).toBeVisible();
    await expect(page.locator("#tab-welcome")).toBeHidden();
    await expect(page.locator("#tab-packages")).toBeHidden();
    await expect(page.locator("#tab-reference")).toBeHidden();

    await page.locator("#tab-button-packages").click();
    await expect(page.locator("#tab-packages")).toBeVisible();
    await expect(page.locator("#tab-audio")).toBeHidden();
});

test("loads the selected SoundFont from a remote URL on init, without needing the Audio tab open", async ({ page }) => {
    await page.goto("/");

    // Deliberately not switching to the Audio tab first - loading must not
    // depend on the user having opened it.
    await expect(page.locator("#audio-status")).toHaveText("Ready.", { timeout: BOOT_TIMEOUT });
});

test("reloads the SoundFont when the selection changes", async ({ page }) => {
    // Counting real network requests, rather than watching #audio-status for
    // a "Loading..." blip, since with only one SoundFont available today the
    // reselect-the-same-option case could otherwise race past that transient
    // text - this proves a genuinely new fetch happened, not just that the
    // status text still reads "Ready." (which it would either way).
    const soundfontRequestUrls: string[] = [];

    page.on("request", request => {
        if (request.url().includes("/soundfont/")) soundfontRequestUrls.push(request.url());
    });

    await page.goto("/");

    await page.locator("#tab-button-audio").click();
    await expect(page.locator("#audio-status")).toHaveText("Ready.", { timeout: BOOT_TIMEOUT });

    const requestCountAfterInit = soundfontRequestUrls.length;
    expect(requestCountAfterInit).toBeGreaterThanOrEqual(1);

    await page.locator("#soundfont-select").selectOption({ index: 0 });
    await expect(page.locator("#audio-status")).toHaveText("Ready.", { timeout: BOOT_TIMEOUT });

    expect(soundfontRequestUrls.length).toBeGreaterThan(requestCountAfterInit);
});
