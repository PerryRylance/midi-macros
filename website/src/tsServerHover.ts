export type TsServerSymbolDisplayParts = string | { text: string }[];

export interface TsServerQuickInfo {
    start: { line: number; offset: number };
    end: { line: number; offset: number };
    displayString: string;
    // tsserver's plain `quickinfo` command (as opposed to `quickinfo-full`)
    // returns these as flattened strings, not SymbolDisplayPart arrays,
    // unless `displayPartsForJSDoc` is requested - see TypeScript's own
    // protocol.d.ts (`documentation: string | SymbolDisplayPart[]`).
    documentation?: TsServerSymbolDisplayParts;
    tags?: { name: string; text?: TsServerSymbolDisplayParts }[];
}

export interface HoverRange {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}

export interface HoverContent {
    range: HoverRange;
    contents: { value: string }[];
}

function flattenParts(parts: TsServerSymbolDisplayParts | undefined): string {
    if (parts === undefined) return "";
    if (typeof parts === "string") return parts;

    return parts.map(part => part.text).join("");
}

export function toHoverContent(info: TsServerQuickInfo): HoverContent {
    const contents = [{ value: `\`\`\`typescript\n${info.displayString}\n\`\`\`` }];

    const documentation = flattenParts(info.documentation);

    if (documentation) contents.push({ value: documentation });

    for (const tag of info.tags ?? []) {
        const tagText = flattenParts(tag.text);

        contents.push({ value: `*@${tag.name}*${tagText ? ` ${tagText}` : ""}` });
    }

    return {
        range: {
            startLineNumber: info.start.line,
            startColumn: info.start.offset,
            endLineNumber: info.end.line,
            endColumn: info.end.offset
        },
        contents
    };
}
