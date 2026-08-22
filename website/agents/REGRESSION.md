# Regression: mounting `<mm-editor>` breaks later terminal/package-list updates

**Status:** Open, unresolved. Front-end behaves correctly for a real user in manual
testing - this only shows up as two failing Playwright tests so far. Logged here to
revisit rather than continuing to sink time into it now.

**Not to be confused with:** a separate, much more serious, still-open bug where
the language server's `initialize` request never gets a response at all - see
the second section of this document, below. *This first section* is specifically
about the Monaco/xterm terminal-rendering interaction.

## Symptom

Two pre-existing Foundations-step e2e tests (`e2e/foundations.spec.ts`) fail only
once `<mm-editor>` (Monaco) is present on the page:

- `shows an error for an invalid package name` - `#terminal` never receives the
  echoed command or the validation error message.
- `disables remove buttons while the terminal is busy` - after a *second* install
  completes, the previously-rendered `<li>` for the first package (and its Remove
  button) is no longer found in `#package-list`.

Both failures share a shape: the **first** UI update after page load works fine
(default-deps install shows in the terminal, first package install/remove works),
but a **later** update to the same kind of UI silently fails to render, even though
the underlying application logic ran correctly.

## Confirmed via direct instrumentation

- `#status` text updates correctly in all cases (e.g. becomes `"Error."` as
  expected) - the JS logic (validation, event dispatch) is not the problem.
- `dispatchTerminalOutput` **is** called with the correct string content (verified
  by logging inside `mm-package-manager.ts`'s `#handleSubmit`).
- `mm-terminal`'s `document.addEventListener` handler **does** receive the event
  and **does** call `terminal.write(...)` with the correct content (verified by
  logging inside `mm-terminal.ts`).
- Inspecting `#terminal .xterm-rows` directly (not just `.innerText()`) confirms
  the DOM genuinely has no trace of the new content - it's not a scroll/viewport
  visibility issue, the rows are just empty.
- A **60-second, 123-attempt** Playwright retry (`expect(...).toContainText(...,
  { timeout: 60_000 })`) returns byte-for-byte identical stale content on every
  single poll. This is not a slow/eventually-consistent update - it never happens.

## Ruled out

- **Async/microtask timing** - not just a "next tick" issue; a full 60s of wall
  clock retries never resolves it.
- **xterm write-queue batching** - tried coalescing rapid `terminal.write()` calls
  into a single call via a `setTimeout(…, 0)` buffer in `mm-terminal.ts` (this
  change is still in place, see `#onOutput`/`#pending`/`#flushTimer`). No effect
  on this bug, though it's a reasonable practice to keep regardless (npm's ANSI
  spinner redraw sequence produces ~40 tiny writes per install; batching in
  `mm-terminal.ts` reduces call volume to xterm as generally-good practice).
- **The LSP client/connection specifically** - reproduces identically with
  `#connectLanguageServer()` commented out entirely in `mm-editor.ts`. Simply
  calling `monaco.editor.create()` is sufficient to trigger it; no language
  server, no WebContainer LSP traffic required.
- **Worker loading failures** - checked network requests for the copied
  `public/dist/workers/editorWorker-*.js` files; no 404s, no `requestfailed`
  events related to workers.
- **CPU contention / main-thread starvation** - the 60s/123-poll result rules
  this out; if it were just slow, it would eventually succeed.
- **Terminal-output-piping "pollution"** - originally suspected that
  `startLanguageServer`'s own `npm install typescript typescript-language-server`
  output was interleaving with the package-manager's terminal output (since both
  used `dispatchTerminalOutput` and run concurrently on page load). Removed that
  piping entirely (`languageServer.ts` no longer takes an `onOutput` callback) -
  the bug persisted unchanged, so this was not the (sole) cause, though it was a
  legitimate independent cleanup worth keeping (LSP install noise doesn't belong
  in the user-facing terminal anyway).

## Open lead, not chased down

Manually-scripted single-shot repros (`chromium.launch()` + one `page.goto()`,
run directly with `node`, outside the Playwright test runner) **never** show the
`"gggggggggggggggggggggggggggggggg"` garbage string that appears prepended to
`#terminal`'s content specifically when reproduced *via `npx playwright test`*.
This suggests there may be two distinct things tangled together:

