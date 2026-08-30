import { describe, expect, it, vi } from "vitest";
import {
    createDefaultPackageJson,
    DEFAULT_DEPENDENCIES,
    installPackage,
    isDefaultDependency,
    isNpmBusy,
    isValidPackageName,
    listInstalledPackages,
    loadUploadedProject,
    onNpmBusyChange,
    resetToDefaultProject,
    uninstallPackage
} from "../src/webcontainer";

// A container whose npm process only resolves its exit code once the test
// tells it to, so busy-tracking can be observed mid-command instead of
// racing against an already-settled promise.
function createControllableContainer() {
    let resolveExit!: (code: number) => void;

    const spawn = vi.fn().mockResolvedValue({
        output: new ReadableStream<string>({
            start(controller) {
                controller.close();
            }
        }),
        exit: new Promise<number>(resolve => {
            resolveExit = resolve;
        })
    });

    return { container: { spawn } as any, finishWith: (code: number) => resolveExit(code) };
}

describe("isValidPackageName", () => {
    it("accepts a simple lowercase package name", () => {
        expect(isValidPackageName("nanoid")).toBe(true);
    });

    it("accepts a scoped package name", () => {
        expect(isValidPackageName("@perry-rylance/midi")).toBe(true);
    });

    it("accepts names with dots, dashes and underscores", () => {
        expect(isValidPackageName("left-pad.js_2")).toBe(true);
    });

    it("rejects an empty string", () => {
        expect(isValidPackageName("")).toBe(false);
    });

    it("rejects names containing uppercase letters", () => {
        expect(isValidPackageName("Left-Pad")).toBe(false);
    });

    it("rejects names containing whitespace", () => {
        expect(isValidPackageName("left pad")).toBe(false);
    });

    it("rejects names that look like CLI flags", () => {
        expect(isValidPackageName("--save-dev")).toBe(false);
    });

    it("rejects names containing shell metacharacters", () => {
        expect(isValidPackageName("left-pad; rm -rf /")).toBe(false);
    });
});

describe("installPackage", () => {
    it("rejects invalid package names without spawning a process", async () => {
        const spawn = vi.fn();
        const container = { spawn } as any;

        await expect(installPackage(container, "; rm -rf /")).rejects.toThrow(/not a valid npm package name/);
        expect(spawn).not.toHaveBeenCalled();
    });

    it("resolves with the process exit code and collected output", async () => {
        const chunks = ["added ", "1 package"];
        const spawn = vi.fn().mockResolvedValue({
            output: new ReadableStream<string>({
                start(controller) {
                    for (const chunk of chunks) controller.enqueue(chunk);
                    controller.close();
                }
            }),
            exit: Promise.resolve(0)
        });
        const container = { spawn } as any;

        const result = await installPackage(container, "nanoid");

        expect(spawn).toHaveBeenCalledWith("npm", ["install", "nanoid"]);
        expect(result.exitCode).toBe(0);
        expect(result.output).toBe("added 1 package");
    });

    it("resolves with a non-zero exit code when npm install fails", async () => {
        const spawn = vi.fn().mockResolvedValue({
            output: new ReadableStream<string>({
                start(controller) {
                    controller.enqueue("404 Not Found");
                    controller.close();
                }
            }),
            exit: Promise.resolve(1)
        });
        const container = { spawn } as any;

        const result = await installPackage(container, "this-package-does-not-exist");

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain("404");
    });

    it("streams each output chunk to the onOutput callback as it arrives, in order", async () => {
        const chunks = ["added ", "1 package"];
        const spawn = vi.fn().mockResolvedValue({
            output: new ReadableStream<string>({
                start(controller) {
                    for (const chunk of chunks) controller.enqueue(chunk);
                    controller.close();
                }
            }),
            exit: Promise.resolve(0)
        });
        const container = { spawn } as any;
        const onOutput = vi.fn();

        const result = await installPackage(container, "nanoid", onOutput);

        expect(onOutput.mock.calls).toEqual(chunks.map(chunk => [chunk]));
        expect(result.output).toBe("added 1 package");
    });
});

