# @perry-rylance/midi-macros
A TypeScript library of macros designed to work with [`midi`](https://www.npmjs.com/package/@perry-rylance/midi).

This library provides a set of convenience functions for generating arrays of MIDI events.

## Macros

### `channel`
Takes an array of events or a callback that generates events, everything wrapped within the call will be forced onto the specified channel.

### `repeat`
Takes a count and an array of events or callback that generates events, returns the events repeated.

The count is interpreted in musical terms. Zero will return no events, one will return the same input, two will return the input twice.

### `fit`
Takes a duration in MIDI ticks, an array of events or a callback that generates events, and a callback that receives the remainder amount in ticks.

What to do with the remainder is left up to the caller, you could for example use an aftertouch event or sysex event to pad out the remaining time.

### `parallel`
Takes a two dimensional array of events, merges them together respecting the event deltas.

Useful for merging lines of music for example to make a counterpoint or clave into one track.

### `partition`
Takes a duration in MIDI ticks, a number of parts and a generator function. The generator function receives the delta, and index.

Useful for making repeating sequences of messages.

### `interpolate`
Takes a duration in MIDI ticks, a number of parts and a generator function. The generator function receives the delta, the normalized interpolant, and index.

The generator is called the same as `partition` but also receives the interpolant, which goes from zero to one over the macros duration.

### `ramp`
The same as `interpolate`, but allows you to specify the from and to values, as opposed to the normalized interpolant.

Optionally takes an `ease` function, which defaults to linear interpolation.

### `cycle`
The same as `interpolate`, but takes a wave period. The generator receives a delta, and a value. Optionally, a wave function can be passed in. This defaults to `Math.sin`.

This macro cycles over the duration with the specified period, the wave function receives a radian angle which completes one revolution every `period` ticks.

## Examples

See the `examples/generate.ts` for usage examples.

If you want to hear them, you can run `npm run examples`, 
