import { describe, expect, it } from "vitest";
import { hasDefaultExport } from "../src/defaultExport";

describe("hasDefaultExport", () => {
    it("returns false for an empty file", () => {
        expect(hasDefaultExport("")).toBe(false);
    });

    it("returns false when only named exports are present", () => {
        expect(hasDefaultExport("export const x = 1;")).toBe(false);
    });

    it("returns true for a default-exported expression", () => {
        expect(hasDefaultExport("const x = 1;\nexport default x;")).toBe(true);
    });

    it("returns true for a default-exported class declaration", () => {
        expect(hasDefaultExport("export default class Foo {}")).toBe(true);
    });

    it("returns true for a default-exported function declaration", () => {
        expect(hasDefaultExport("export default function foo() {}")).toBe(true);
    });

    it("returns true for a default-exported anonymous object literal", () => {
        expect(hasDefaultExport("export default { a: 1 };")).toBe(true);
    });

    it("does not false-positive on a comment mentioning 'export default'", () => {
        expect(hasDefaultExport("// export default fake\nconst x = 1;")).toBe(false);
    });

    it("does not false-positive on a string literal containing 'export default'", () => {
        expect(hasDefaultExport('const s = "export default fake";')).toBe(false);
    });

    it("returns true regardless of what is actually being exported", () => {
        expect(hasDefaultExport("export default 42;")).toBe(true);
    });
});
