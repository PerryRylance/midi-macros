import { test, expect } from "@playwright/test";

test("boots a WebContainer and installs an npm package", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 30_000 });

    await page.locator("#package-name").fill("nanoid");
    await page.locator("#install-button").click();

    await expect(page.locator("#status")).toHaveText("Installed nanoid.", { timeout: 60_000 });
    await expect(page.locator("#terminal")).toContainText("added", { timeout: 60_000 });
});

test("shows an error for an invalid package name", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 30_000 });

    await page.locator("#package-name").fill("; rm -rf /");
    await page.locator("#install-button").click();

    await expect(page.locator("#status")).toHaveText("Error.");
    await expect(page.locator("#terminal")).toContainText("not a valid npm package name");
});
