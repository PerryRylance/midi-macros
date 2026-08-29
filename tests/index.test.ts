import { describe, expect, it } from "vitest";
import * as midiMacros from "../src/index";

// The package root only re-exported each macro module via `export *`, but
// every macro (and lerp) is a *default* export of its own file - `export *`
// never re-exports defaults, so none of them were ever reachable via
// `import { X } from "@perry-rylance/midi-macros"`. Every other test in this
// suite imports straight from the macro's own module path (e.g.
// "../src/macros/parallel"), which is exactly why this went unnoticed - this
// test is the only one that goes through the actual published entry point.
describe("package root barrel (src/index.ts)", () => {
    it.each(["lerp", "repeat", "partition", "interpolate", "ramp", "cycle", "parallel"])(
        "exports %s as a named function",
        name => {
            expect(typeof (midiMacros as Record<string, unknown>)[name]).toBe("function");
        }
    );
});
