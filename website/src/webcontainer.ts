import { WebContainer } from "@webcontainer/api";

let instance: Promise<WebContainer> | null = null;

export function bootWebContainer(): Promise<WebContainer> {
    if (!instance) {
        instance = WebContainer.boot().then(async container => {
            await container.mount({
                "package.json": {
                    file: {
                        contents: JSON.stringify({ name: "sandbox", private: true }, null, 4)
                    }
                }
            });

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

export async function installPackage(
    container: WebContainer,
    name: string,
    onOutput?: (chunk: string) => void
): Promise<InstallResult> {
    if (!isValidPackageName(name)) {
        throw new Error(`"${name}" is not a valid npm package name.`);
    }

    const process = await container.spawn("npm", ["install", name]);

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