1. The core bug (Monaco mounted -> later writes to unrelated DOM/xterm content
   don't render) - reproduces even in a single clean browser launch, so this is
   the one to focus on.
2. A separate, so-far-unconfirmed cross-test state leak specific to the
   Playwright test runner's browser/context reuse model (`workers: 1` was set in
   `playwright.config.ts` to rule out concurrent-boot interference between
   parallel tests, which didn't fix it, but sequential tests within the same
   worker may still share browser-process-level state such as a Service Worker
   registration for the WebContainer preview mechanism - untested).

## Suggested next steps for whoever picks this up

- Build a minimal repro with **just** `@xterm/xterm` + `monaco-editor` on a bare
  page (no WebContainer, no custom elements, no language client) to confirm
  whether this is a pure Monaco+xterm interaction bug, independent of everything
  else in this app.
- If confirmed, check whether it's a known xterm.js issue (canvas/DOM renderer
  contention, shared measurement canvas, a global event listener Monaco installs)
  - search the xterm.js and monaco-editor issue trackers for "xterm" + "monaco"
    interaction reports.
- If it can't be resolved, consider replacing the terminal's rendering with
  something simpler that doesn't compete with Monaco for whatever resource is
  contended (e.g. a plain `<pre>`/`<ol>` log rather than a full xterm.js
  terminal emulator). `mm-terminal.ts` already sets `disableStdin: true` - we
  only use xterm.js to append and display plain npm output text, never its
  keyboard-input/cursor-control features - so a full terminal emulator is more
  machinery than this feature actually needs, and a simpler read-only log
  element would serve the same purpose.

## Where things stand (as of the fixes below)

- `e2e/foundations.spec.ts`'s `shows an error for an invalid package name` and
  `disables remove buttons while the terminal is busy` tests are currently
  failing on `dev` because of this regression. Everything else passes.
- Manually verified in a real browser that the app is usable end-to-end despite
  the failing tests - the underlying package install/remove/validation logic is
  all correct, this is specifically about the terminal/list not visually
  reflecting a *second* round of updates once Monaco has been mounted for a
  while.

---

# Regression: the language server's `initialize` request never gets a response

**Status:** RESOLVED - by dropping `typescript-language-server` entirely, not
by fixing it. See "Resolution" at the end of this section for what changed and
why. The investigation history below is kept for context/precedent, in case a
similar issue resurfaces with some other WebContainer-hosted tool.

## How this was discovered

The user reported: after the echo-cancellation fix (previous finding, now
superseded - see "Corrected understanding" below), initialization looked clean,
but typing into the editor produced zero chatter and no squigglies, ever - not
even for plain syntax errors.

## Corrected understanding: the earlier "it works" claim was a false positive

Every e2e test that asserted `.squiggly-error` count used editor content like
`const x: number = "oops";` - **which has no `export default`**. `mm-editor.ts`
runs its own `hasDefaultExport()` check independently of the language server and
sets an error-severity marker via `monaco.editor.setModelMarkers(model,
"midi-macros-default-export", ...)` whenever a default export is missing. Monaco
renders **any** error-severity marker with the same `.squiggly-error` CSS class
regardless of which "owner" set it - the class doesn't distinguish our own
client-side check from a real LSP diagnostic. So `shows a real diagnostic from
the TypeScript language server` was passing because of our OWN unrelated check,
not because the language server ever responded. This test has been corrected
(content now keeps a valid default export, so our own check can't produce a
false positive) and marked `test.fail(...)` in `e2e/ide.spec.ts`, since it now
correctly demonstrates the real bug: it fails, as expected, until the underlying
issue below is fixed. When it starts unexpectedly passing, that's the signal the
language server is genuinely working.

## What's confirmed, with hard evidence

Using a `window.__lspLog` array (not console output - Playwright's console
capture is not reliable evidence, see the false lead below) to record every
message in and out of `lspTransport.ts`, and later a **completely isolated
repro with zero app code involved** (a bare HTML page, `@webcontainer/api`
directly, `container.spawn("node", ["node_modules/typescript-language-server/lib/cli.mjs",
"--stdio"])`, one hand-written `initialize` request written directly to
`proc.input`):

- The `initialize` request is sent correctly.
- WebContainer's pseudo-terminal echoes it back (confirmed content-identical,
  see the echo-cancellation fix below) - this is filtered out correctly.
