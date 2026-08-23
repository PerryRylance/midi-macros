import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSoundfont, SOUND_FONTS } from "../src/soundfont";

describe("SOUND_FONTS", () => {
    it("lists at least one available SoundFont with a name and URL", () => {
        expect(SOUND_FONTS.length).toBeGreaterThan(0);

        for (const font of SOUND_FONTS) {
            expect(typeof font.name).toBe("string");
            expect(font.name.length).toBeGreaterThan(0);
            expect(typeof font.url).toBe("string");
            expect(font.url.length).toBeGreaterThan(0);
        }
    });
});

describe("loadSoundfont", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("fetches the given URL and resolves with its array buffer", async () => {
        const buffer = new ArrayBuffer(4);
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(buffer) });

        vi.stubGlobal("fetch", fetchMock);

        const result = await loadSoundfont("/soundfont/TimGM6mb.sf2");

        expect(fetchMock).toHaveBeenCalledWith("/soundfont/TimGM6mb.sf2");
        expect(result).toBe(buffer);
    });

    it("throws a descriptive error when the response is not ok", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" }));

        await expect(loadSoundfont("/soundfont/missing.sf2")).rejects.toThrow(/404/);
    });

    it("propagates a network failure instead of swallowing it", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

        await expect(loadSoundfont("/soundfont/TimGM6mb.sf2")).rejects.toThrow("network down");
    });
});
