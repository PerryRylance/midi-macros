import { expect, type Locator } from "@playwright/test";

// Shared timeout tiers for e2e assertions - one place to retune if CI
// hardware makes these too tight (see website-test.yml, whose own step/job
// timeouts were sized against these numbers), rather than the same handful
// of magic numbers copy-pasted across every spec file.
//
// WebContainer boots and real npm installs/builds inside them are the slow,
// CPU-bound part of this suite; UI-only state changes on an already-booted
// container are comparatively fast.

// A retry inside an `expect(async () => {...}).toPass()` loop, or a widget
// that should already be on screen.
export const QUICK_TIMEOUT = 2_000;

// A single already-settled UI element appearing.
export const SHORT_TIMEOUT = 5_000;

// Waiting for a transient state to clear/settle (a poll, a count dropping
// back to zero).
export const SETTLE_TIMEOUT = 10_000;

// The container's first boot: default dependencies installing, the editor
// mounting, playback controls becoming enabled for the first time.
export const BOOT_TIMEOUT = 30_000;

// A real npm install/build/upload/playback run triggered mid-test.
export const OPERATION_TIMEOUT = 60_000;

// Boot runs two separate npm phases in sequence - the default dependencies,
// then (once mm-editor's own bootWebContainer() call resolves) tsserver's
// tooling install - with a brief gap of genuine idle time between them. A
// plain "wait until enabled" can land in that gap and declare the container
// ready a phase early; waiting for it to still read enabled a moment later
// avoids racing the second phase.
export async function waitUntilContainerSettled(button: Locator): Promise<void> {
    await expect(button).toBeEnabled({ timeout: BOOT_TIMEOUT });
    await button.page().waitForTimeout(1000);
    await expect(button).toBeEnabled({ timeout: BOOT_TIMEOUT });
}
