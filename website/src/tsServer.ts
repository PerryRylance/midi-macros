import type { WebContainer, WebContainerProcess } from "@webcontainer/api";

export const TS_SERVER_DEPENDENCIES = ["typescript@5.9.3"] as const;

let tsServerProcess: Promise<WebContainerProcess> | undefined;

// The install/startup output here is implementation detail (npm noise for
// the editor tooling itself, not something the user asked to install) and is
// deliberately not echoed to the shared terminal - doing so would interleave
// with, and pollute, the user-facing package install/remove output.
export function startTsServer(container: WebContainer): Promise<WebContainerProcess> {
    if (!tsServerProcess) {
        tsServerProcess = installTsServerDependencies(container)
            .then(() => container.spawn("node", ["node_modules/typescript/lib/tsserver.js"]));
    }

    return tsServerProcess;
}

async function installTsServerDependencies(container: WebContainer): Promise<void> {
    const process = await container.spawn("npm", ["install", "--save-dev", ...TS_SERVER_DEPENDENCIES]);

    const reader = process.output.getReader();

    while (true) {
        const { done } = await reader.read();

        if (done) break;
    }

    await process.exit;
}
