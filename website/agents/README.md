# Readme
This project is a MIDI library that gives the developer macros for musical composition. It uses `@perry-rylance/midi` which can also be used at a lower level to build musical compositions.

## Rules
- This will be a test driven build, so always start with tests before anything else.
- This must be entirely in-browser.
- Absolutely no styling, use only semantically correct HTML5.
- After completing a step, you must stop for the lead developer to review.

## Technologies
- Vite for serving up locally and building
- Vitest for unit testing
- Playwright for browser testing
- Monaco editor for code
- Web components for the interface
- spessasynth_lib for audio playback

## Features
- A built in TypeScript IDE
- SoundFont selection
- Audio playback
- Playback highlighting

### Deployment
This project will be deployed at `midi.macros.website` via CloudFlare pages, please do the preparation.

Ideally our CI / CD script should be able to detect if anything has changed in `website` since the last deploy and only deploy if changes are detected.
