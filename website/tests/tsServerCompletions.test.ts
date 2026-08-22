import { describe, expect, it } from "vitest";
import { CompletionItemKind, toAdditionalTextEdits, toCompletionItems } from "../src/tsServerCompletions";

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

    // Auto-import candidates ("Track" from @perry-rylance/midi when only
    // "File" is imported) are flagged by tsserver with hasAction/source/data
    // - carried through so mm-editor.ts can request the actual import edit
    // lazily via completionEntryDetails only once the item is highlighted.
    it("carries hasAction/source/data through for auto-import candidates", () => {
        const items = toCompletionItems({
            entries: [{
                name: "Track",
                kind: "class",
                sortText: "16",
                hasAction: true,
                source: "/home/workspace/node_modules/@perry-rylance/midi/dist/Track",
                data: { exportName: "default", exportMapKey: "5 1942 Track ", fileName: "/home/workspace/node_modules/@perry-rylance/midi/dist/Track.d.ts" }
            }]
        });

        expect(items[0]).toMatchObject({
            label: "Track",
            hasAction: true,
            source: "/home/workspace/node_modules/@perry-rylance/midi/dist/Track",
            data: { exportName: "default", exportMapKey: "5 1942 Track ", fileName: "/home/workspace/node_modules/@perry-rylance/midi/dist/Track.d.ts" }
        });
    });

    it("omits hasAction/source/data entirely for ordinary entries", () => {
        const [item] = toCompletionItems({ entries: [{ name: "tracks", kind: "getter", sortText: "11" }] });

        expect(item).not.toHaveProperty("hasAction");
        expect(item).not.toHaveProperty("source");
        expect(item).not.toHaveProperty("data");
    });
});

describe("toAdditionalTextEdits", () => {
    it("converts a code action's text changes for the target file into edit ranges", () => {
        const edits = toAdditionalTextEdits(
            {
                name: "Track",
                codeActions: [
                    {
                        description: "Update import from \"@perry-rylance/midi\"",
                        changes: [
                            {
                                fileName: "/home/workspace/index.ts",
                                textChanges: [
                                    { start: { line: 1, offset: 14 }, end: { line: 1, offset: 14 }, newText: ", Track" }
                                ]
                            }
                        ]
                    }
                ]
            },
            "/home/workspace/index.ts"
        );

        expect(edits).toEqual([
            { range: { startLineNumber: 1, startColumn: 14, endLineNumber: 1, endColumn: 14 }, text: ", Track" }
        ]);
    });

    it("ignores changes targeting a different file", () => {
        const edits = toAdditionalTextEdits(
            {
                name: "Track",
                codeActions: [
                    { description: "irrelevant", changes: [{ fileName: "/home/workspace/other.ts", textChanges: [{ start: { line: 1, offset: 1 }, end: { line: 1, offset: 1 }, newText: "x" }] }] }
                ]
            },
            "/home/workspace/index.ts"
        );

        expect(edits).toEqual([]);
    });

    it("flattens multiple code actions and text changes into one list", () => {
        const edits = toAdditionalTextEdits(
            {
                name: "Track",
                codeActions: [
                    { description: "a", changes: [{ fileName: "/home/workspace/index.ts", textChanges: [{ start: { line: 1, offset: 1 }, end: { line: 1, offset: 1 }, newText: "import a;\n" }] }] },
                    { description: "b", changes: [{ fileName: "/home/workspace/index.ts", textChanges: [{ start: { line: 2, offset: 1 }, end: { line: 2, offset: 1 }, newText: "import b;\n" }] }] }
                ]
            },
            "/home/workspace/index.ts"
        );

        expect(edits).toHaveLength(2);
        expect(edits.map(edit => edit.text)).toEqual(["import a;\n", "import b;\n"]);
    });

    it("returns an empty list when there are no code actions", () => {
        expect(toAdditionalTextEdits({ name: "x" }, "/home/workspace/index.ts")).toEqual([]);
    });
});
