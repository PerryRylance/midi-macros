import { WebContainer } from "@webcontainer/api";

let instance: Promise<WebContainer> | null = null;

export const DEFAULT_DEPENDENCIES = ["@perry-rylance/midi", "@perry-rylance/midi-macros"] as const;

export function isDefaultDependency(name: string): boolean {
    return (DEFAULT_DEPENDENCIES as readonly string[]).includes(name);
}

// Declares DEFAULT_DEPENDENCIES as real package.json dependencies, rather
// than installing them via explicit `npm install <name>` args - this is what
// lets bootWebContainer's initial install and loadUploadedProject's (below)
// share the same "npm install/ci against whatever package.json says" step,
// instead of the boot path needing its own special-cased package list.
export function createDefaultPackageJson(): string {
    const dependencies = Object.fromEntries(DEFAULT_DEPENDENCIES.map(name => [name, "*"]));

    return JSON.stringify({ name: "sandbox", private: true, dependencies }, null, 4);
}

// Without this, tsserver.js (started by startTsServer) falls back to an
// inferred project with TS's default target (ES3), whose lib doesn't
// declare ES2019+ array methods like flatMap - surfacing as bogus red
// squiggles in the editor for perfectly valid code. Mirrors the
// compilerOptions performanceEvaluator.ts's own ts.createProgram call uses,
// so the live diagnostics agree with what actually gets type-checked.
export function createDefaultTsConfig(): string {
    return JSON.stringify(
        {
            compilerOptions: {
                target: "ES2020",
                module: "CommonJS",
                esModuleInterop: true,
                skipLibCheck: true
            }
        },
        null,
        4
    );
}

export function bootWebContainer(onOutput?: (chunk: string) => void): Promise<WebContainer> {
    if (!instance) {
        instance = WebContainer.boot({ workdirName: "workspace" }).then(async container => {
            // TEMPORARY: dump the real workdir for LSP debugging.
            console.log("[lsp] container.workdir =", container.workdir);

            await container.mount({
                "package.json": {
                    file: {
                        contents: createDefaultPackageJson()
                    }
                },
                "tsconfig.json": {
                    file: {
                        contents: createDefaultTsConfig()
                    }
                }
            });

            await runNpmCommand(container, ["install"], onOutput);

            return container;
        });
    }

    return instance;
}

// Subset of https://github.com/npm/validate-npm-package-name, sufficient to
// stop the value being confused for a CLI flag or shell metacharacters.
export function isValidPackageName(name: string): boolean {
    return /^(@[a-z0-9-][a-z0-9-._~]*\/)?[a-z0-9][a-z0-9-._~]*$/.test(name);
}

export interface InstallResult {
    exitCode: number;
    output: string;
}

// Tracked here (rather than via events.ts's document-dispatched events) so
// this stays plain logic, unit-testable in Node without a DOM - see
// soundfont.ts/webcontainer.test.ts for the same split. Callers that need a
// DOM-facing signal (e.g. mm-serialization-controls) subscribe directly.
let npmBusyCount = 0;
const npmBusyListeners = new Set<(busy: boolean) => void>();

export function isNpmBusy(): boolean {
    return npmBusyCount > 0;
}

// Invokes the listener immediately with the current state, then again on
// every subsequent transition - so a caller that subscribes after npm has
// already started (or finished) working still gets an accurate read,
// instead of only finding out about the next change.
export function onNpmBusyChange(listener: (busy: boolean) => void): () => void {
    listener(isNpmBusy());
    npmBusyListeners.add(listener);

    return () => npmBusyListeners.delete(listener);
}

function beginNpmWork(): void {
    npmBusyCount++;
    if (npmBusyCount === 1) notifyNpmBusyListeners();
}

function endNpmWork(): void {
    npmBusyCount--;
    if (npmBusyCount === 0) notifyNpmBusyListeners();
}

function notifyNpmBusyListeners(): void {
    const busy = isNpmBusy();

    for (const listener of npmBusyListeners) listener(busy);
}

// Serialises every npm invocation onto a single global queue. bootWebContainer's
// initial install, startTsServer's tooling install, and restoreSavedPerformance's
// `npm ci` (autosave.ts) can all kick off independently - most visibly on
// reload, where a restore's `npm ci` (which does its own clean node_modules
// wipe+reinstall) can otherwise race a concurrent tooling install, deleting
// packages the other just wrote. WebContainer only ever runs one npm process
// safely against a given project at a time, so callers must queue behind
// each other rather than overlap.
let npmQueue: Promise<void> = Promise.resolve();

export function runNpmCommand(
    container: WebContainer,
    args: string[],
    onOutput?: (chunk: string) => void
): Promise<InstallResult> {
    // Fires synchronously (not deferred behind the queue below) so
    // isNpmBusy() reflects this call the instant it's made, same as before
    // this was queued - only the actual npm process is made to wait its turn.
    beginNpmWork();

    const result = npmQueue
        .then(() => runQueuedNpmCommand(container, args, onOutput))
        .finally(() => endNpmWork());

    // Keep the queue moving even if this call fails - a later, unrelated
    // command shouldn't be blocked by an earlier one's rejection.
    npmQueue = result.then(
        () => undefined,
        () => undefined
    );

    return result;
}

async function runQueuedNpmCommand(
    container: WebContainer,
    args: string[],
    onOutput?: (chunk: string) => void
): Promise<InstallResult> {
    const process = await container.spawn("npm", args);

    let output = "";
    const reader = process.output.getReader();

    while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        output += value;
        onOutput?.(value);
    }

    const exitCode = await process.exit;

    return { exitCode, output };
}

export interface UploadedProjectFiles {
    packageJson: string;
    packageLockJson: string;
}

// `npm ci` (rather than `npm install`) both matches the intent of "load
// exactly this uploaded lockfile" and does its own clean reinstall (removing
// the previous node_modules first) - no separate rm -rf step needed. It's
// also stricter: it fails outright if package.json and package-lock.json
// disagree, which is the validation we get "for free" per the requirement
// that we don't need to check the uploaded JSON's integrity ourselves.
export async function loadUploadedProject(
    container: WebContainer,
    files: UploadedProjectFiles,
    onOutput?: (chunk: string) => void
): Promise<InstallResult> {
    await container.mount({
        "package.json": { file: { contents: files.packageJson } },
        "package-lock.json": { file: { contents: files.packageLockJson } }
    });

    return runNpmCommand(container, ["ci"], onOutput);
}

export async function installPackage(
    container: WebContainer,
    name: string,
    onOutput?: (chunk: string) => void
): Promise<InstallResult> {
    if (!isValidPackageName(name)) {
        throw new Error(`"${name}" is not a valid npm package name.`);
    }

    return runNpmCommand(container, ["install", name], onOutput);
}

export async function uninstallPackage(
    container: WebContainer,
    name: string,
    onOutput?: (chunk: string) => void
): Promise<InstallResult> {
    if (!isValidPackageName(name)) {
        throw new Error(`"${name}" is not a valid npm package name.`);
    }

    return runNpmCommand(container, ["uninstall", name], onOutput);
}

export async function listInstalledPackages(container: WebContainer): Promise<string[]> {
    const raw = await container.fs.readFile("package.json", "utf-8");
    const manifest = JSON.parse(raw) as { dependencies?: Record<string, string> };

    return Object.keys(manifest.dependencies ?? {}).sort();
}
