export interface TsServerQuickInfo {
    start: { line: number; offset: number };
    end: { line: number; offset: number };
    displayString: string;
    documentation?: { text: string }[];
    tags?: { name: string; text?: { text: string }[] }[];
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

function joinParts(parts: { text: string }[] | undefined): string {
    return (parts ?? []).map(part => part.text).join("");
}

export function toHoverContent(info: TsServerQuickInfo): HoverContent {
    const contents = [{ value: `\`\`\`typescript\n${info.displayString}\n\`\`\`` }];

    const documentation = joinParts(info.documentation);

    if (documentation) contents.push({ value: documentation });

    for (const tag of info.tags ?? []) {
        const tagText = joinParts(tag.text);

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
