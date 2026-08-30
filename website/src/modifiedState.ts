// Tracks whether the current performance differs from a pristine "New"
// state - not just unsaved edits, but also a performance loaded via upload
// or restored from local storage, since either of those means the "New"
// button would discard something other than the fresh default. Never
// auto-clears itself: only an explicit clearModified() (after a successful
// export, or after "New" has just reset everything back to default) does.
//
// Kept free of any document/DOM dependency (callers wire markModified() up
// to EDITOR_CHANGED_EVENT themselves - see autosave.ts) so this stays plain
// logic, unit-testable in Node - same split as isNpmBusy/onNpmBusyChange in
// webcontainer.ts.
let modified = false;
const listeners = new Set<(modified: boolean) => void>();

export function isModified(): boolean {
    return modified;
}

function setModified(value: boolean): void {
    if (modified === value) return;

    modified = value;

    for (const listener of listeners) listener(modified);
}

export function markModified(): void {
    setModified(true);
}

export function clearModified(): void {
    setModified(false);
}

// Invokes the listener immediately with the current state, then again on
// every subsequent transition - mirrors onNpmBusyChange in webcontainer.ts.
export function onModifiedChange(listener: (modified: boolean) => void): () => void {
    listener(modified);
    listeners.add(listener);

    return () => listeners.delete(listener);
}
