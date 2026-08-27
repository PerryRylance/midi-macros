import { test, expect } from "@playwright/test";
import { OPERATION_TIMEOUT } from "./support/waits";

const DEFAULT_DEPENDENCIES = ["@perry-rylance/midi", "@perry-rylance/midi-macros"];

// mm-package-panel now lives inside the sidebar's "Packages" tab, hidden by
// default (Welcome is the default tab) - its own boot/install logic runs
// regardless of visibility, but interacting with its form needs the tab open.
async function openPackagesTab(page: import("@playwright/test").Page): Promise<void> {
    await page.locator("#tab-button-packages").click();
}

// #add-package-button only exists once the panel's first #refreshPackageList()
// call has run (it's appended alongside the installed-package items), so its
// presence in the DOM is the panel's readiness signal - replacing the old
// #status "Ready." text, which was removed when the status line was dropped
// in favour of the package list + "Add package" dialog itself.
async function waitUntilReady(page: import("@playwright/test").Page): Promise<void> {
    await expect(page.locator("#add-package-button")).toBeAttached({ timeout: OPERATION_TIMEOUT });
}

async function openAddPackageDialog(page: import("@playwright/test").Page): Promise<void> {
    await page.locator("#add-package-button").click();
}

// Remove buttons are `visibility: hidden` until their <li> is :hover'd (see
// style.scss) - getByRole() excludes visibility:hidden elements from the
// accessibility tree entirely, so it can never find one. A plain tag+text
// locator isn't accessibility-tree-gated and resolves regardless of
// visibility, which is enough for state assertions (toBeEnabled/toBeDisabled
// don't require visibility); clicking it still needs an explicit hover()
// first, since click()'s actionability check does require visibility.
function removeButtonOf(item: import("@playwright/test").Locator) {
    return item.locator("button", { hasText: "Remove" });
}

async function clickRemove(item: import("@playwright/test").Locator): Promise<void> {
    await item.hover();
    await removeButtonOf(item).click();
}

test("boots a WebContainer and installs an npm package", async ({ page }) => {
    await page.goto("/");
    await openPackagesTab(page);
    await waitUntilReady(page);

    await openAddPackageDialog(page);
    await page.locator("#package-name").fill("nanoid");
    await page.locator("#install-button").click();

    await expect(page.locator("#package-list li", { hasText: "nanoid" })).toBeVisible({ timeout: OPERATION_TIMEOUT });
    await expect(page.locator("#terminal")).toContainText("added", { timeout: OPERATION_TIMEOUT });
});

test("shows an error for an invalid package name", async ({ page }) => {
    await page.goto("/");
    await openPackagesTab(page);
    await waitUntilReady(page);

    await openAddPackageDialog(page);
    await page.locator("#package-name").fill("; rm -rf /");
    await page.locator("#install-button").click();

    await expect(page.locator("#terminal")).toContainText("not a valid npm package name");
});

test("lists an installed package and can remove it", async ({ page }) => {
    await page.goto("/");
    await openPackagesTab(page);
    await waitUntilReady(page);

    // +1 for the "Add package" item itself, which lives in #package-list too.
    await expect(page.locator("#package-list li")).toHaveCount(DEFAULT_DEPENDENCIES.length + 1);

    await openAddPackageDialog(page);
    await page.locator("#package-name").fill("nanoid");
    await page.locator("#install-button").click();

    const item = page.locator("#package-list li", { hasText: "nanoid" });
    await expect(item).toBeVisible({ timeout: OPERATION_TIMEOUT });

    await clickRemove(item);

    await expect(page.locator("#package-list li", { hasText: "nanoid" })).toHaveCount(0, { timeout: OPERATION_TIMEOUT });
});

test("disables remove buttons while the terminal is busy", async ({ page }) => {
    await page.goto("/");
    await openPackagesTab(page);
    await waitUntilReady(page);

    await openAddPackageDialog(page);
    await page.locator("#package-name").fill("nanoid");
    await page.locator("#install-button").click();

    const item = page.locator("#package-list li", { hasText: "nanoid" });
    await expect(item).toBeVisible({ timeout: OPERATION_TIMEOUT });

    const removeButton = removeButtonOf(item);
    await expect(removeButton).toBeEnabled();

    await openAddPackageDialog(page);
    await page.locator("#package-name").fill("left-pad");
    await page.locator("#install-button").click();

    await expect(removeButton).toBeDisabled();
    await expect(page.locator("#package-list li", { hasText: "left-pad" })).toBeVisible({ timeout: OPERATION_TIMEOUT });
    await expect(removeButton).toBeEnabled();
});

// Checks the panel's "hidden" attribute directly, rather than
// toBeVisible()/toBeHidden() - the Output tab starts genuinely empty (no
// build has run), which collapses it to zero rendered height, and Playwright
// treats a zero-size element as not visible regardless of the "hidden"
// attribute. What these tests care about is which tab is active, not pixels.
function isActiveTabPanel(page: import("@playwright/test").Page, panelId: string) {
    return expect(page.locator(`#${panelId}`)).not.toHaveAttribute("hidden");
}

function isInactiveTabPanel(page: import("@playwright/test").Page, panelId: string) {
    return expect(page.locator(`#${panelId}`)).toHaveAttribute("hidden", "");
}

test("switches back to the Terminal tab when an install or remove starts", async ({ page }) => {
    await page.goto("/");
    await openPackagesTab(page);
    await waitUntilReady(page);

    await page.locator("#tab-button-output").click();
    await isActiveTabPanel(page, "tab-output");
    await isInactiveTabPanel(page, "tab-terminal");

    await openAddPackageDialog(page);
    await page.locator("#package-name").fill("nanoid");
    await page.locator("#install-button").click();

    await isActiveTabPanel(page, "tab-terminal");
    await isInactiveTabPanel(page, "tab-output");
    await expect(page.locator("#package-list li", { hasText: "nanoid" })).toBeVisible({ timeout: OPERATION_TIMEOUT });

    await page.locator("#tab-button-output").click();
    await isActiveTabPanel(page, "tab-output");

    const item = page.locator("#package-list li", { hasText: "nanoid" });
    await clickRemove(item);

    await isActiveTabPanel(page, "tab-terminal");
    await isInactiveTabPanel(page, "tab-output");
    await expect(page.locator("#package-list li", { hasText: "nanoid" })).toHaveCount(0, { timeout: OPERATION_TIMEOUT });
});

test("preinstalls the default dependencies without a remove button", async ({ page }) => {
    await page.goto("/");
    await openPackagesTab(page);
    await waitUntilReady(page);

    for (const name of DEFAULT_DEPENDENCIES) {
        // "@perry-rylance/midi" is a text substring of "@perry-rylance/midi-macros", so match exactly.
        const item = page.locator("#package-list li").filter({ hasText: new RegExp(`^${name}$`) });

        await expect(item).toBeVisible();
        await expect(removeButtonOf(item)).toHaveCount(0);
    }
});
