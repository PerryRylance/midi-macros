import { Sequencer, WorkletSynthesizer } from "spessasynth_lib";

const status = document.querySelector<HTMLParagraphElement>("#status")!;
const tracks = document.querySelector<HTMLDivElement>("#tracks")!;

const [manifest, soundBank] = await Promise.all([
    fetch("/manifest.json").then(response => response.json() as Promise<string[]>),
    fetch("/soundfont/TimGM6mb.sf2").then(response => response.arrayBuffer())
]);

const context = new AudioContext();
await context.audioWorklet.addModule("/spessasynth_processor.min.js");

const synth = new WorkletSynthesizer(context);
synth.connect(context.destination);
await synth.soundBankManager.addSoundBank(soundBank, "main");

const sequencer = new Sequencer(synth);

status.textContent = "Ready.";

const stop = document.createElement("button");
stop.textContent = "Stop";
stop.addEventListener("click", () => {
    sequencer.pause();
    sequencer.currentTime = 0;
});
tracks.appendChild(stop);

for (const name of manifest) {
    const button = document.createElement("button");
    button.textContent = name;
    button.addEventListener("click", async () => {
        await context.resume();

        const midi = await fetch(`/midi/${name}.mid`).then(response => response.arrayBuffer());

        sequencer.loadNewSongList([{ binary: midi, fileName: name }]);
        sequencer.play();
    });
    tracks.appendChild(button);
}
