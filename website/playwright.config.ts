import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    timeout: 90_000,
    reporter: [["html", { open: "never" }], ["list"]],
    // WebContainer boots share state at the origin level (e.g. its service
    // worker registration); running tests concurrently causes cross-test
    // interference, so keep this suite serial.
    workers: 1,
    webServer: {
        command: "npm run dev -- --port 5173 --strictPort",
        port: 5173,
        reuseExistingServer: !process.env.CI
    },
    use: {
        baseURL: "http://localhost:5173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure"
    }
});
