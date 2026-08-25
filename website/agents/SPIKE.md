# Spike: highlighting the current array element inside map/flatMap/forEach

**Question asked:** during playback, when a `new XxxEvent(...)` call happens
inside a `.map()`, `.flatMap()`, or `.forEach()` callback (the shape most
"musical pattern" code will take - `[60, 62, 64].map(n => new
NoteOnEvent().key(n))`), can we highlight the *specific array element*
currently driving that construction (e.g. the literal `62`), not just the
constructor call site itself - and how deep (nested loops, chained
transforms) can that go?

**Status:** Spike only. Nothing in this document is implemented. A working
prototype was built and run outside the app (not committed) to validate the
claims below against real TypeScript Compiler API behaviour rather than
guesswork.

**Bottom line:** yes, it's possible, using the same tool we already use for
constructor tagging (a `ts.Program` + a custom AST transform). It works
today's-tech for `.map`/`.forEach`/`.flatMap` over an array that is, or
resolves back to, a literal written in the user's source. It degrades
gracefully (falls back to today's constructor-only highlight) for arrays that
don't. Nesting is not a separate problem - a stack-based runtime context
handles it for free. Chained transforms (`.filter().map()`) are the one case
that genuinely breaks the correlation, and there's no cheap fix for that.

## 1. What already works today, unchanged

The existing tagging transform in `programEvaluator.ts` walks the *entire*
AST of `program.ts` looking for `new XxxEvent(...)` calls assignable to
`Event`, regardless of what control-flow structure they're nested inside. A
`new NoteOnEvent()` written inside a `.map()` callback is still just a
`NewExpression` node somewhere in the tree - `ts.visitEachChild` already
recurses into arrow function bodies and call arguments. So:

```ts
[60, 62, 64].map(n => new NoteOnEvent().key(n))
```

already gets each of the three resulting event instances tagged with the
*same* source range (the one `new NoteOnEvent()` call site), and each one
already gets highlighted correctly as it plays, exactly like straight-line
code. **This part needed no new work to confirm - it's a direct consequence
of the AST walk being structural, not aware of "am I inside a loop."**

What it *doesn't* tell you is which of the three notes is currently sounding
- the constructor line just flashes three times identically. That's the gap
this spike is about closing.

## 2. The idea: an iteration-context stack

The same trick that makes constructor tagging work - wrap the runtime value
with a call that stamps metadata on it, at the exact point the compiler can
prove something interesting is true - extends naturally to iteration:

1. Find `.map(cb)` / `.forEach(cb)` / `.flatMap(cb)` calls.
2. Rewrite the callback `cb` to a wrapper `(el, idx, arr) => { push
   context; try { return cb(el, idx, arr) } finally { pop context } }`,
   where "context" is `{ index, elementRange }`.
3. `elementRange` is only knowable when the receiver (the thing `.map` is
   called on) is, or resolves back to, an array *literal* written in
   source - in which case each element already has its own real
   `startLine`/`startColumn`/`endLine`/`endColumn` from the parser, same as
   the constructor calls already have.
4. `__tagEvent` (already-existing runtime helper) snapshots the *whole
   current stack* (`globalThis.__iterationStack.slice()`) at the moment an
   event is tagged, not just the top frame.

Because the array method's callback executes synchronously (there's no
`await` anywhere in building a `File` - it's a pure synchronous
object-graph-construction step), a plain module-level stack correctly
threads through **arbitrary nesting depth** with no extra bookkeeping. This
was the main open question ("how deep can this go") and the prototype
confirms it directly - see run 2 below.

## 3. Prototype and results

Built as a standalone script using the exact `typescript` package this repo
already depends on (not committed - this was throwaway validation, similar
in spirit to the transform already living in `programEvaluator.ts`, but
simplified to test the concept rather than restate the existing default-export
type-check machinery).

Sample input:

```ts
const notes = [60, 62, 64];
const chords = [[60, 64, 67], [62, 65, 69]];

const events1 = notes.map(n => new NoteOnEvent().key(n));
const events2 = chords.flatMap(chord => chord.map(n => new NoteOnEvent().key(n)));

const events3 = [];
notes.forEach(n => { events3.push(new NoteOnEvent().key(n)); });

const events4 = notes.filter(n => n > 60).map(n => new NoteOnEvent().key(n));

function getNotes() { return [60, 62]; }
const events5 = getNotes().map(n => new NoteOnEvent().key(n));
```

