import { defineConfig } from "vite";
import spessaWorklet from "./vite-plugin-spessa-worklet";

// WebContainers require the page to be cross-origin isolated (SharedArrayBuffer).
const crossOriginIsolationHeaders = {
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin"
};

export default defineConfig({
    plugins: [spessaWorklet()],
    server: { headers: crossOriginIsolationHeaders },
    preview: { headers: crossOriginIsolationHeaders }
});
