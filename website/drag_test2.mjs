import { chromium } from "playwright-core";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto("http://localhost:5173", { timeout: 15000, waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

async function measure() {
    return page.evaluate(() => {
        const buildTabs = document.querySelector("#build-tabs");
        const terminal = document.querySelector("#terminal");
        const tabTerminal = document.querySelector("#tab-terminal");
        const gutter = document.querySelector(".split.horizontal > .gutter-vertical");
        const splitH = document.querySelector(".split.horizontal");
        const rect = el => el ? (({ width, height, top, bottom }) => ({ width: Math.round(width), height: Math.round(height), top: Math.round(top), bottom: Math.round(bottom) }))(el.getBoundingClientRect()) : null;
        return {
            buildTabs: rect(buildTabs),
            buildTabsStyleHeight: buildTabs?.style.height,
            buildTabsStyleFlexBasis: getComputedStyle(buildTabs).flexBasis,
            terminal: rect(terminal),
            tabTerminal: rect(tabTerminal),
            gutter: rect(gutter),
            splitH: rect(splitH)
        };
    });
}

console.log("INITIAL", JSON.stringify(await measure(), null, 2));

const gutter = page.locator(".split.horizontal > .gutter-vertical");
const gutterBox = await gutter.boundingBox();
const startX = gutterBox.x + gutterBox.width / 2;
const startY = gutterBox.y + gutterBox.height / 2;

await page.mouse.move(startX, startY);
await page.mouse.down();

// Drag downward in small increments, logging state at each step
for (let i = 1; i <= 30; i++) {
    await page.mouse.move(startX, startY + i * 10, { steps: 3 });
    const m = await measure();
    console.log(`STEP ${i} (moved ${i * 10}px down)`, JSON.stringify(m));
}

await page.mouse.up();
await page.waitForTimeout(200);
console.log("FINAL", JSON.stringify(await measure(), null, 2));

await browser.close();
