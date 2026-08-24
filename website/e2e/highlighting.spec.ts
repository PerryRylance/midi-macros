import { test, expect } from "@playwright/test";

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

// Deliberately not the default program (there's a known, separate issue with
// it being tracked down independently) - a NoteOnEvent at time 0, and a
// NoteOffEvent a comfortable ~5s later (480 ticks = 500ms at the default
// tempo/resolution, so delta 4800 = ~5s), giving the first assertion below a
// wide window to reliably catch the NoteOnEvent highlight before it's
// replaced, rather than racing exact frame timing.
const SIMPLE_PROGRAM =
    'import { File, Track, NoteOnEvent, NoteOffEvent } from "@perry-rylance/midi";\n\n' +
    "export default new File().tracks([\n" +
    "    new Track().events([\n" +
    "        new NoteOnEvent().key(60),\n" +
    "        new NoteOffEvent().delta(4800).key(60)\n" +
    "    ])\n" +
    "]);";

test("highlights the MIDI event constructor currently playing", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 30_000 });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
    await replaceEditorContent(page, SIMPLE_PROGRAM);

    await controls.getByRole("button", { name: "Play" }).click();

    // Monaco applies our inline decoration class per syntax-highlighting
    // token span, so a single highlighted expression resolves to several
    // elements - join their text back together in document order.
    const highlight = page.locator(".mm-highlighted-event");
    await expect(highlight.first()).toBeVisible({ timeout: 60_000 });

    const text = (await highlight.allTextContents()).join("");
    expect(text).toContain("NoteOnEvent");
    // Only the constructor call itself, not the chained ".key(60)" after it.
    expect(text).not.toContain("key(60)");
});

test("clears highlights when Stop is pressed", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 30_000 });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
    await replaceEditorContent(page, SIMPLE_PROGRAM);

    await controls.getByRole("button", { name: "Play" }).click();

    await expect(page.locator(".mm-highlighted-event").first()).toBeVisible({ timeout: 60_000 });

    await controls.getByRole("button", { name: "Stop" }).click();

    await expect(page.locator(".mm-highlighted-event")).toHaveCount(0);
});
