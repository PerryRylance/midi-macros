import { describe, expect, it } from "vitest";
import { CompletionItemKind, toCompletionItems } from "../src/tsServerCompletions";

describe("toCompletionItems", () => {
    it("maps a plain entry using its name as both label and insertText", () => {
        const items = toCompletionItems({
            entries: [{ name: "tracks", kind: "getter", sortText: "11" }]
        });

        expect(items).toEqual([
            { label: "tracks", kind: CompletionItemKind.Property, insertText: "tracks", sortText: "11" }
        ]);
    });

    it("uses the entry's own insertText when provided instead of its name", () => {
        const items = toCompletionItems({
            entries: [{ name: "class", kind: "keyword", sortText: "0", insertText: "class " }]
        });

        expect(items[0]).toMatchObject({ label: "class", insertText: "class " });
    });

    it.each([
        ["method", CompletionItemKind.Method],
        ["function", CompletionItemKind.Function],
        ["constructor", CompletionItemKind.Constructor],
        ["property", CompletionItemKind.Property],
        ["getter", CompletionItemKind.Property],
        ["setter", CompletionItemKind.Property],
        ["var", CompletionItemKind.Variable],
        ["let", CompletionItemKind.Variable],
        ["const", CompletionItemKind.Constant],
        ["class", CompletionItemKind.Class],
        ["interface", CompletionItemKind.Interface],
        ["enum", CompletionItemKind.Enum],
        ["enum member", CompletionItemKind.EnumMember],
        ["module", CompletionItemKind.Module],
        ["keyword", CompletionItemKind.Keyword],
        ["type parameter", CompletionItemKind.TypeParameter],
        ["directory", CompletionItemKind.Folder]
    ])("maps tsserver kind %s to CompletionItemKind %i", (tsKind, expectedKind) => {
        const items = toCompletionItems({ entries: [{ name: "x", kind: tsKind, sortText: "0" }] });

        expect(items[0]?.kind).toBe(expectedKind);
    });

    it("falls back to Text for an unrecognized or unknown kind", () => {
        const items = toCompletionItems({
            entries: [
                { name: "a", kind: "", sortText: "0" },
                { name: "b", kind: "some-future-kind-we-dont-know-about", sortText: "0" }
            ]
        });

        expect(items.map(item => item.kind)).toEqual([CompletionItemKind.Text, CompletionItemKind.Text]);
    });

    it("maps an empty entries list to an empty list", () => {
        expect(toCompletionItems({ entries: [] })).toEqual([]);
    });
});
