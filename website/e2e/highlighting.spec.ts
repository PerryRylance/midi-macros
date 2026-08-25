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

// Deliberately not the default performance (there's a known, separate issue with
// it being tracked down independently) - a NoteOnEvent at time 0, and a
// NoteOffEvent a comfortable ~5s later (480 ticks = 500ms at the default
// tempo/resolution, so delta 4800 = ~5s), giving the first assertion below a
// wide window to reliably catch the NoteOnEvent highlight before it's
// replaced, rather than racing exact frame timing.
const SIMPLE_PERFORMANCE =
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
    await replaceEditorContent(page, SIMPLE_PERFORMANCE);

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

// Short (480 ticks = ~500ms after the NoteOn), so the song ends on its own
// quickly without needing to press Stop.
const SHORT_PERFORMANCE =
    'import { File, Track, NoteOnEvent, NoteOffEvent } from "@perry-rylance/midi";\n\n' +
    "export default new File().tracks([\n" +
    "    new Track().events([\n" +
    "        new NoteOnEvent().key(60),\n" +
    "        new NoteOffEvent().delta(480).key(60)\n" +
    "    ])\n" +
    "]);";

test("clears highlights once the song finishes playing on its own", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 30_000 });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
    await replaceEditorContent(page, SHORT_PERFORMANCE);

    await controls.getByRole("button", { name: "Play" }).click();

    await expect(page.locator(".mm-highlighted-event").first()).toBeVisible({ timeout: 60_000 });

    // Never pressing Stop - just waiting for the short song to end on its own.
    await expect(page.locator(".mm-highlighted-event")).toHaveCount(0, { timeout: 10_000 });
});

// A note built inside .flatMap() over a *named* array (not an inline
// literal) - the common "musical pattern" shape from agents/SPIKE.md.
// Comfortable ~5s gaps (delta 4800) between notes, same reasoning as
// SIMPLE_PERFORMANCE above.
const PATTERN_PERFORMANCE =
    'import { File, Track, NoteOnEvent, NoteOffEvent } from "@perry-rylance/midi";\n\n' +
    "const notes = [60, 64, 67];\n\n" +
    "export default new File().tracks([\n" +
    "    new Track().events(\n" +
    "        notes.flatMap(n => [\n" +
    "            new NoteOnEvent().key(n),\n" +
    "            new NoteOffEvent().delta(4800).key(n)\n" +
    "        ])\n" +
    "    )\n" +
    "]);";

test("highlights the current array element for a note built inside .flatMap over a named array", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 30_000 });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
    await replaceEditorContent(page, PATTERN_PERFORMANCE);

    await controls.getByRole("button", { name: "Play" }).click();

    const eventHighlight = page.locator(".mm-highlighted-event");
    await expect(eventHighlight.first()).toBeVisible({ timeout: 60_000 });

    const eventText = (await eventHighlight.allTextContents()).join("");
    expect(eventText).toContain("NoteOnEvent");

    // The literal "60" inside `const notes = [60, 64, 67]` - resolved back
    // through the named array, not just an inline literal at the call site.
    const elementHighlight = page.locator(".mm-highlighted-element");
    await expect(elementHighlight.first()).toBeVisible({ timeout: 5_000 });

    const elementText = (await elementHighlight.allTextContents()).join("");
    expect(elementText).toBe("60");
});

// The receiver of .map() here is .filter()'s return value, not a literal or
// named array - per agents/SPIKE.md this is expected to degrade gracefully
// to constructor-only highlighting, with no element highlight at all. Needs
// a real duration (delta 4800 on the last note) - with none, the "song" ends
// near-instantly and there's nothing to reliably observe.
const FILTERED_PERFORMANCE =
    'import { File, Track, NoteOnEvent, NoteOffEvent } from "@perry-rylance/midi";\n\n' +
    "const notes = [60, 64, 67];\n\n" +
    "export default new File().tracks([\n" +
    "    new Track().events([\n" +
    "        ...notes.filter(n => n > 60).map(n => new NoteOnEvent().key(n)),\n" +
    "        new NoteOffEvent().delta(4800).key(64)\n" +
    "    ])\n" +
    "]);";

test("does not highlight an array element when the iterated array can't be traced back to a literal", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 30_000 });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
    await replaceEditorContent(page, FILTERED_PERFORMANCE);

    await controls.getByRole("button", { name: "Play" }).click();

    await expect(page.locator(".mm-highlighted-event").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".mm-highlighted-element")).toHaveCount(0);
});

test("clears highlights when Stop is pressed", async ({ page }) => {
    await page.goto("/");

    const controls = page.locator("#playback-controls");
    await expect(controls.getByRole("button", { name: "Play" })).toBeEnabled({ timeout: 30_000 });

    await expect(editorRoot(page).locator(".view-lines")).toBeVisible({ timeout: 30_000 });
    await replaceEditorContent(page, SIMPLE_PERFORMANCE);

    await controls.getByRole("button", { name: "Play" }).click();

    await expect(page.locator(".mm-highlighted-event").first()).toBeVisible({ timeout: 60_000 });

    await controls.getByRole("button", { name: "Stop" }).click();

    await expect(page.locator(".mm-highlighted-event")).toHaveCount(0);
});
