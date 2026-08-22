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

    // A synthetic mouse `.hover()` doesn't reliably drive Monaco's own
    // mouse-target tracking under Playwright - clicking to position the
    // caret and triggering the "Show Hover" keybinding (Monaco's own
    // keyboard-accessible equivalent) is the reliable way to invoke it here.
    // Unlike diagnostics (pushed as events that naturally arrive once
    // tsserver is ready), this command fires once at the moment it's
    // pressed - if tsserver's connect/warm-up/open sequence hasn't finished
    // yet, it resolves with nothing and nothing re-triggers it, so this
    // retries the keybinding until content actually shows up.
    const answerToken = editorRoot(page).locator(".view-line", { hasText: "const answer" }).getByText("answer");
    const hover = page.locator(".monaco-hover");

    await expect(async () => {
        await answerToken.click();
        await page.keyboard.press("Control+K");
        await page.keyboard.press("Control+I");
        await expect(hover).toContainText("answer", { timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
});

test("shows member auto-complete after typing a dot", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#status")).toHaveText("Ready.", { timeout: 60_000 });
    await replaceEditorContent(
        page,
        'import { File } from "@perry-rylance/midi";\n\nconst file = new File();\n\nfile.\n\nexport default file;'
    );

    await expect(page.locator("#editor-status")).toHaveText("");

    // Click the line then jump to its end, so the caret lands right after
    // the dot rather than wherever the click's pixel position happens to map to.
    await editorRoot(page).locator(".view-line", { hasText: "file." }).getByText("file.").click();
    await page.keyboard.press("End");

    // Same "fires once, doesn't retry itself" situation as hover above -
    // "Trigger Suggest" is the keyboard-accessible way to re-ask for
    // completions at the current cursor position until tsserver is ready.
    // Dismissing first matters: once open, the widget doesn't re-query on a
    // repeated Ctrl+Space, so a retry that leaves it open (still showing an
    // earlier too-early, word-based-only result) never actually asks again.
    const suggestions = page.locator(".suggest-widget");

    await expect(async () => {
        await page.keyboard.press("Escape");
        await page.keyboard.press("Control+Space");
        await expect(suggestions).toContainText("tracks", { timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
});
