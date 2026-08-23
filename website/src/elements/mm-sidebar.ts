import { MmTabsElement } from "./mm-tabs";

// The sidebar is just the generic tab-switcher under its own tag name, for
// the CSS in style.scss (which targets `mm-sidebar` specifically) and to
// keep the existing markup in index.html unchanged.
export class MmSidebarElement extends MmTabsElement {}

customElements.define("mm-sidebar", MmSidebarElement);
