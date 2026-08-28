# Polish

## Editable title
- Add an "edit" icon next to the <h1>.
- When clicked, the h1 becomes a text input temporarily
- On input, we update the hidden h1's text with the value
- On input, we persist the value in local storage as "title"
- On input, we modify the title of the window with the value
- When it loses focus, it turns back into a h1
- On export, we use this to name the ZIP file
- On import, we populate this with the ZIP file's filename

## Include MIDI in ZIP
- When exporting, also generate a fresh MIDI from the performance and include it in the zip file as generated.mid
! When generation fails, still export but without MIDI file

## Load from URL
- Update the import to open a dialog, same pattern as the package manager
- The dialog will have a file input for loading from disk
- The dialog will have a text input, type URL, for loading from URL - if you need the lead developer to generate a fixture please let me know

## Terminal
! Can we enable ANSI colours?