describe("uninstallPackage", () => {
    it("rejects invalid package names without spawning a process", async () => {
        const spawn = vi.fn();
        const container = { spawn } as any;

        await expect(uninstallPackage(container, "; rm -rf /")).rejects.toThrow(/not a valid npm package name/);
        expect(spawn).not.toHaveBeenCalled();
    });

    it("spawns npm uninstall and resolves with the exit code and collected output", async () => {
        const spawn = vi.fn().mockResolvedValue({
            output: new ReadableStream<string>({
                start(controller) {
                    controller.enqueue("removed 1 package");
                    controller.close();
                }
            }),
            exit: Promise.resolve(0)
        });
        const container = { spawn } as any;

        const result = await uninstallPackage(container, "nanoid");

        expect(spawn).toHaveBeenCalledWith("npm", ["uninstall", "nanoid"]);
        expect(result.exitCode).toBe(0);
        expect(result.output).toBe("removed 1 package");
    });

    it("streams output chunks to the onOutput callback as it arrives", async () => {
        const spawn = vi.fn().mockResolvedValue({
            output: new ReadableStream<string>({
                start(controller) {
                    controller.enqueue("removed 1 package");
                    controller.close();
                }
            }),
            exit: Promise.resolve(0)
        });
        const container = { spawn } as any;
        const onOutput = vi.fn();

        await uninstallPackage(container, "nanoid", onOutput);

        expect(onOutput).toHaveBeenCalledWith("removed 1 package");
    });
});

describe("listInstalledPackages", () => {
    it("returns the dependency names from package.json, sorted", async () => {
        const readFile = vi.fn().mockResolvedValue(JSON.stringify({
            name: "sandbox",
            private: true,
            dependencies: { nanoid: "^5.0.0", "left-pad": "^1.3.0" }
        }));
        const container = { fs: { readFile } } as any;

        const packages = await listInstalledPackages(container);

        expect(readFile).toHaveBeenCalledWith("package.json", "utf-8");
        expect(packages).toEqual(["left-pad", "nanoid"]);
    });

    it("returns an empty array when package.json has no dependencies", async () => {
        const readFile = vi.fn().mockResolvedValue(JSON.stringify({ name: "sandbox", private: true }));
        const container = { fs: { readFile } } as any;

        expect(await listInstalledPackages(container)).toEqual([]);
    });
});

describe("isNpmBusy / onNpmBusyChange", () => {
    it("reports idle when no npm command is running", () => {
        expect(isNpmBusy()).toBe(false);
    });

    it("reports busy while a command is in flight, then idle once it settles", async () => {
        const { container, finishWith } = createControllableContainer();

        const promise = installPackage(container, "nanoid");

        expect(isNpmBusy()).toBe(true);

        finishWith(0);
        await promise;

        expect(isNpmBusy()).toBe(false);
    });

    it("stays busy while a second overlapping command is still running", async () => {
        const first = createControllableContainer();
        const second = createControllableContainer();

        const firstPromise = installPackage(first.container, "nanoid");
        const secondPromise = installPackage(second.container, "left-pad");

        first.finishWith(0);
        await firstPromise;

        expect(isNpmBusy()).toBe(true);

        second.finishWith(0);
        await secondPromise;

        expect(isNpmBusy()).toBe(false);
    });

    it("notifies a subscriber immediately with the current state, then on each transition", async () => {
        const { container, finishWith } = createControllableContainer();
        const states: boolean[] = [];

        const unsubscribe = onNpmBusyChange(busy => states.push(busy));
        expect(states).toEqual([false]);

        const promise = installPackage(container, "nanoid");
        expect(states).toEqual([false, true]);

        finishWith(0);
        await promise;
        expect(states).toEqual([false, true, false]);

        unsubscribe();
    });

    it("stops notifying once unsubscribed", async () => {
        const { container, finishWith } = createControllableContainer();
        const listener = vi.fn();

        const unsubscribe = onNpmBusyChange(listener);
        unsubscribe();
        listener.mockClear();

        const promise = installPackage(container, "nanoid");
        finishWith(0);
        await promise;

        expect(listener).not.toHaveBeenCalled();
    });
});