### First run: naive "is the receiver an array literal" check - failed informatively

The first version of the transform only recognised `[1,2,3].map(...)` - an
array literal written directly at the call site. Every single case in the
sample came back with no element range, **including `notes.map(...)`**. This
was a genuinely useful negative result: the overwhelmingly common real-world
pattern is naming a pattern first -

```ts
const notes = [60, 62, 64];
notes.map(...)
```

- and a syntax-only check doesn't see through the variable. Fixing this
requires resolving `notes` back to its declaration.

### Second run: resolving identifiers back to their declaration - passed

The prototype's fix does a simplified same-scope lookup (find a top-level
`const notes = [...]` matching the identifier text). **Production code would
do this properly** via the type checker's symbol resolution
(`checker.getSymbolAtLocation(identifier).valueDeclaration`, the same kind
of API `programEvaluator.ts` already uses for the `Event`-assignability
check) rather than a manual scan, so it works correctly across scoping,
shadowing, and reassignment - the simplification here was only to keep the
spike's code small. With that fix:

- **`notes.map(n => new NoteOnEvent().key(n))`** - each of the 3 events came
  back with `iterationContext: [{ index: 0, element: "60" }]` (and `"62"`,
  `"64"`) - correct index *and* correct literal source text, resolved
  through the named variable.
- **`chords.flatMap(chord => chord.map(n => ...))`** (nested) - each of the
  6 events came back with a **two-level** context stack, e.g. for the note
  `65`: `[{ index: 1, element: "[62, 65, 69]" }, { index: 1, element:
  "(no literal - dynamic array)" }]`. The outer frame correctly identifies
  *which chord* (by resolving `chords`, the named outer array); the inner
  frame correctly identifies the index within it. Nesting depth was not a
  problem - it required no special-casing beyond the stack already being a
  stack.
- **`notes.forEach(...)`** - behaved identically to `.map`, confirming the
  same wrapper works for both signatures.
- **`notes.filter(n => n > 60).map(n => ...)`** (chained) - correctly came
  back with **no element range**, only an index (0, 1). This is the
  predicted breakdown case, confirmed: `.map()`'s receiver here is
  `.filter()`'s *return value*, a new array with no fixed relationship to
  `notes`'s literal positions (one element was dropped, so index 0 of the
  filtered array is index 1 of the original). There is no cheap way to
  resolve this correlation from the `.map()` call site alone.
- **`getNotes().map(n => new NoteOnEvent().key(n))`** (dynamic receiver) -
  correctly came back with no element range. There's no literal array to
  point at, since the elements don't exist in source at all - they're
  computed at runtime. Degrades gracefully to index-only, same as the
  chained case.

The full prototype script and both run outputs are available on request if
useful for later reference - they were not committed since this is a spike,
per the project's read-only-source-control rule.

## 4. Method-by-method

