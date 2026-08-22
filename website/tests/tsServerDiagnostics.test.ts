import { describe, expect, it } from "vitest";
import { MarkerSeverity, toMonacoMarkers } from "../src/tsServerDiagnostics";

describe("toMonacoMarkers", () => {
    it("maps an \"error\" category diagnostic to Error severity", () => {
        const markers = toMonacoMarkers([
            {
                start: { line: 2, offset: 7 },
                end: { line: 2, offset: 13 },
                text: "Type 'string' is not assignable to type 'number'.",
                category: "error",
                code: 2322
            }
        ]);

        expect(markers).toEqual([
            {
                severity: MarkerSeverity.Error,
                message: "Type 'string' is not assignable to type 'number'.",
                startLineNumber: 2,
                startColumn: 7,
                endLineNumber: 2,
                endColumn: 13,
                code: "2322"
            }
        ]);
    });

    it("maps \"warning\" and \"suggestion\" categories to their own severities", () => {
        const markers = toMonacoMarkers([
            { start: { line: 1, offset: 1 }, end: { line: 1, offset: 2 }, text: "warn", category: "warning" },
            { start: { line: 1, offset: 1 }, end: { line: 1, offset: 2 }, text: "hint", category: "suggestion" }
        ]);

        expect(markers.map(marker => marker.severity)).toEqual([MarkerSeverity.Warning, MarkerSeverity.Hint]);
    });

    it("omits the code field entirely when the diagnostic has no code", () => {
        const [marker] = toMonacoMarkers([
            { start: { line: 1, offset: 1 }, end: { line: 1, offset: 2 }, text: "oops", category: "error" }
        ]);

        expect(marker).not.toHaveProperty("code");
    });

    it("maps an empty list to an empty list", () => {
        expect(toMonacoMarkers([])).toEqual([]);
    });
});
