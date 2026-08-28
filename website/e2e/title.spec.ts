import { test, expect } from "@playwright/test";

const STORAGE_KEY = "title";

test("shows the default title as a heading, with an edit button next to it", async ({ page }) => {
    await page.goto("/");

    const title = page.locator("#editable-title");

    await expect(title.getByRole("heading", { name: "MIDI Macros" })).toBeVisible();
    await expect(title.getByRole("button", { name: "Edit title" })).toBeVisible();
});

test("turns into a text input while editing, updating the heading, window title and storage as it's typed, then reverts on blur", async ({ page }) => {
    await page.goto("/");

    const title = page.locator("#editable-title");
    const heading = title.getByRole("heading");
    const input = page.locator("#title-input");

    await title.getByRole("button", { name: "Edit title" }).click();

    await expect(input).toBeVisible();
    await expect(heading).toBeHidden();
    await expect(input).toHaveValue("MIDI Macros");

    await input.fill("My Song");

    await expect.poll(() => page.title()).toBe("My Song");
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe("My Song");

    await page.locator("#toolbar").click();

    await expect(input).toBeHidden();
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("My Song");
});

test("pressing Enter while editing blurs the input, reverting it to a heading", async ({ page }) => {
    await page.goto("/");

    const title = page.locator("#editable-title");
    const heading = title.getByRole("heading");
    const input = page.locator("#title-input");

    await title.getByRole("button", { name: "Edit title" }).click();
    await input.fill("My Song");
    await input.press("Enter");

    await expect(input).toBeHidden();
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("My Song");
});

test("falls back to the default title when cleared to blank", async ({ page }) => {
    await page.goto("/");

    const title = page.locator("#editable-title");
    const heading = title.getByRole("heading");
    const input = page.locator("#title-input");

    await title.getByRole("button", { name: "Edit title" }).click();
    await input.fill("");
    await input.press("Enter");

    await expect(heading).toHaveText("MIDI Macros");
    await expect.poll(() => page.title()).toBe("MIDI Macros");
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe("MIDI Macros");
});

test("restores a saved title from storage on load", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(key => localStorage.setItem(key, "Restored Title"), STORAGE_KEY);

    await page.reload();

    await expect(page.locator("#editable-title").getByRole("heading")).toHaveText("Restored Title");
    await expect.poll(() => page.title()).toBe("Restored Title");
});
