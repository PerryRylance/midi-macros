# Improvements

## Serialization

### Download
We need an additional set of controls adjacent to the mm-playback-controls, mm-serialization-controls. It needs a download button.

Pressing this button must put the button into a disabled state whilst the app takes the code in the editor (performance.ts) and the package.json and package-lock.json from the Webcontainer, then initiates the download.

The download button needs to be disabled when NPM is doing work in the container.

### Upload
We need another control that allows the user to upload a ZIP file.

The ZIP file is expected to contain a performance.ts, package.json and package-lock.json. The app must handle unexpected input gracefully and feed back to the user - for example if any files are missing. We don't need to check the integrity of the JSON, npm will handle that in the Webcontainer. We don't need to check the validity of the TS code, tsserver will do that in the Webcontainer.

The playback and serialization controls must be disabled during upload and processing.

When uploading, we need to clear out the container. Your call whether we go through the overhead of re-creating the container, or, just rm rf node_modules and package.json / package-lock.json.

After that we need to unzip the files into our working directory and run `npm install`.

As an aside please could we streaming the init / example a bit here? Instead of explicitly installing `@perry-rylance/midi` and `@perry-rylance/midi-macros` it would be great if we could allow the "npm install on performance loaded" logic to handle this as well as cases where an external file has just been loaded.

## Persistance
After a short period of inactivity in the editor, please can we invoke the save mechanism but rather than downloading to a file please store the compressed data in the users localStorage (or wherever is appropriate).

When they reload, the app needs to check for that zip. If present, it should load it up, which in turn should trigger `npm install` based on what we've already written - putting the user exactly back where they were when they left.

TODO: We need a preloader on the editor while a performance is loading, takes ages to restore.

## Ideas to expand on
- MIDI output
- Block based audio rendering
