import { defineConfig } from "vite";
import spessaWorklet from "./vite-plugin-spessa-worklet.mts";

export default defineConfig({
    root: import.meta.dirname,
    publicDir: "generated",
    plugins: [spessaWorklet()]
});
