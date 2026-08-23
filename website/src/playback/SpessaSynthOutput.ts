import { Sequencer, WorkletSynthesizer } from "spessasynth_lib";
import type { PlaybackOutput } from "./PlaybackOutput";

const WORKLET_MODULE_URL = "/spessasynth_processor.min.js";

export class SpessaSynthOutput implements PlaybackOutput {
    #context: AudioContext | undefined;
    #synth: WorkletSynthesizer | undefined;
    #sequencer: Sequencer | undefined;
    #currentSoundBankId: string | undefined;

    async #ensureReady(): Promise<{ synth: WorkletSynthesizer; sequencer: Sequencer }> {
        if (!this.#context) {
            this.#context = new AudioContext();
            await this.#context.audioWorklet.addModule(WORKLET_MODULE_URL);

            this.#synth = new WorkletSynthesizer(this.#context);
            this.#synth.connect(this.#context.destination);

            this.#sequencer = new Sequencer(this.#synth);
        }

        // Browsers only allow an AudioContext to run following a user
        // gesture - play()/addSoundBank() are only ever called from a click
        // handler, so this is always in response to one.
        await this.#context.resume();

        return { synth: this.#synth!, sequencer: this.#sequencer! };
    }

    async addSoundBank(id: string, buffer: ArrayBuffer): Promise<void> {
        const { synth } = await this.#ensureReady();

        if (this.#currentSoundBankId === id) return;

        if (this.#currentSoundBankId) {
            await synth.soundBankManager.deleteSoundBank(this.#currentSoundBankId);
        }

        await synth.soundBankManager.addSoundBank(buffer, id);
        this.#currentSoundBankId = id;
    }

    load(midi: ArrayBuffer, fileName: string): void {
        if (!this.#sequencer) throw new Error("Cannot load a MIDI file before a SoundBank has been added.");

        this.#sequencer.loadNewSongList([{ binary: midi, fileName }]);
    }

    play(): void {
        this.#sequencer?.play();
    }

    pause(): void {
        this.#sequencer?.pause();
    }

    stop(): void {
        if (!this.#sequencer) return;

        this.#sequencer.pause();
        this.#sequencer.currentTime = 0;
    }
}
