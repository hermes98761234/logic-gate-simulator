import { displayName } from './circuit'
import { createSim, isSequential, setInput, settle, inputValue } from './sim'
import type { Circuit } from './types'

export const MAX_TRUTH_INPUTS = 10

export interface TruthTable {
  inputs: string[]
  outputs: string[]
  rows: { ins: number[]; outs: number[]; stable: boolean }[]
  sequential: boolean
  tooMany: boolean
}

/** Tries every combination of the switches (first switch = most significant bit) and reads the LEDs. */
export function truthTable(c: Circuit): TruthTable {
  const sw = c.comps.filter((k) => k.type === 'SWITCH')
  const leds = c.comps.filter((k) => k.type === 'LED')
  const t: TruthTable = {
    inputs: sw.map((k) => displayName(c, k)),
    outputs: leds.map((k) => displayName(c, k)),
    rows: [],
    sequential: isSequential(c),
    tooMany: sw.length > MAX_TRUTH_INPUTS,
  }
  if (t.tooMany || sw.length === 0 || leds.length === 0) return t
  const sim = createSim(c)
  const n = sw.length
  for (let r = 0; r < 1 << n; r++) {
    const ins = sw.map((_, i) => (r >> (n - 1 - i)) & 1)
    sw.forEach((k, i) => setInput(sim, k.id, ins[i]))
    const stable = settle(sim)
    t.rows.push({ ins, outs: leds.map((k) => inputValue(sim, k.id, 0)), stable })
  }
  return t
}

/** Index of the row matching the current switch values, or -1. */
export function rowIndex(values: number[]): number {
  return values.reduce((a, v, i) => a | (v << (values.length - 1 - i)), 0)
}

