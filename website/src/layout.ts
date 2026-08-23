import Split from "split.js";

const outer = document.querySelector<HTMLElement>("#wrapper > .split.vertical");
const inner = outer?.querySelector<HTMLElement>(":scope > .split.horizontal");

if (outer && inner) {
    // Split(Array.from(inner.children) as HTMLElement[], {
    //     direction: "horizontal",
    //     sizes: [70, 30],
    //     minSize: [200, 200],
    //     gutterSize: 6
    // });

    // Split(Array.from(outer.children) as HTMLElement[], {
    //     direction: "vertical",
    //     sizes: [75, 25],
    //     minSize: [200, 120],
    //     gutterSize: 6
    // });
}
