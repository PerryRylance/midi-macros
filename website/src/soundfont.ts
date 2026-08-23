export interface SoundFontOption {
    name: string;
    url: string;
}

// Only one SoundFont for now - the one already used in examples/.
export const SOUND_FONTS: readonly SoundFontOption[] = [
    { name: "TimGM6mb", url: "/soundfont/TimGM6mb.sf2" }
];

export async function loadSoundfont(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to load SoundFont "${url}": ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
}
