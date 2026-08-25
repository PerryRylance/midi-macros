import { describe, expect, it } from "vitest";
import { clearArchive, decodeArchive, encodeArchive, loadArchive, saveArchive } from "../src/persistenceStorage";

function createFakeStorage(): Storage {
    const map = new Map<string, string>();

    return {
        getItem: key => (map.has(key) ? map.get(key)! : null),
        setItem: (key, value) => {
            map.set(key, value);
        },
        removeItem: key => {
            map.delete(key);
        },
        clear: () => map.clear(),
        key: index => Array.from(map.keys())[index] ?? null,
        get length() {
            return map.size;
        }
    } as Storage;
}

describe("encodeArchive / decodeArchive", () => {
    it("round-trips arbitrary bytes, including 0x00 and 0xff", () => {
        const bytes = new Uint8Array([0, 1, 2, 254, 255, 128, 63]);

        const decoded = new Uint8Array(decodeArchive(encodeArchive(bytes.buffer)));

        expect(Array.from(decoded)).toEqual(Array.from(bytes));
    });

    it("round-trips an empty buffer", () => {
        const decoded = new Uint8Array(decodeArchive(encodeArchive(new ArrayBuffer(0))));

        expect(decoded.length).toBe(0);
    });
});

describe("saveArchive / loadArchive / clearArchive", () => {
    it("saves a blob and loads it back as an equivalent ArrayBuffer", async () => {
        const storage = createFakeStorage();
        const bytes = new Uint8Array([10, 20, 30, 40]);
        const blob = new Blob([bytes]);

        await saveArchive(blob, storage);

        const loaded = loadArchive(storage);
        expect(loaded).toBeDefined();
        expect(Array.from(new Uint8Array(loaded!))).toEqual(Array.from(bytes));
    });

    it("returns undefined when nothing has been saved", () => {
        expect(loadArchive(createFakeStorage())).toBeUndefined();
    });

    it("removes the saved archive", async () => {
        const storage = createFakeStorage();
        await saveArchive(new Blob([new Uint8Array([1])]), storage);

        clearArchive(storage);

        expect(loadArchive(storage)).toBeUndefined();
    });
});
