import Split from "split.js";
import { createElement, GripHorizontal, GripVertical } from "lucide";

// Split.js's own "horizontal"/"vertical" direction naming is the inverse of
// the layout class names in index.html: a "horizontal" split arranges panes
// side-by-side, so its gutter is a vertical bar (grabbed with a GripVertical
// icon); a "vertical" split stacks panes, so its gutter is a horizontal bar
// (GripHorizontal).
function createGutter(_index: number, direction: "horizontal" | "vertical"): HTMLElement {
    const gutter = document.createElement("div");
    gutter.className = `gutter gutter-${direction}`;

    const icon = direction === "horizontal" ? GripVertical : GripHorizontal;
    gutter.append(createElement(icon));

    return gutter;
}

const outer = document.querySelector<HTMLElement>("#wrapper > .split.vertical");
const inner = outer?.querySelector<HTMLElement>(":scope > .split.horizontal");

if (outer && inner) {
    // .split.vertical: sidebar / main panel side-by-side, resizable on the X axis
    Split(Array.from(outer.children) as HTMLElement[], {
        direction: "horizontal",
        sizes: [75, 25],
        minSize: [200, 200],
        gutterSize: 6,
        gutter: createGutter
    });

    // .split.horizontal: editor / terminal stacked, resizable on the Y axis
    Split(Array.from(inner.children) as HTMLElement[], {
        direction: "vertical",
        sizes: [75, 25],
        minSize: [120, 80],
        gutterSize: 6,
        gutter: createGutter
    });
}
