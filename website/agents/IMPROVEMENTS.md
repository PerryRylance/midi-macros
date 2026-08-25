# Improvements

## Serialization

### Download
We need an additional set of controls adjacent to the mm-playback-controls, mm-serialization-controls. It needs a download button.

Pressing this button must put the button into a disabled state whilst the app takes the code in the editor (performance.ts) and the package.json and package-lock.json from the Webcontainer, then initiates the download.

The download button needs to be disabled when NPM is doing work in the container.

### Upload
We need another control that allows the user to upload a ZIP file.

The ZIP file is expected to contain a performance.ts, package.json and package-lock.json. The app must handle unexpected input gracefully and feed back to the user - for example if any files are missing. We don't need to check the integrity of the JSON, npm will handle that in the Webcontainer. We don't need to check the validity of the TS code, tsserver will do that in the Webcontainer.

The playback and serialization controls must be disabled during upload.

When uploading, we need to clear out the container. Your call whether we go through the overhead of re-creating the container, or, just rm rf node_modules and package.json / package-lock.json.

## Persistance

## Ideas to expand on
- MIDI output
- Block based audio rendering