- **After that, literally nothing else ever arrives.** Not the real `initialize`
  response, not an error, nothing - confirmed over waits as long as 120 seconds,
  and confirmed identically in the fully-isolated raw repro with no Monaco, no
  monaco-languageclient, no custom transport code at all involved.
- `proc.exit` never resolves during the observation window (`exit: pending`) -
  the process is alive, not crashed. It is fully silent.
- This contradicts an earlier standalone verification (done before any of this
  website's WebContainer code existed, using a real `child_process.spawn`
  outside WebContainer) where this exact same `typescript-language-server`
  version immediately emitted an unsolicited `window/logMessage` notification
  announcing the TypeScript version, before even receiving a request. That
  never happens inside WebContainer.

## Two real, valid fixes were found and kept along the way (neither was the root cause)

1. **PTY echo corrupting message framing** - WebContainer attaches a
   pseudo-terminal to every spawned process, which echoes stdin writes back
   into the process's own stdout, and that echo can arrive with an extra
   `\r\n\r\n` spliced in right after the header (cause unknown). Fixed with two
   layers: `src/lspFraming.ts`'s `LspMessageBuffer` now tolerates repeated
   separators, and `src/sentMessageTracker.ts` drops any successfully-parsed
   message that content-matches something we just sent. Both are real,
   verified fixes (10 + 6 passing unit tests) and should stay.
2. **Wrong virtual file path** - the Monaco model used `file:///workspace/index.ts`,
   but WebContainer's real working directory is `/home/<random-or-explicit-workdirName>`,
   never `/workspace`. Fixed by booting with an explicit `workdirName: "workspace"`
   (giving a predictable `/home/workspace`) and updating `MODEL_URI` in
   `mm-editor.ts` to match. Confirmed correct (`container.workdir` really does
   equal `/home/workspace` after this change), and needed regardless for module
   resolution to ever work - but did **not** fix the silence, since the
   language server never even responds to `initialize`, before any document or
   import is involved.
3. **`npx` replaced with direct `node` invocation** - `startLanguageServer` now
   spawns `node node_modules/typescript-language-server/lib/cli.mjs --stdio`
   directly rather than through `npx`, removing `npx`'s own resolution/update-
   check overhead. A reasonable simplification, but also did not fix the
   silence - the raw isolated repro above uses this exact same direct-node
   invocation and is still completely silent.

## Nested-child-process hypothesis: refuted

The original leading hypothesis was that WebContainer's process model doesn't
support a process spawning its own nested children (`typescript-language-server`
forks Microsoft's `tsserver.js` internally and proxies to it). This has now been
directly tested and **refuted** by three independent isolated repros (bare HTML
page + `@webcontainer/api` directly, zero app code, run under Playwright):

1. **Nested `spawn`/`fork` works in general.** A trivial WebContainer-spawned
   outer script that itself calls `child_process.spawn` and `child_process.fork`
   (including sending an IPC message via `process.send`/`'message'`) completes
   correctly - both children run, their output arrives, IPC messages are
   delivered.
2. **`tsserver.js` itself works perfectly when driven directly.** Spawning
   `node node_modules/typescript/lib/tsserver.js` at the top level and writing
   a newline-delimited native-protocol `status` request gets a correct,
   immediate response (`{"event":"typingsInstallerPid",...}` followed by the
   real status response with the version number).
3. **The *exact* fork configuration `typescript-language-server` uses also
   works.** `typescript-language-server` (for TypeScript >= 4.9, which 5.9.3
   satisfies) forks `tsserver.js` with `--useNodeIpc`, a patched `env`
   (`NODE_PATH` pointed at the module root), and
   `stdio: ['pipe','pipe','pipe','ipc']` - talking to it over Node's IPC
   channel (`process.send`/`'message'`), not plain stdio. Replicating this
   *precise* configuration by hand (same flag, same env patch, same stdio
   array) from a WebContainer-spawned outer script and sending a `status`
   request via `child.send(...)` got a correct IPC response back immediately.

So: nested spawning, `tsserver.js` itself, and the specific IPC transport
`typescript-language-server` relies on internally are all **confirmed working**
inside WebContainer. The fault is not in any of that machinery.

## Narrowed further: the fault is in `typescript-language-server`'s own process, before it ever reaches its internal fork

With the nested-spawn path cleared, the isolated raw repro (top-level
`container.spawn("node", [".../typescript-language-server/lib/cli.mjs",
"--stdio"])`, one hand-written LSP `initialize` request) was re-run with two
further tests, both negative:

- **Maximum internal verbosity (`--log-level 4`).** `typescript-language-server`
  redirects its own `console.log`/`console.error` through an internal logger
  that emits LSP `window/logMessage` notifications over the same stdout
  channel used for real protocol traffic - so if the process reaches its own
  startup/connection code at all, *something* should appear on `proc.output`
  even before our `initialize` request is fully handled. With `--log-level 4`
  set, across a 60-second wait, the **only** thing ever received on `proc.output`
  was the single PTY echo of our own outgoing write - zero server-side log
  lines, zero real protocol messages, nothing.
- **Trailing-newline PTY-flush theory.** WebContainer's `input` stream is
  explicitly documented as "an input stream for the attached pseudoterminal
  device" (there is no way to request a plain, non-PTY stdin via the public
  `SpawnOptions` API). A plausible theory: a PTY in canonical/line-buffered
  mode might hold input in its line buffer until a terminating `\n`, and
  LSP's Content-Length framing has no trailing newline on the message body
  (unlike tsserver's own native protocol, which is newline-delimited and
  which is *why* the direct-tsserver test above happened to work). Appending
  a diagnostic trailing `\n` after the framed message (invalid per the real
  LSP spec, but harmless to test with) made no difference whatsoever - still
  only the echo, still zero response. This theory is refuted.

