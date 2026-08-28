import { createElement, Pencil } from "lucide";
import { DEFAULT_TITLE } from "../serialization";

const TITLE_STORAGE_KEY = "title";

export class MmEditableTitleElement extends HTMLElement {
    #heading: HTMLHeadingElement;
    #input: HTMLInputElement;
    #editButton: HTMLButtonElement;

    constructor() {
        super();

        this.#heading = document.createElement("h1");
        this.#heading.textContent = DEFAULT_TITLE;

        this.#input = document.createElement("input");
        this.#input.id = "title-input";
        this.#input.type = "text";
        this.#input.hidden = true;

        this.#input.addEventListener("input", () => this.#applyTitle(this.#input.value));
        this.#input.addEventListener("blur", () => this.#stopEditing());
        this.#input.addEventListener("keydown", event => {
            if (event.key === "Enter") this.#input.blur();
        });

        this.#editButton = document.createElement("button");
        this.#editButton.id = "edit-title-button";
        this.#editButton.type = "button";
        this.#editButton.setAttribute("aria-label", "Edit title");
        this.#editButton.append(createElement(Pencil));
        this.#editButton.addEventListener("click", () => this.#startEditing());

        this.append(this.#heading, this.#input, this.#editButton);
    }

    connectedCallback(): void {
        const stored = localStorage.getItem(TITLE_STORAGE_KEY);

        // Only reapplies an existing saved title - doesn't write the default
        // back out, so a fresh visitor's first save is genuinely their own
        // first edit, not this restore.
        if (stored !== null) this.#applyTitle(stored);
    }

    getTitle(): string {
        return this.#heading.textContent ?? "";
    }

    // Used to populate the title from an uploaded/imported archive's filename
    // - falls back to the default for a blank value (e.g. a URL with no path
    // segment), same as clearing the heading by hand does on blur.
    setTitle(value: string): void {
        this.#commitTitle(value);
    }

    // Falls back to DEFAULT_TITLE for a blank value, then applies - shared by
    // setTitle() and blurring an emptied input. Deliberately not used by the
    // live "input" listener below, which applies the raw value as-is so the
    // heading can go genuinely blank while the user is still typing/backspacing.
    #commitTitle(value: string): void {
        const trimmed = value.trim();

        this.#applyTitle(trimmed.length > 0 ? value : DEFAULT_TITLE);
    }

    #applyTitle(value: string): void {
        this.#heading.textContent = value;
        document.title = value;
        localStorage.setItem(TITLE_STORAGE_KEY, value);
    }

    #startEditing(): void {
        this.#input.value = this.getTitle();
        this.#heading.hidden = true;
        this.#input.hidden = false;
        this.#input.focus();
        this.#input.select();
    }

    #stopEditing(): void {
        this.#commitTitle(this.#input.value);

        this.#input.hidden = true;
        this.#heading.hidden = false;
    }
}

customElements.define("mm-editable-title", MmEditableTitleElement);
