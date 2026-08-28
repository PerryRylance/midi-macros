import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { OPERATION_TIMEOUT, waitUntilContainerSettled } from "./support/waits";

async function openPackagesTab(page: import("@playwright/test").Page): Promise<void> {
    await page.locator("#tab-button-packages").click();
}

function editorRoot(page: import("@playwright/test").Page) {
    return page.locator(".monaco-editor[data-uri]");
}

async function replaceEditorContent(page: import("@playwright/test").Page, text: string): Promise<void> {
    await editorRoot(page).locator("textarea").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(text);
}

test("shows a Download button in the toolbar", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#serialization-controls");

    await expect(controls.getByRole("button", { name: "Download" })).toBeVisible();
});

test("downloads a zip of the performance, package.json, package-lock.json and a generated MIDI, disabling the button meanwhile", async ({ page }) => {
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

    expect(download.suggestedFilename()).toBe("MIDI Macros.zip");

    // Generous timeout: this may still be overlapping with the tail of the
    // container's own tsserver tooling install (see waitUntilContainerSettled).
    await expect(downloadButton).toBeEnabled({ timeout: OPERATION_TIMEOUT });
    await expect(output).toContainText("Download ready.");

    const archivePath = await download.path();
    const zip = await JSZip.loadAsync(readFileSync(archivePath!));

    expect(Object.keys(zip.files).sort()).toEqual(["generated.mid", "package-lock.json", "package.json", "performance.ts"]);
    expect(await zip.file("performance.ts")!.async("string")).toContain("NoteOnEvent");
    expect(JSON.parse(await zip.file("package.json")!.async("string")).name).toBe("sandbox");

    const midiBytes = await zip.file("generated.mid")!.async("nodebuffer");
    expect(midiBytes.subarray(0, 4).toString("ascii")).toBe("MThd");
});

test("names the downloaded zip after the current title", async ({ page }) => {
    await page.goto("/");

    const downloadButton = page.locator("#serialization-controls").getByRole("button", { name: "Download" });

    await waitUntilContainerSettled(downloadButton);

    const title = page.locator("#editable-title");
    await title.getByRole("button", { name: "Edit title" }).click();
    await page.locator("#title-input").fill("My Song");
    await page.locator("#toolbar").click();

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        downloadButton.click()
    ]);

    expect(download.suggestedFilename()).toBe("My Song.zip");
});

test("shows an error and doesn't produce a download when the performance can't be rendered to MIDI", async ({ page }) => {
    await page.goto("/");

    const downloadButton = page.locator("#serialization-controls").getByRole("button", { name: "Download" });
    const output = page.locator("#build-output-message");

    await waitUntilContainerSettled(downloadButton);

    // No default export at all - a real TypeScript compiler diagnostic (see
    // performanceEvaluator.ts), same case covered for Play in playback.spec.ts.
    await replaceEditorContent(page, "export const x = 1;");

    let downloadFired = false;
    page.once("download", () => { downloadFired = true; });

    await downloadButton.click();

    await expect(output).toContainText("No default export", { timeout: OPERATION_TIMEOUT });
    await expect(downloadButton).toBeEnabled();
    expect(downloadFired).toBe(false);
});

test("disables the download button while npm installs a package, and re-enables it once done", async ({ page }) => {
    await page.goto("/");
    await openPackagesTab(page);

    const downloadButton = page.locator("#serialization-controls").getByRole("button", { name: "Download" });

    // #add-package-button only exists once the panel's first package-list
    // refresh has run, replacing the old #status "Ready." readiness signal.
    await expect(page.locator("#add-package-button")).toBeAttached({ timeout: OPERATION_TIMEOUT });
    await waitUntilContainerSettled(downloadButton);

    await page.locator("#add-package-button").click();
    await page.locator("#package-name").fill("nanoid");
    await page.locator("#install-button").click();

    await expect(downloadButton).toBeDisabled();
    await expect(page.locator("#package-list li", { hasText: "nanoid" })).toBeVisible({ timeout: OPERATION_TIMEOUT });
    await expect(downloadButton).toBeEnabled({ timeout: OPERATION_TIMEOUT });
});