describe("createDefaultPackageJson", () => {
    it("declares each default dependency with a name and private:true, installable by a bare `npm install`", () => {
        const manifest = JSON.parse(createDefaultPackageJson());

        expect(manifest.name).toBe("sandbox");
        expect(manifest.private).toBe(true);

        for (const name of DEFAULT_DEPENDENCIES) {
            expect(manifest.dependencies).toHaveProperty(name);
        }
    });
});

describe("loadUploadedProject", () => {
    it("mounts the uploaded package.json/package-lock.json and runs `npm ci`", async () => {
        const mount = vi.fn().mockResolvedValue(undefined);
        const spawn = vi.fn().mockResolvedValue({
            output: new ReadableStream<string>({
                start(controller) {
                    controller.close();
                }
            }),
            exit: Promise.resolve(0)
        });
        const container = { mount, spawn } as any;

        const result = await loadUploadedProject(container, {
            packageJson: "{\"name\":\"uploaded\"}",
            packageLockJson: "{\"lockfileVersion\":3}"
        });

        expect(mount).toHaveBeenCalledWith({
            "package.json": { file: { contents: "{\"name\":\"uploaded\"}" } },
            "package-lock.json": { file: { contents: "{\"lockfileVersion\":3}" } }
        });
        expect(spawn).toHaveBeenCalledWith("npm", ["ci"]);
        expect(result.exitCode).toBe(0);
    });

    it("resolves with a non-zero exit code when npm ci fails, without throwing", async () => {
        const mount = vi.fn().mockResolvedValue(undefined);
        const spawn = vi.fn().mockResolvedValue({
            output: new ReadableStream<string>({
                start(controller) {
                    controller.enqueue("npm ERR! package.json and package-lock.json are out of sync");
                    controller.close();
                }
            }),
            exit: Promise.resolve(1)
        });
        const container = { mount, spawn } as any;

        const result = await loadUploadedProject(container, { packageJson: "{}", packageLockJson: "{}" });

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain("out of sync");
    });
});

describe("resetToDefaultProject", () => {
    it("deletes performance.ts, package.json and package-lock.json, then mounts a fresh default package.json and runs `npm install`", async () => {
        const rm = vi.fn().mockResolvedValue(undefined);
        const mount = vi.fn().mockResolvedValue(undefined);
        const spawn = vi.fn().mockResolvedValue({
            output: new ReadableStream<string>({
                start(controller) {
                    controller.close();
                }
            }),
            exit: Promise.resolve(0)
        });
        const container = { fs: { rm }, mount, spawn } as any;

        const result = await resetToDefaultProject(container);

        expect(rm).toHaveBeenCalledWith("performance.ts", { force: true });
        expect(rm).toHaveBeenCalledWith("package.json", { force: true });
        expect(rm).toHaveBeenCalledWith("package-lock.json", { force: true });
        expect(mount).toHaveBeenCalledWith({
            "package.json": { file: { contents: createDefaultPackageJson() } }
        });
        expect(spawn).toHaveBeenCalledWith("npm", ["install"]);
        expect(result.exitCode).toBe(0);
    });

    it("resolves with a non-zero exit code when npm install fails, without throwing", async () => {
        const rm = vi.fn().mockResolvedValue(undefined);
        const mount = vi.fn().mockResolvedValue(undefined);
        const spawn = vi.fn().mockResolvedValue({
            output: new ReadableStream<string>({
                start(controller) {
                    controller.enqueue("npm ERR! network failure");
                    controller.close();
                }
            }),
            exit: Promise.resolve(1)
        });
        const container = { fs: { rm }, mount, spawn } as any;

        const result = await resetToDefaultProject(container);

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain("network failure");
    });
});

describe("isDefaultDependency", () => {
    it("returns true for each of the default dependencies", () => {
        for (const name of DEFAULT_DEPENDENCIES) {
            expect(isDefaultDependency(name)).toBe(true);
        }
    });

    it("returns false for any other package", () => {
        expect(isDefaultDependency("nanoid")).toBe(false);
    });
});
