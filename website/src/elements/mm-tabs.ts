const TAB_LABEL_ATTRIBUTE = "data-tab-label";

function slugify(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

// A generic tab-switcher: any light-DOM child marked with data-tab-label
// becomes a tab, labelled and toggled via that attribute - content-agnostic,
// so callers compose whatever markup they like as tabs (see mm-sidebar.ts,
// which is this same behaviour under its own tag name) without this element
// needing to know about it.
export class MmTabsElement extends HTMLElement {
    #nav = document.createElement("nav");
    #panels: HTMLElement[] = [];

    connectedCallback(): void {
        if (this.#panels.length > 0) return;

        this.#panels = Array.from(this.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute(TAB_LABEL_ATTRIBUTE)
        );

        this.prepend(this.#nav);

        this.#panels.forEach((panel, index) => {
            const label = panel.getAttribute(TAB_LABEL_ATTRIBUTE) ?? panel.id;

            const button = document.createElement("button");
            button.type = "button";
            button.id = `tab-button-${slugify(label)}`;
            button.textContent = label;
            button.setAttribute("aria-selected", String(index === 0));

            if (panel.id) button.setAttribute("aria-controls", panel.id);

            button.addEventListener("click", () => this.#activate(panel));

            panel.hidden = index !== 0;

            this.#nav.append(button);
        });
    }

    activatePanel(panelId: string): void {
        const panel = this.#panels.find(candidate => candidate.id === panelId);

        if (panel) this.#activate(panel);
    }

    #activate(target: HTMLElement): void {
        for (const panel of this.#panels) {
            panel.hidden = panel !== target;
        }

        for (const button of this.#nav.querySelectorAll("button")) {
            button.setAttribute("aria-selected", String(button.getAttribute("aria-controls") === target.id));
        }
    }
}

customElements.define("mm-tabs", MmTabsElement);
