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

test("lists an installed package and can remove it", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 30_000 });
    await expect(page.locator("#package-list li")).toHaveCount(0);

    await page.locator("#package-name").fill("nanoid");
    await page.locator("#install-button").click();
    await expect(page.locator("#status")).toHaveText("Installed nanoid.", { timeout: 60_000 });

    const item = page.locator("#package-list li", { hasText: "nanoid" });
    await expect(item).toBeVisible();

    await item.getByRole("button", { name: "Remove" }).click();

    await expect(page.locator("#status")).toHaveText("Removed nanoid.", { timeout: 60_000 });
    await expect(page.locator("#package-list li", { hasText: "nanoid" })).toHaveCount(0);
});

test("disables remove buttons while the terminal is busy", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 30_000 });

    await page.locator("#package-name").fill("nanoid");
    await page.locator("#install-button").click();
    await expect(page.locator("#status")).toHaveText("Installed nanoid.", { timeout: 60_000 });

    const removeButton = page.locator("#package-list li", { hasText: "nanoid" }).getByRole("button", { name: "Remove" });
    await expect(removeButton).toBeEnabled();

    await page.locator("#package-name").fill("left-pad");
    await page.locator("#install-button").click();

    await expect(removeButton).toBeDisabled();
    await expect(page.locator("#status")).toHaveText("Installed left-pad.", { timeout: 60_000 });
    await expect(removeButton).toBeEnabled();
});