**Conclusion:** the failure is isolated specifically to `typescript-language-server`'s
own process - something in its startup path (before or instead of reaching
`connection.listen()`/its logger setup) is either never running or hanging,
under WebContainer specifically, independent of the underlying spawn/fork/IPC
mechanisms, all of which have now been proven sound in this environment. The
exact internal reason (something PTY-related that's more specific than simple
line-buffering, an early exception being swallowed, a startup check like
`process.stdin.isTTY` sending it down an incompatible code path, or something
else in its ~23,000-line bundled `cli.mjs`) has not been pinned down further.

## False lead worth remembering

Console-log-based debugging looked like it showed "only 3 messages ever, even
in the passing case" - which briefly suggested Playwright's console capture
was dropping messages under volume. It wasn't dropping anything: the passing
case's squiggly came entirely from our own default-export check (see above),
and there really were only 3 real messages. Don't waste time re-suspecting
console-capture reliability; the `window.__lspLog` array-based approach is the
trustworthy one and should be used for any further investigation here.

## Resolution: dropped `typescript-language-server`, talk to `tsserver.js` directly

Given `tsserver.js` itself was proven 100% reliable inside WebContainer over
two different transports, while `typescript-language-server`'s own wrapper
process was conclusively broken for reasons specific to itself, continuing to
debug a ~23,000-line minified third-party bundle had a poor
odds-of-success-to-effort ratio. Per the lead developer's decision, the LSP
wrapper (and `monaco-languageclient` along with it) has been removed entirely
in favour of driving `tsserver.js`'s own native protocol directly:

- **`src/tsServer.ts`** (replaces `src/languageServer.ts`) - installs only
  `typescript@5.9.3` and spawns `node node_modules/typescript/lib/tsserver.js`
  directly, no wrapper involved.
- **`src/tsServerProtocol.ts`** (replaces `src/lspFraming.ts`) - tsserver's
  wire format is newline-delimited JSON, not LSP's Content-Length framing, so
  this is a plain line-buffering parser instead. Fully unit tested.
- **`src/tsServerClient.ts`** (replaces `src/lspTransport.ts`) - spawns the
  process and exposes a small `sendCommand`/`onEvent`/`onError`/`onClose` API
  instead of the `monaco-languageclient`-shaped reader/writer. Reuses
  `echoFilter.ts` and `sentMessageTracker.ts` unchanged - both were already
  generic, not LSP-specific. Fully unit tested with a fake `WebContainerProcess`.
- **`src/tsServerDiagnostics.ts`** - pure translation from tsserver's
  `{start,end,text,category}` diagnostic shape into Monaco marker data
  (`monaco.MarkerSeverity`'s numeric values are duplicated locally so this
  stays unit-testable under Vitest's Node environment without importing the
  browser-oriented `monaco-editor` package). Fully unit tested.