| Method | Constructor tagging (today) | Element-highlight (this spike) | Notes |
|---|---|---|---|
| `.map(cb)` | Works | Works, if receiver resolves to a literal array | `cb` signature is `(value, index, array)` - straightforward |
| `.forEach(cb)` | Works | Works, if receiver resolves to a literal array | Same signature and wrapper as `.map` |
| `.flatMap(cb)` | Works | Works, if receiver resolves to a literal array | Flattening the *output* doesn't affect context tracking, since context is tied to the *input* element being processed |
| `.reduce(cb)` | Works | Feasible, not prototyped | Signature is `(accumulator, value, index, array)` - the "current element" is argument **2**, not argument 1. Same wrapper shape, different argument index when threading context |
| `for (const x of arr)` | Works | Feasible, not prototyped | Different AST shape (`ForOfStatement`, not a `CallExpression`) - no index is given for free, we'd inject our own counter. Same literal-array-resolution requirement applies to `arr` |
| indexed `for (let i = 0; i < arr.length; i++)` | Works | Possible in principle, not recommended | Would need to detect the loop variable and correlate it to `arr[i]`; arbitrary loop conditions/increments make this much less reliable to detect robustly than the array-method cases |
| `.filter(cb).map(cb2)` (or any chain that reorders/resizes) | Works (each `new` still tagged) | **Does not work** - confirmed | The element position correlation is lost the moment an intermediate step changes which/how-many elements survive. No cheap fix; a real fix would mean threading an "original index" tag through every array-producing method in a chain (map, filter, slice, sort, concat, spread, ...), which is a much bigger, bespoke undertaking for uncertain benefit |
| Non-literal receiver (`someFn().map(...)`, `Array.from(...)`) | Works | **Does not work** - confirmed, degrades to index-only | There is no source text to point at; the values don't exist in the source file |
| Callback is a named function reference (`notes.map(makeNote)`) where `makeNote` is defined **in the same file** | Works (already-existing tagging reaches into any locally-defined function body) | Feasible, not prototyped | The index/element context would still be visible to `makeNote`'s body via the stack, since it's set by the *caller* before `makeNote` runs |
| Callback/constructor lives inside an **imported package** (e.g. a `@perry-rylance/midi-macros` helper) | **Does not work** | **Does not work** | This is PLAN.md's separately-flagged "secondary goal" (highlighting which macros are in use). Our AST transform only ever walks `program.ts` - it has no visibility into, and does not rewrite, installed dependencies' source. Reaching into macro internals would mean either also transforming package source (raises real questions about whether we *should* rewrite third-party code) or a different, coarser mechanism (e.g. tag only at the macro call site, not inside it) |

## 5. Levels of fidelity (cheapest to most speculative)

- **Level 0 (shipped today):** tag the constructor call site. Works
  everywhere, any control flow, any depth - already proven in production
  use.
- **Level 1:** additionally track the *index* via the stack, with no
  requirement that the array be a literal. Cheap, always available, but on
  its own isn't enough to highlight a specific bit of *source text* - useful
  mainly if some other, non-source UI ("event 3 of 8") were ever wanted.
- **Level 2 (this spike's main finding, validated):** additionally resolve
  the receiver back to a literal array (directly, or via a named `const`)
  and highlight the specific element's own source range alongside the
  constructor's. This is the concrete "see which note in the pattern is
  playing" experience, and nesting falls out for free from the stack.
- **Level 3 (identified, not validated):** resolve literal-ness *through*
  callback parameters for nested cases - e.g. in `chords.flatMap(chord =>
  chord.map(...))`, recognise that `chord` (a parameter, not a named
  constant) is *itself* bound from an element of `chords`'s literal on each
  outer iteration, and resolve the inner `.map()`'s receiver through that
  binding rather than stopping at "not a literal." This would make the
  *inner* frame of the nested example resolve too (today it correctly comes
  back "no literal," which is accurate but leaves fidelity on the table).
  This is meaningfully harder - it needs the AST transform to reason about
  parameter-to-argument bindings, potentially across multiple wrapped
  layers - and wasn't attempted in this spike.

## 6. Caveats that apply regardless of level

- Everything above assumes **synchronous** construction (no `await`
  anywhere between pushing and popping a context frame). That already
  matches how `File`/`Track`/`Event` graphs are built, so it's not a
  practical restriction today, just worth stating as an assumption.
- Production implementation must use the **type checker's real symbol
  resolution** to trace an identifier back to its declaration, not the
  simplified same-scope scan used in the prototype - this repo already does
  exactly that kind of resolution elsewhere (the `Event`-assignability
  check in `programEvaluator.ts`), so it's a known-working technique, not
  new capability.
- None of this changes what the *audio* does - it's purely an additional
  metadata/highlighting layer on top of the existing tagging pipeline.

## 7. Recommendation

Level 2 (element highlighting for `.map`/`.forEach`/`.flatMap` over literal
or named-literal arrays, arbitrarily nested) is validated, bounded in scope,
and reuses infrastructure that already exists and is already tested in
production (`programEvaluator.ts`'s tagging transform, the same
`__tagEvent`-style runtime stamping, and `checker`-based resolution). It
would be the natural next implementation step if this is wanted.

Level 3 and the chained-transform case are real but meaningfully harder, and
the "callback lives in an imported macro" case is a different problem
altogether (PLAN.md's own secondary goal) - all worth calling out as
explicitly *not* included in whatever gets built next, rather than
discovering the boundary by surprise later.
