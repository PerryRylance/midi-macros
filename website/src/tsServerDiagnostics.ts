// Mirrors monaco.MarkerSeverity's numeric values without depending on
// monaco-editor itself, so this pure translation logic can be unit tested
// under Vitest's Node environment (monaco-editor is browser-oriented).
export const MarkerSeverity = {
    Hint: 1,
    Info: 2,
    Warning: 4,
    Error: 8
} as const;

export interface TsServerDiagnosticLocation {
    line: number;
    offset: number;
}

export type TsServerDiagnosticCategory = "error" | "warning" | "suggestion" | "message";

export interface TsServerDiagnostic {
    start: TsServerDiagnosticLocation;
    end: TsServerDiagnosticLocation;
    text: string;
    category: TsServerDiagnosticCategory;
    code?: number;
}

export interface TsServerDiagnosticEventBody {
    file: string;
    diagnostics: TsServerDiagnostic[];
}

export interface MarkerData {
    severity: number;
    message: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    code?: string;
}

function severityFor(category: TsServerDiagnosticCategory): number {
    switch (category) {
        case "error": return MarkerSeverity.Error;
        case "warning": return MarkerSeverity.Warning;
        case "suggestion": return MarkerSeverity.Hint;
        default: return MarkerSeverity.Info;
    }
}

export function toMonacoMarkers(diagnostics: TsServerDiagnostic[]): MarkerData[] {
    return diagnostics.map(diagnostic => ({
        severity: severityFor(diagnostic.category),
        message: diagnostic.text,
        startLineNumber: diagnostic.start.line,
        startColumn: diagnostic.start.offset,
        endLineNumber: diagnostic.end.line,
        endColumn: diagnostic.end.offset,
        ...(diagnostic.code === undefined ? {} : { code: String(diagnostic.code) })
    }));
}
