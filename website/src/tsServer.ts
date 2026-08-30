import type { WebContainer, WebContainerProcess } from "@webcontainer/api";
import { runNpmCommand } from "./webcontainer";

// Tooling used by our own code (the language server, and the performance
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
        tsServerProcess = installToolingDependencies(container).then(() =>
            container.spawn("node", [
                "node_modules/typescript/lib/tsserver.js",
                // Automatic Type Acquisition forks a second node process to
                // run typingsInstaller.js and shells out to npm to fetch
                // @types packages - the fork fails inside the WebContainer
                // sandbox ("Cannot find module .../typingsInstaller.js"),
                // which otherwise kills the server on startup. We don't need
                // it anyway: the only packages users install here either
                // ship their own types or don't have any.
                "--disableAutomaticTypingAcquisition"
            ])
        );
    }

    return tsServerProcess;
}

// Exported so "New" (mm-serialization-controls.ts) can reinstall these after
// resetToDefaultProject wipes package.json - startTsServer itself only ever
// runs this once per page load (memoized via tsServerProcess), so it won't
// notice or repair node_modules/package.json losing these on its own.
export async function installToolingDependencies(container: WebContainer): Promise<void> {
    await runNpmCommand(container, ["install", "--save-dev", ...TOOLING_DEPENDENCIES]);
}
