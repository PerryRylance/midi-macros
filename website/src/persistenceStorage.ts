const STORAGE_KEY = "mm-saved-performance";

// btoa/atob work on binary strings, not raw bytes - this is the standard
// (if verbose) way to bridge an ArrayBuffer to one, byte by byte. Archives
// are small (a single performance.ts + package.json + package-lock.json,
// compressed), so the per-byte loop is negligible.
export function encodeArchive(buffer: ArrayBuffer): string {
    let binary = "";

    for (const byte of new Uint8Array(buffer)) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}

export function decodeArchive(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
}

// `storage` defaults to the real localStorage, but is overridable so this
// stays unit-testable in Node (which has no `localStorage` global) - the
// default expression is only evaluated if a caller omits the argument.
export async function saveArchive(archive: Blob, storage: Storage = localStorage): Promise<void> {
    const buffer = await archive.arrayBuffer();

    storage.setItem(STORAGE_KEY, encodeArchive(buffer));
}

// A plain existence check, deliberately not decoding - lets a caller decide
// whether there's anything to restore before committing to the "restoring…"
// UI state, without risking decodeArchive's atob() throwing here too.
export function hasSavedArchive(storage: Storage = localStorage): boolean {
    return storage.getItem(STORAGE_KEY) !== null;
}

export function loadArchive(storage: Storage = localStorage): ArrayBuffer | undefined {
    const encoded = storage.getItem(STORAGE_KEY);

    return encoded === null ? undefined : decodeArchive(encoded);
}

export function clearArchive(storage: Storage = localStorage): void {
    storage.removeItem(STORAGE_KEY);
}
