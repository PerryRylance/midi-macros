import { describe, expect, it } from "vitest";
import { toSignatureHelp } from "../src/tsServerSignatureHelp";

describe("toSignatureHelp", () => {
    it("builds a single-parameter signature label with an offset range for the parameter", () => {
        const result = toSignatureHelp({
            items: [
                {
                    isVariadic: false,
                    prefixDisplayParts: [{ text: "tracks" }, { text: "(" }],
                    suffixDisplayParts: [{ text: ")" }, { text: ":" }, { text: " " }, { text: "File" }],
                    separatorDisplayParts: [{ text: "," }, { text: " " }],
                    parameters: [
                        { name: "value", documentation: [], displayParts: [{ text: "value" }, { text: ": " }, { text: "Track[]" }], isOptional: false }
                    ],
                    documentation: [],
                    tags: []
                }
            ],
            selectedItemIndex: 0,
            argumentIndex: 0
        });

        expect(result.activeSignature).toBe(0);
        expect(result.activeParameter).toBe(0);
        expect(result.signatures).toHaveLength(1);

        const [signature] = result.signatures;
        expect(signature?.label).toBe("tracks(value: Track[]): File");
        // "value: Track[]" starts right after "tracks(" (7 chars) and is 14 chars long.
        expect(signature?.parameters).toEqual([{ label: [7, 21] }]);
    });

    it("separates multiple parameters with the separatorDisplayParts and computes each offset range", () => {
        const result = toSignatureHelp({
            items: [
                {
                    isVariadic: false,
                    prefixDisplayParts: [{ text: "add" }, { text: "(" }],
                    suffixDisplayParts: [{ text: ")" }],
                    separatorDisplayParts: [{ text: "," }, { text: " " }],
                    parameters: [
                        { name: "a", documentation: [], displayParts: [{ text: "a" }, { text: ": " }, { text: "number" }], isOptional: false },
                        { name: "b", documentation: [], displayParts: [{ text: "b" }, { text: ": " }, { text: "number" }], isOptional: false }
                    ],
                    documentation: [],
                    tags: []
                }
            ],
            selectedItemIndex: 0,
            argumentIndex: 1
        });

        const [signature] = result.signatures;
        expect(signature?.label).toBe("add(a: number, b: number)");
        expect(signature?.parameters).toEqual([
            { label: [4, 13] },
            { label: [15, 24] }
        ]);
        expect(result.activeParameter).toBe(1);
    });

    it("flattens signature and parameter documentation from display parts", () => {
        const result = toSignatureHelp({
            items: [
                {
                    isVariadic: false,
                    prefixDisplayParts: [{ text: "foo(" }],
                    suffixDisplayParts: [{ text: ")" }],
                    separatorDisplayParts: [{ text: ", " }],
                    parameters: [
                        { name: "x", documentation: [{ text: "the x value" }], displayParts: [{ text: "x" }], isOptional: false }
                    ],
                    documentation: [{ text: "Does the foo " }, { text: "thing." }],
                    tags: []
                }
            ],
            selectedItemIndex: 0,
            argumentIndex: 0
        });

        const [signature] = result.signatures;
        expect(signature?.documentation).toBe("Does the foo thing.");
        expect(signature?.parameters[0]).toEqual({ label: [4, 5], documentation: "the x value" });
    });

    it("omits documentation entirely when there is none", () => {
        const result = toSignatureHelp({
            items: [
                {
                    isVariadic: false,
                    prefixDisplayParts: [{ text: "bar(" }],
                    suffixDisplayParts: [{ text: ")" }],
                    separatorDisplayParts: [{ text: ", " }],
                    parameters: [],
                    documentation: [],
                    tags: []
                }
            ],
            selectedItemIndex: 0,
            argumentIndex: 0
        });

        const [signature] = result.signatures;
        expect(signature).not.toHaveProperty("documentation");
        expect(signature?.label).toBe("bar()");
        expect(signature?.parameters).toEqual([]);
    });

    it("carries multiple overloads through as separate signatures", () => {
        const result = toSignatureHelp({
            items: [
                {
                    isVariadic: false,
                    prefixDisplayParts: [{ text: "overload(" }],
                    suffixDisplayParts: [{ text: ")" }],
                    separatorDisplayParts: [{ text: ", " }],
                    parameters: [{ name: "a", documentation: [], displayParts: [{ text: "a: string" }], isOptional: false }],
                    documentation: [],
                    tags: []
                },
                {
                    isVariadic: false,
                    prefixDisplayParts: [{ text: "overload(" }],
                    suffixDisplayParts: [{ text: ")" }],
                    separatorDisplayParts: [{ text: ", " }],
                    parameters: [{ name: "a", documentation: [], displayParts: [{ text: "a: number" }], isOptional: false }],
                    documentation: [],
                    tags: []
                }
            ],
            selectedItemIndex: 1,
            argumentIndex: 0
        });

        expect(result.signatures).toHaveLength(2);
        expect(result.activeSignature).toBe(1);
        expect(result.signatures[0]?.label).toBe("overload(a: string)");
        expect(result.signatures[1]?.label).toBe("overload(a: number)");
    });
});
