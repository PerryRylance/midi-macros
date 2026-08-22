import { describe, expect, it } from "vitest";
import { toHoverContent } from "../src/tsServerHover";

describe("toHoverContent", () => {
    it("renders the display string as a typescript code block", () => {
        const hover = toHoverContent({
            start: { line: 2, offset: 7 },
            end: { line: 2, offset: 8 },
            displayString: "const x: number"
        });

        expect(hover.contents[0]).toEqual({ value: "```typescript\nconst x: number\n```" });
        expect(hover.range).toEqual({ startLineNumber: 2, startColumn: 7, endLineNumber: 2, endColumn: 8 });
    });

    // tsserver's real `quickinfo` command (as opposed to `quickinfo-full`)
    // returns `documentation`/tag `text` as plain strings, not
    // SymbolDisplayPart arrays, unless `displayPartsForJSDoc` is explicitly
    // requested - confirmed against a real tsserver response and against
    // TypeScript's own protocol.d.ts (`documentation: string | SymbolDisplayPart[]`).
    // This is the shape actually seen in production, so it's listed first.
    it("appends plain-string documentation as a separate content block", () => {
        const hover = toHoverContent({
            start: { line: 1, offset: 1 },
            end: { line: 1, offset: 2 },
            displayString: "function foo(): void",
            documentation: "Does the foo thing."
        });

        expect(hover.contents).toEqual([
            { value: "```typescript\nfunction foo(): void\n```" },
            { value: "Does the foo thing." }
        ]);
    });

    it("appends each JSDoc tag with plain-string text as its own content block", () => {
        const hover = toHoverContent({
            start: { line: 1, offset: 1 },
            end: { line: 1, offset: 2 },
            displayString: "function foo(x: number): void",
            tags: [
                { name: "param", text: "x - the input" },
                { name: "returns" }
            ]
        });

        expect(hover.contents).toEqual([
            { value: "```typescript\nfunction foo(x: number): void\n```" },
            { value: "*@param* x - the input" },
            { value: "*@returns*" }
        ]);
    });

    it("also handles documentation as a SymbolDisplayPart array (displayPartsForJSDoc shape)", () => {
        const hover = toHoverContent({
            start: { line: 1, offset: 1 },
            end: { line: 1, offset: 2 },
            displayString: "function foo(): void",
            documentation: [{ text: "Does the foo thing." }]
        });

        expect(hover.contents).toEqual([
            { value: "```typescript\nfunction foo(): void\n```" },
            { value: "Does the foo thing." }
        ]);
    });

    it("also handles JSDoc tag text as a SymbolDisplayPart array (displayPartsForJSDoc shape)", () => {
        const hover = toHoverContent({
            start: { line: 1, offset: 1 },
            end: { line: 1, offset: 2 },
            displayString: "function foo(x: number): void",
            tags: [{ name: "param", text: [{ text: "x - the input" }] }]
        });

        expect(hover.contents).toEqual([
            { value: "```typescript\nfunction foo(x: number): void\n```" },
            { value: "*@param* x - the input" }
        ]);
    });

    it("treats an empty documentation string the same as no documentation", () => {
        const hover = toHoverContent({
            start: { line: 1, offset: 1 },
            end: { line: 1, offset: 2 },
            displayString: "let y: string",
            documentation: ""
        });

        expect(hover.contents).toHaveLength(1);
    });

    it("omits documentation/tag blocks entirely when there are none", () => {
        const hover = toHoverContent({
            start: { line: 1, offset: 1 },
            end: { line: 1, offset: 2 },
            displayString: "let y: string"
        });

        expect(hover.contents).toHaveLength(1);
    });
});
