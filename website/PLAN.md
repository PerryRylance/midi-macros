# Plan
This project is a MIDI library that gives the developer macros for musical composition. It uses `@perry-rylance/midi` which can also be used at a lower level to build musical compositions.

## Rules
- This will be a test driven build, so always start with tests before anything else.
- This must be entirely in-browser.
- Absolutely no styling, use only semantically correct HTML5.
- After completing a step, you must stop for the lead developer to review.
- You are absolutely not allowed to write to source control, read is permissible.
- We don't need to support multiple files, just a single file.

## Technologies
- Vite for serving up locally and building
- Vitest for unit testing
- Playwright for browser testing
- Monaco editor for code
- Web components for the interface
- spessasynth_lib for audio playback

## Components
What we are buildling here is inspired by Strudel's web interface, we need
- A single file code editor (Monaco)
- Playback controls, play, stop and pause is sufficient, seek is not needed at this point
- An export feature that can export either a zip of the TypeScript code and package.json, or the generated MIDI
- A tabbed sidebar which will have
    - A welcome tab for newcomers
    - A library tab with all the users saved projects, where they can load them
    - An audio tab showing the currently used soundfont
    - A reference tab which will hold documentation about `@perry-rylance/midi` and `@perry-rylance/midi-macros` - I will generate this later

## Steps

### Foundations
In the interface, users need to be able to install any package they want from npm, so we are going to need a webcontainer setup.

### IDE
I believe Monaco will provide these, so the tests should be fairly minimal.

- TypeScript evaluator
- TypeScript hinting
- TypeScript compiler

Please get Monaco into the main window with these features ready to go.

- The editor must have a single TS window, no file tabs, no file explorer
- The code in the editor must export a single `File` (from `@perry-rylance/midi`), and show an error if no default export is present

### Side bar
Please build out the side bar as described above, we need a `<select>` with a list of sound fonts. Right now just have a single font, the one in `examples` seems good.

The browser needs to load that from a remote URL on init or change, so be sure to test for that.

### Playback
See the `examples` folder above this `website` folder.

We need this to be a modular design please, so that people can plug use alternative output classes if they so choose.

When the user presses play, we need to:

- Make sure that we've added the selected SoundFont into `addSoundBank`
- Take the default export, use the `File` to get an array buffer of MIDI data then pass that to `loadNewSongList`
- Stop when the user presses stop
- Pause when the user presses pause, and allow them to resume weithout rebuilding the MIDI (if supported by `spessasynth_lib`)

In addition

- These controls should be disabled during SoundFont loading
- These controls should be enabled when the SoundFont completes loading

### Highlighting
We will need to plan this together. I don't think `spessasynth_lib` will tell us which event(s) are currently playing so we will most likely have to ask it for a milliseconds playback time then connect this up to `@perry-rylance/midi-to-milliseconds`.

We will need to them plumb this up to Monaco to link the time-calculated evens to the tokens in the editor for highlighting.

The goal is that during playback, the user can see the MIDI event constructors highlighted.

A secondary goal is highlighting which macros from this library are being used, however that's less important.

### Deployment
This project will be deployed at `midi.macros.website` via CloudFlare pages, please do the preparation.

Ideally our CI / CD script should be able to detect if anything has changed in `website` since the last deploy and only deploy if changes are detected.
