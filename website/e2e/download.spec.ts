import { readFileSync } from "node:fs";
import { test, expect, type Locator } from "@playwright/test";
import JSZip from "jszip";

async function openPackagesTab(page: import("@playwright/test").Page): Promise<void> {
    await page.locator("#tab-button-packages").click();
}

// Boot runs two separate npm phases in sequence - the default dependencies,
// then (once mm-editor's own bootWebContainer() call resolves) tsserver's
// tooling install - with a brief gap of genuine idle time between them. A
// plain "wait until enabled" can land in that gap and declare the container
// ready a phase early; waiting for it to still read enabled a moment later
// avoids racing the second phase.
async function waitUntilContainerSettled(button: Locator): Promise<void> {
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await button.page().waitForTimeout(1000);
    await expect(button).toBeEnabled({ timeout: 30_000 });
}

test("shows a Download button in the toolbar", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#serialization-controls");

    await expect(controls.getByRole("button", { name: "Download" })).toBeVisible();
});

test("downloads a zip of the performance, package.json and package-lock.json, disabling the button meanwhile", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#serialization-controls");
    const downloadButton = controls.getByRole("button", { name: "Download" });
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(downloadButton);

    // Clicking and reading .disabled back in the same page.evaluate() call
    // catches the synchronous "disabled = true" at the top of the click
    // handler, before the rest of it (fs reads, zipping) has a chance to run
    // and re-enable the button - a Playwright-level click()+assert would
    // race against that, since the whole handler can finish before the
    // "download" event even reaches this process.
    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.evaluate(() => {
            const button = document.querySelector<HTMLButtonElement>("#download-button")!;
            button.click();
            return button.disabled;
        }).then(disabledDuringClick => expect(disabledDuringClick).toBe(true))
    ]);

    expect(download.suggestedFilename()).toBe("midi-macros.zip");

    // Generous timeout: this may still be overlapping with the tail of the
    // container's own tsserver tooling install (see waitUntilContainerSettled).
    await expect(downloadButton).toBeEnabled({ timeout: 60_000 });
    await expect(output).toContainText("Download ready.");

    const archivePath = await download.path();
    const zip = await JSZip.loadAsync(readFileSync(archivePath!));

    expect(Object.keys(zip.files).sort()).toEqual(["package-lock.json", "package.json", "performance.ts"]);
    expect(await zip.file("performance.ts")!.async("string")).toContain("NoteOnEvent");
    expect(JSON.parse(await zip.file("package.json")!.async("string")).name).toBe("sandbox");
});

test("disables the download button while npm installs a package, and re-enables it once done", async ({ page }) => {
    await page.goto("/");
    await openPackagesTab(page);

    const downloadButton = page.locator("#serialization-controls").getByRole("button", { name: "Download" });
    const status = page.locator("#status");

    await expect(status).toHaveText("Ready.", { timeout: 60_000 });
    await waitUntilContainerSettled(downloadButton);

    await page.locator("#package-name").fill("nanoid");
    await page.locator("#install-button").click();

    await expect(downloadButton).toBeDisabled();
    await expect(status).toHaveText("Installed nanoid.", { timeout: 60_000 });
    await expect(downloadButton).toBeEnabled({ timeout: 60_000 });
});
