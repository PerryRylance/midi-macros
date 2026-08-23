import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);
const WORKLET_FILE_NAME = "spessasynth_processor.min.js";

export default function spessaWorklet(): Plugin {
    const workletPath = require.resolve(`spessasynth_lib/dist/${WORKLET_FILE_NAME}`);

    return {
        name: "spessa-worklet",
        configureServer(server) {
            server.middlewares.use(`/${WORKLET_FILE_NAME}`, (_req, res) => {
                res.setHeader("Content-Type", "text/javascript");
                res.end(readFileSync(workletPath));
            });
        },
        generateBundle() {
            this.emitFile({
                type: "asset",
                fileName: WORKLET_FILE_NAME,
                source: readFileSync(workletPath)
            });
        }
    };
}
