import { test, expect } from "@playwright/test";

const DEFAULT_DEPENDENCIES = ["@perry-rylance/midi", "@perry-rylance/midi-macros"];

test("boots a WebContainer and installs an npm package", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 60_000 });

    await page.locator("#package-name").fill("nanoid");
    await page.locator("#install-button").click();

    await expect(page.locator("#status")).toHaveText("Installed nanoid.", { timeout: 60_000 });
    await expect(page.locator("#terminal")).toContainText("added", { timeout: 60_000 });
});

test("shows an error for an invalid package name", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 60_000 });

    await page.locator("#package-name").fill("; rm -rf /");
    await page.locator("#install-button").click();

    await expect(page.locator("#status")).toHaveText("Error.");
    await expect(page.locator("#terminal")).toContainText("not a valid npm package name");
});

test("lists an installed package and can remove it", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 60_000 });
    await expect(page.locator("#package-list li")).toHaveCount(DEFAULT_DEPENDENCIES.length);

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

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 60_000 });

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

test("preinstalls the default dependencies without a remove button", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 60_000 });

    for (const name of DEFAULT_DEPENDENCIES) {
        // "@perry-rylance/midi" is a text substring of "@perry-rylance/midi-macros", so match exactly.
        const item = page.locator("#package-list li").filter({ hasText: new RegExp(`^${name}$`) });

        await expect(item).toBeVisible();
        await expect(item.getByRole("button", { name: "Remove" })).toHaveCount(0);
    }
});
