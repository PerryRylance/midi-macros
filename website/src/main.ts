import "@xterm/xterm/css/xterm.css";
import { bootWebContainer, DEFAULT_DEPENDENCIES, installPackage, isDefaultDependency, listInstalledPackages, uninstallPackage } from "./webcontainer";
import { createTerminal } from "./terminal";

const status = document.querySelector<HTMLParagraphElement>("#status")!;
const form = document.querySelector<HTMLFormElement>("#install-form")!;
const input = document.querySelector<HTMLInputElement>("#package-name")!;
const button = document.querySelector<HTMLButtonElement>("#install-button")!;
const terminalContainer = document.querySelector<HTMLDivElement>("#terminal")!;
const packageList = document.querySelector<HTMLUListElement>("#package-list")!;

const terminal = createTerminal(terminalContainer);

terminal.writeln(`$ npm install ${DEFAULT_DEPENDENCIES.join(" ")}`);
const container = await bootWebContainer(chunk => terminal.write(chunk));

function setBusy(busy: boolean): void {
    input.disabled = busy;
    button.disabled = busy;

    for (const removeButton of packageList.querySelectorAll("button")) {
        removeButton.disabled = busy;
    }
}

async function refreshPackageList(): Promise<void> {
    const packages = await listInstalledPackages(container);

    packageList.replaceChildren(...packages.map(name => {
        const item = document.createElement("li");
        const label = document.createElement("span");

        label.textContent = name;
        item.append(label);

        if (!isDefaultDependency(name)) {
            const removeButton = document.createElement("button");

            removeButton.type = "button";
            removeButton.textContent = "Remove";
            removeButton.addEventListener("click", () => removePackage(name));

            item.append(removeButton);
        }

        return item;
    }));
}

async function removePackage(name: string): Promise<void> {
    setBusy(true);
    terminal.writeln(`$ npm uninstall ${name}`);

    try {
        const result = await uninstallPackage(container, name, chunk => terminal.write(chunk));

        status.textContent = result.exitCode === 0 ? `Removed ${name}.` : `Failed to remove ${name}.`;
    } catch (error) {
        terminal.writeln(error instanceof Error ? error.message : String(error));
        status.textContent = "Error.";
    } finally {
        await refreshPackageList();
        setBusy(false);
    }
}

await refreshPackageList();

status.textContent = "Ready.";
setBusy(false);

form.addEventListener("submit", async event => {
    event.preventDefault();

    const name = input.value.trim();

    setBusy(true);
    terminal.writeln(`$ npm install ${name}`);

    try {
        const result = await installPackage(container, name, chunk => terminal.write(chunk));

        status.textContent = result.exitCode === 0 ? `Installed ${name}.` : `Failed to install ${name}.`;
    } catch (error) {
        terminal.writeln(error instanceof Error ? error.message : String(error));
        status.textContent = "Error.";
    } finally {
        await refreshPackageList();
        setBusy(false);
    }
});
