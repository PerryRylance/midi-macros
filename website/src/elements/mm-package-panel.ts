import type { WebContainer } from "@webcontainer/api";
import {
    bootWebContainer,
    DEFAULT_DEPENDENCIES,
    installPackage,
    isDefaultDependency,
    listInstalledPackages,
    uninstallPackage,
    type InstallResult
} from "../webcontainer";
import { dispatchTerminalOutput } from "../events";
import type { MmTabsElement } from "./mm-tabs";

const BUILD_TABS_ID = "build-tabs";
const TERMINAL_PANEL_ID = "tab-terminal";

function switchToTerminalTab(): void {
    document.querySelector<MmTabsElement>(`#${BUILD_TABS_ID}`)?.activatePanel(TERMINAL_PANEL_ID);
}

export class MmPackagePanelElement extends HTMLElement {
    #container: WebContainer | undefined;
    #status: HTMLParagraphElement;
    #input: HTMLInputElement;
    #installButton: HTMLButtonElement;
    #packageList: HTMLUListElement;

    constructor() {
        super();

        this.#status = document.createElement("p");
        this.#status.id = "status";
        this.#status.textContent = "Loading...";

        const label = document.createElement("label");
        label.htmlFor = "package-name";
        label.textContent = "npm package name";

        this.#input = document.createElement("input");
        this.#input.id = "package-name";
        this.#input.type = "text";
        this.#input.required = true;
        this.#input.disabled = true;

        this.#installButton = document.createElement("button");
        this.#installButton.id = "install-button";
        this.#installButton.type = "submit";
        this.#installButton.textContent = "Install";
        this.#installButton.disabled = true;

        const form = document.createElement("form");
        form.id = "install-form";
        form.append(label, this.#input, this.#installButton);
        form.addEventListener("submit", event => this.#handleSubmit(event));

        const heading = document.createElement("h2");
        heading.textContent = "Installed packages";

        this.#packageList = document.createElement("ul");
        this.#packageList.id = "package-list";

        this.append(this.#status, form, heading, this.#packageList);
    }

    connectedCallback(): void {
        void this.#boot();
    }

    async #boot(): Promise<void> {
        switchToTerminalTab();
        dispatchTerminalOutput(`$ npm install ${DEFAULT_DEPENDENCIES.join(" ")}\n`);

        this.#container = await bootWebContainer(chunk => dispatchTerminalOutput(chunk));

        await this.#refreshPackageList();

        this.#status.textContent = "Ready.";
        this.#setBusy(false);
    }

    #setBusy(busy: boolean): void {
        this.#input.disabled = busy;
        this.#installButton.disabled = busy;

        for (const button of this.#packageList.querySelectorAll("button")) {
            button.disabled = busy;
        }
    }

    async #refreshPackageList(): Promise<void> {
        if (!this.#container) return;

        const packages = await listInstalledPackages(this.#container);

        this.#packageList.replaceChildren(...packages.map(name => this.#buildPackageItem(name)));
    }

    #buildPackageItem(name: string): HTMLLIElement {
        const item = document.createElement("li");
        const label = document.createElement("span");

        label.textContent = name;
        item.append(label);

        if (!isDefaultDependency(name)) {
            const removeButton = document.createElement("button");

            removeButton.type = "button";
            removeButton.textContent = "Remove";
            removeButton.addEventListener("click", () => this.#removePackage(name));

            item.append(removeButton);
        }

        return item;
    }

    async #run(operation: () => Promise<InstallResult>, verb: string, name: string): Promise<void> {
        switchToTerminalTab();
        this.#setBusy(true);

        try {
            const result = await operation();

            this.#status.textContent = result.exitCode === 0
                ? `${verb} ${name}.`
                : `Failed to ${verb.toLowerCase()} ${name}.`;
        } catch (error) {
            dispatchTerminalOutput(`${error instanceof Error ? error.message : String(error)}\n`);
            this.#status.textContent = "Error.";
        } finally {
            await this.#refreshPackageList();
            this.#setBusy(false);
        }
    }

    async #handleSubmit(event: SubmitEvent): Promise<void> {
        event.preventDefault();

        if (!this.#container) return;

        const name = this.#input.value.trim();
        const container = this.#container;

        dispatchTerminalOutput(`$ npm install ${name}\n`);

        await this.#run(
            () => installPackage(container, name, chunk => dispatchTerminalOutput(chunk)),
            "Installed",
            name
        );
    }

    async #removePackage(name: string): Promise<void> {
        if (!this.#container) return;

        const container = this.#container;

        dispatchTerminalOutput(`$ npm uninstall ${name}\n`);

        await this.#run(
            () => uninstallPackage(container, name, chunk => dispatchTerminalOutput(chunk)),
            "Removed",
            name
        );
    }
}

customElements.define("mm-package-panel", MmPackagePanelElement);
