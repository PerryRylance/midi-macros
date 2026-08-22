import { describe, expect, it, vi } from "vitest";
import {
    DEFAULT_DEPENDENCIES,
    installPackage,
    isDefaultDependency,
    isValidPackageName,
    listInstalledPackages,
    uninstallPackage
} from "../src/webcontainer";

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
