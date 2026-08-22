export interface TsServerDisplayPart {
    text: string;
}

export interface TsServerSignatureHelpParameter {
    name?: string;
    documentation: TsServerDisplayPart[];
    displayParts: TsServerDisplayPart[];
    isOptional?: boolean;
    isRest?: boolean;
}

export interface TsServerSignatureHelpItem {
    isVariadic?: boolean;
    prefixDisplayParts: TsServerDisplayPart[];
    suffixDisplayParts: TsServerDisplayPart[];
    separatorDisplayParts: TsServerDisplayPart[];
    parameters: TsServerSignatureHelpParameter[];
    documentation: TsServerDisplayPart[];
    tags?: { name: string; text?: string | TsServerDisplayPart[] }[];
}

export interface TsServerSignatureHelpItems {
    items: TsServerSignatureHelpItem[];
    selectedItemIndex: number;
    argumentIndex: number;
}

export interface SignatureParameterInfo {
    label: [number, number];
    documentation?: string;
}

export interface SignatureInfo {
    label: string;
    documentation?: string;
    parameters: SignatureParameterInfo[];
}

export interface SignatureHelpResult {
    signatures: SignatureInfo[];
    activeSignature: number;
    activeParameter: number;
}

function flatten(parts: TsServerDisplayPart[] | undefined): string {
    return (parts ?? []).map(part => part.text).join("");
}

function buildSignature(item: TsServerSignatureHelpItem): SignatureInfo {
    const separator = flatten(item.separatorDisplayParts);

    let label = flatten(item.prefixDisplayParts);
    const parameters: SignatureParameterInfo[] = [];

    item.parameters.forEach((parameter, index) => {
        if (index > 0) label += separator;

        const start = label.length;

        label += flatten(parameter.displayParts);

        const documentation = flatten(parameter.documentation);

        parameters.push({
            label: [start, label.length],
            ...(documentation ? { documentation } : {})
        });
    });

    label += flatten(item.suffixDisplayParts);

    const documentation = flatten(item.documentation);

    return {
        label,
        parameters,
        ...(documentation ? { documentation } : {})
    };
}

export function toSignatureHelp(info: TsServerSignatureHelpItems): SignatureHelpResult {
    return {
        signatures: info.items.map(buildSignature),
        activeSignature: info.selectedItemIndex,
        activeParameter: info.argumentIndex
    };
}
