import ts from "typescript";

export function hasDefaultExport(code: string): boolean {
    const sourceFile = ts.createSourceFile("index.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    let found = false;

    sourceFile.forEachChild(node => {
        if (ts.isExportAssignment(node) && !node.isExportEquals) {
            found = true;
            return;
        }

        if (ts.canHaveModifiers(node)) {
            const modifiers = ts.getModifiers(node) ?? [];
            const isExport = modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
            const isDefault = modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword);

            if (isExport && isDefault) {
                found = true;
            }
        }
    });

    return found;
}
