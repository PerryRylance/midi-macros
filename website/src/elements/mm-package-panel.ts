import type { WebContainer } from "@webcontainer/api";
import {
    bootWebContainer,
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
    #dialog: HTMLDialogElement;
    #input: HTMLInputElement;
    #installButton: HTMLButtonElement;
    #packageList: HTMLUListElement;
    #addPackageItem: HTMLLIElement;

    constructor() {
        super();

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

        const cancelButton = document.createElement("button");
        cancelButton.id = "cancel-add-package-button";
        cancelButton.type = "button";
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => this.#dialog.close());

        const form = document.createElement("form");
        form.id = "install-form";
        form.append(label, this.#input, this.#installButton, cancelButton);
        form.addEventListener("submit", event => this.#handleSubmit(event));

        const dialogHeading = document.createElement("h2");
        dialogHeading.textContent = "Add package";

        this.#dialog = document.createElement("dialog");
        this.#dialog.id = "add-package-dialog";
        this.#dialog.append(dialogHeading, form);

        this.#addPackageItem = document.createElement("li");

        const addPackageButton = document.createElement("button");
        addPackageButton.id = "add-package-button";
        addPackageButton.type = "button";
        addPackageButton.textContent = "Add package";
        addPackageButton.addEventListener("click", () => this.#dialog.showModal());

        this.#addPackageItem.append(addPackageButton);

        this.#packageList = document.createElement("ul");
        this.#packageList.id = "package-list";

        this.append(this.#dialog, this.#packageList);
    }

    connectedCallback(): void {
        void this.#boot();
    }

    async #boot(): Promise<void> {
        switchToTerminalTab();
        dispatchTerminalOutput("$ npm install\n");

        this.#container = await bootWebContainer(chunk => dispatchTerminalOutput(chunk));

        await this.#refreshPackageList();

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

        this.#packageList.replaceChildren(...packages.map(name => this.#buildPackageItem(name)), this.#addPackageItem);
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

    async #run(operation: () => Promise<InstallResult>): Promise<void> {
        switchToTerminalTab();
        this.#setBusy(true);

        try {
            await operation();
        } catch (error) {
            dispatchTerminalOutput(`${error instanceof Error ? error.message : String(error)}\n`);
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

        this.#dialog.close();
        dispatchTerminalOutput(`$ npm install ${name}\n`);

        await this.#run(() => installPackage(container, name, chunk => dispatchTerminalOutput(chunk)));
    }

    async #removePackage(name: string): Promise<void> {
        if (!this.#container) return;

        const container = this.#container;

        dispatchTerminalOutput(`$ npm uninstall ${name}\n`);

        await this.#run(() => uninstallPackage(container, name, chunk => dispatchTerminalOutput(chunk)));
    }
}

customElements.define("mm-package-panel", MmPackagePanelElement);
