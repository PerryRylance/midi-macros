import { test, expect } from "@playwright/test";

const NO_DEFAULT_EXPORT_MESSAGE = "No default export found. Expected a default export of type File from \"@perry-rylance/midi\".";

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

test("editor loads with the default source and no default-export error", async ({ page }) => {
    await page.goto("/");

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
    await expect(editorRoot(page)).toContainText("@perry-rylance/midi");
    await expect(page.locator("#editor-status")).toHaveText("");
});

test("shows a custom error when the default export is missing", async ({ page }) => {
    await page.goto("/");

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
    await replaceEditorContent(page, "export const x = 1;");

    await expect(page.locator("#editor-status")).toHaveText(NO_DEFAULT_EXPORT_MESSAGE, { timeout: 10_000 });
});

test("clears the custom error once a default export is added back", async ({ page }) => {
    await page.goto("/");

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
    await replaceEditorContent(page, "export const x = 1;");
    await expect(page.locator("#editor-status")).toHaveText(NO_DEFAULT_EXPORT_MESSAGE, { timeout: 10_000 });

    await replaceEditorContent(page, "export default 1;");
    await expect(page.locator("#editor-status")).toHaveText("", { timeout: 10_000 });
});

// The content here deliberately keeps a valid default export so our OWN
// hasDefaultExport() check never fires its own error marker - `.squiggly-error`
// picks up ANY error-severity marker regardless of which "owner" set it, so an
// earlier version of this test accidentally passed by matching our own
// client-side marker instead of a real language-server diagnostic.
test("shows a real diagnostic from tsserver", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 60_000 });
    await replaceEditorContent(
        page,
        'import { File } from "@perry-rylance/midi";\nconst x: number = "oops";\nexport default new File();'
    );

    await expect(page.locator("#editor-status")).toHaveText("");
    await expect(page.locator(".squiggly-error")).toHaveCount(1, { timeout: 60_000 });
});

test("shows a hover popup with type information for a regular (non-error) token", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 60_000 });
    await replaceEditorContent(
        page,
        'import { File } from "@perry-rylance/midi";\nconst answer = 42;\nexport default new File();'
    );

    await expect(page.locator("#editor-status")).toHaveText("");

    await editorRoot(page).locator(".view-line", { hasText: "const answer" }).getByText("answer").hover();

    await expect(page.locator(".monaco-hover")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".monaco-hover")).toContainText("answer");
});
