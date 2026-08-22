import { WebContainer } from "@webcontainer/api";

let instance: Promise<WebContainer> | null = null;

export const DEFAULT_DEPENDENCIES = ["@perry-rylance/midi", "@perry-rylance/midi-macros"] as const;

export function isDefaultDependency(name: string): boolean {
    return (DEFAULT_DEPENDENCIES as readonly string[]).includes(name);
}

export function bootWebContainer(onOutput?: (chunk: string) => void): Promise<WebContainer> {
    if (!instance) {
        instance = WebContainer.boot({ workdirName: "workspace" }).then(async container => {
            // TEMPORARY: dump the real workdir for LSP debugging.
            console.log("[lsp] container.workdir =", container.workdir);

            await container.mount({
                "package.json": {
                    file: {
                        contents: JSON.stringify({ name: "sandbox", private: true }, null, 4)
                    }
                }
            });

            await runNpmCommand(container, ["install", ...DEFAULT_DEPENDENCIES], onOutput);

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

async function runNpmCommand(
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
