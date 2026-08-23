// Mirrors monaco.languages.CompletionItemKind's numeric values without
// depending on monaco-editor itself, so this pure translation logic can be
// unit tested under Vitest's Node environment (monaco-editor is browser-oriented).
export const CompletionItemKind = {
    Method: 0,
    Function: 1,
    Constructor: 2,
    Field: 3,
    Variable: 4,
    Class: 5,
    Struct: 6,
    Interface: 7,
    Module: 8,
    Property: 9,
    Event: 10,
    Operator: 11,
    Unit: 12,
    Value: 13,
    Constant: 14,
    Enum: 15,
    EnumMember: 16,
    Keyword: 17,
    Text: 18,
    Color: 19,
    File: 20,
    Reference: 21,
    Customcolor: 22,
    Folder: 23,
    TypeParameter: 24,
    User: 25,
    Issue: 26,
    Snippet: 27
} as const;

export interface TsServerCompletionEntry {
    name: string;
    kind: string;
    kindModifiers?: string;
    sortText: string;
    insertText?: string;
    // Set for auto-import candidates (a symbol not yet imported, e.g. "Track"
    // from "@perry-rylance/midi") - `hasAction` flags that accepting this
    // entry needs an additional edit, `source`/`data` identify exactly which
    // declaration for a follow-up `completionEntryDetails` request.
    hasAction?: boolean;
    source?: string;
    data?: unknown;
}

export interface TsServerCompletionInfo {
    entries: TsServerCompletionEntry[];
}

export interface CompletionItemData {
    label: string;
    kind: number;
    insertText: string;
    sortText: string;
    hasAction?: boolean;
    source?: string;
    data?: unknown;
    // The npm package an auto-import candidate would be imported from (e.g.
    // "@perry-rylance/midi"), for disambiguating same-named suggestions -
    // shown right in the completion list, VS Code-style, without needing to
    // resolve the item first.
    sourcePackage?: string;
}

export interface TsServerCodeEditLocation {
    line: number;
    offset: number;
}

export interface TsServerCodeEdit {
    start: TsServerCodeEditLocation;
    end: TsServerCodeEditLocation;
    newText: string;
}

export interface TsServerFileCodeEdits {
    fileName: string;
    textChanges: TsServerCodeEdit[];
}

export interface TsServerCodeAction {
    description: string;
    changes: TsServerFileCodeEdits[];
}

export interface TsServerCompletionEntryDetails {
    name: string;
    codeActions?: TsServerCodeAction[];
}

export interface EditRange {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}

export interface TextEditData {
    range: EditRange;
    text: string;
}

// tsserver's ScriptElementKind string constants (see typescript's own
// ScriptElementKind enum) mapped onto Monaco's closest equivalent.
const KIND_BY_SCRIPT_ELEMENT_KIND: Record<string, number> = {
    keyword: CompletionItemKind.Keyword,
    script: CompletionItemKind.File,
    module: CompletionItemKind.Module,
    class: CompletionItemKind.Class,
    "local class": CompletionItemKind.Class,
    interface: CompletionItemKind.Interface,
    type: CompletionItemKind.Interface,
    enum: CompletionItemKind.Enum,
    "enum member": CompletionItemKind.EnumMember,
    var: CompletionItemKind.Variable,
    "local var": CompletionItemKind.Variable,
    using: CompletionItemKind.Variable,
    "await using": CompletionItemKind.Variable,
    function: CompletionItemKind.Function,
    "local function": CompletionItemKind.Function,
    method: CompletionItemKind.Method,
    getter: CompletionItemKind.Property,
    setter: CompletionItemKind.Property,
    property: CompletionItemKind.Property,
    accessor: CompletionItemKind.Property,
    constructor: CompletionItemKind.Constructor,
    call: CompletionItemKind.Method,
    index: CompletionItemKind.Method,
    construct: CompletionItemKind.Constructor,
    parameter: CompletionItemKind.Variable,
    "type parameter": CompletionItemKind.TypeParameter,
    "primitive type": CompletionItemKind.Keyword,
    alias: CompletionItemKind.Reference,
    const: CompletionItemKind.Constant,
    let: CompletionItemKind.Variable,
    directory: CompletionItemKind.Folder,
    "external module name": CompletionItemKind.Module,
    "JSX attribute": CompletionItemKind.Property,
    string: CompletionItemKind.Value
};

function kindFor(tsKind: string): number {
    return KIND_BY_SCRIPT_ELEMENT_KIND[tsKind] ?? CompletionItemKind.Text;
}

// tsserver's entry only gives us a raw filesystem path to the declaration
// (e.g. ".../node_modules/@perry-rylance/midi/dist/Track") - the humanized
// module specifier ("@perry-rylance/midi") only shows up later, in
// completionEntryDetails' sourceDisplay. Deriving it from the path directly
// avoids needing that extra round trip just to label every item in the list.
function packageNameFromSource(source: string): string | undefined {
    const segments = source.split("node_modules/");

    if (segments.length < 2) return undefined;

    const afterNodeModules = segments[segments.length - 1] ?? "";
    const match = /^(@[^/]+\/[^/]+|[^/]+)/.exec(afterNodeModules);

    return match?.[1];
}

export function toCompletionItems(info: TsServerCompletionInfo): CompletionItemData[] {
    return info.entries.map(entry => {
        const sourcePackage = entry.source === undefined ? undefined : packageNameFromSource(entry.source);

        return {
            label: entry.name,
            kind: kindFor(entry.kind),
            insertText: entry.insertText ?? entry.name,
            sortText: entry.sortText,
            ...(entry.hasAction ? { hasAction: entry.hasAction } : {}),
            ...(entry.source === undefined ? {} : { source: entry.source }),
            ...(entry.data === undefined ? {} : { data: entry.data }),
            ...(sourcePackage === undefined ? {} : { sourcePackage })
        };
    });
}

export function toAdditionalTextEdits(details: TsServerCompletionEntryDetails, fileName: string): TextEditData[] {
    const edits: TextEditData[] = [];

    for (const action of details.codeActions ?? []) {
        for (const change of action.changes) {
            if (change.fileName !== fileName) continue;

            for (const textChange of change.textChanges) {
                edits.push({
                    range: {
                        startLineNumber: textChange.start.line,
                        startColumn: textChange.start.offset,
                        endLineNumber: textChange.end.line,
                        endColumn: textChange.end.offset
                    },
                    text: textChange.newText
                });
            }
        }
    }

    return edits;
}