- **`mm-editor.ts`** now: on connect, sends an `open` command with the
  model's current content, then `geterr` to request diagnostics. On every
  edit (debounced 300ms), it re-sends `open` with the new full content
  (tsserver treats `open` on an already-open file as a full content
  replacement, so no incremental change-range tracking is needed) followed
  by another `geterr`. Incoming `syntaxDiag`/`semanticDiag`/`suggestionDiag`
  events are translated via `toMonacoMarkers` and applied via
  `monaco.editor.setModelMarkers`, each under its own owner name so the three
  categories don't clobber each other.
- `vite.config.ts`'s `vscode` alias and the `monaco-languageclient`/`tslib`
  dependencies have been removed - nothing in the new architecture needs them.

**Verified working in isolation:** running only `e2e/ide.spec.ts`, its `shows
a real diagnostic from tsserver` test (previously `test.fail(...)`'d as
permanently-known-broken) now passes for real, twice in a row - a genuine
`const x: number = "oops"` type error surfaces as a `.squiggly-error` via a
live round trip through tsserver, not a false positive from the unrelated
default-export check.

**Not yet reliable when run after `foundations.spec.ts` in the same suite -
see the next section.** This is a newly-discovered, separate problem, not a
sign the direct-tsserver approach itself is unsound.

## New problem found during verification: cross-test WebContainer session sharing breaks tsserver

**Status:** Open, not yet fixed.

Running `npx playwright test` (both spec files, one worker, in their default
order - `foundations.spec.ts` before `ide.spec.ts`) reproduced two failures:

1. The already-documented, pre-existing Monaco/xterm regression (first
   section of this document) - unrelated, unchanged, still just deprioritized.
2. **`shows a real diagnostic from tsserver` now fails** (`0` squigglies
   instead of `1`, after the full 60s timeout) - despite passing reliably when
   `ide.spec.ts` is run by itself.

While `foundations.spec.ts` was running (it installs/uninstalls real packages
like `nanoid`/`left-pad` via the package-manager UI), the TEMPORARY debug
logging showed tsserver crashing outright with a plain-text Node.js
`MODULE_NOT_FOUND` uncaught-exception dump on its output stream (visible as a
burst of "not valid JSON" parse errors, since it's a crash dump, not a
protocol message, hitting the line-based JSON parser).

The likely mechanism: `mm-editor`'s own `npm install --save-dev
typescript@5.9.3` and tsserver's live `require()`-based module resolution
share the *same* WebContainer project/`node_modules` as the package-manager
UI's own installs/uninstalls - a concurrent `npm uninstall` mutating
`node_modules` while tsserver reads from it is a plausible crash trigger.
Compounding that: this document's first regression section already flagged,
as an unconfirmed open lead, that WebContainer state may persist **across
tests within the same Playwright worker** (`workers: 1`) rather than resetting
per `page.goto()` - which would explain why a crash caused by an *earlier*
test's package churn can still be observed by a *later*, otherwise-unrelated
test's tsserver connection.

This isn't a flaw in the direct-tsserver approach itself (it reproduces
100% correctly in isolation) or a new architectural weakness introduced by
this change - `typescript-language-server` shared the exact same container
and would have been equally exposed to it, it just wasn't previously
noticed/tested this way. Once tsserver crashes, the current code has no
retry/restart logic (the process is memoized once in `tsServer.ts`, the same
pattern the old code used), so diagnostics silently stop working for the rest
of that WebContainer session.

## Suggested next steps for whoever picks this up

- Confirm whether WebContainer state genuinely persists across tests within
  one Playwright worker (e.g. log `container.workdir`/a unique boot id per
  test and compare) - this would explain both this finding and the
  first section's unconfirmed "open lead."
- Decide whether to guard against tsserver crashing under concurrent npm
  churn now (e.g. detect the process exiting and respawn it, or serialize
  tsserver's own npm install against the package-manager UI's installs) or
  accept it as a known edge case for now - a real user furiously
  installing/removing packages while also typing in the editor is a narrow
  scenario, but the crash-with-no-recovery behavior is still a real gap.
- The debug logging (`console.log`/`console.error` calls marked
  "TEMPORARY" throughout `tsServerClient.ts`, `mm-editor.ts`, `webcontainer.ts`,
  plus the `window.__lspLog` array in `tsServerClient.ts`) was deliberately
  left in per explicit user request ("leave the logging in until I say
  otherwise"). Remove it once the user confirms.
