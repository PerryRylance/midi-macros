import { defineConfig } from "vite";

// WebContainers require the page to be cross-origin isolated (SharedArrayBuffer).
const crossOriginIsolationHeaders = {
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin"
};

export default defineConfig({
    server: { headers: crossOriginIsolationHeaders },
    preview: { headers: crossOriginIsolationHeaders }
});
