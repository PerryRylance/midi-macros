import type { WebContainer, WebContainerProcess } from "@webcontainer/api";

// Tooling used by our own code (the language server, and the program
// evaluator's event-timing resolution) - not user-facing packages, so kept
// separate from webcontainer.ts's DEFAULT_DEPENDENCIES.
export const TOOLING_DEPENDENCIES = ["typescript@5.9.3", "@perry-rylance/midi-to-milliseconds"] as const;

let tsServerProcess: Promise<WebContainerProcess> | undefined;

// The install/startup output here is implementation detail (npm noise for
// the editor tooling itself, not something the user asked to install) and is
// deliberately not echoed to the shared terminal - doing so would interleave
// with, and pollute, the user-facing package install/remove output.
export function startTsServer(container: WebContainer): Promise<WebContainerProcess> {
    if (!tsServerProcess) {
        tsServerProcess = installToolingDependencies(container)
            .then(() => container.spawn("node", ["node_modules/typescript/lib/tsserver.js"]));
    }

    return tsServerProcess;
}

async function installToolingDependencies(container: WebContainer): Promise<void> {
    const process = await container.spawn("npm", ["install", "--save-dev", ...TOOLING_DEPENDENCIES]);

    const reader = process.output.getReader();

    while (true) {
        const { done } = await reader.read();

        if (done) break;
    }

    await process.exit;
}
