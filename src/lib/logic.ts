import type { CompType } from './types'

/** Mutable per-component state for sequential parts and sources. */
export interface St {
  q: number
  clk: number
}

/** Segments a..g that are lit for each hex digit 0..F (classic 7-segment decoder). */
export const HEX_SEGS: string[] = [
  'abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc',
  'abcdefg', 'abcdfg', 'abcefg', 'cdefg', 'adef', 'bcdeg', 'adefg', 'aefg',
]

const parity = (ins: number[]) => ins.reduce((a, b) => a ^ b, 0)

/**
 * Computes the outputs of one component from its input values. Flip-flops
 * update `st` on a rising clock edge. Unconnected inputs read as 0.
 */
export function evaluate(type: CompType, ins: number[], st: St): number[] {
  switch (type) {
    case 'SWITCH':
    case 'CLOCK':
    case 'HIGH':
    case 'LOW':
      return [st.q]
    case 'LED':
    case 'SEG7':
    case 'HEX':
      return []
    case 'NOT': return [ins[0] ^ 1]
    case 'BUF': return [ins[0]]
    case 'AND': return [ins.every((v) => v === 1) ? 1 : 0]
    case 'NAND': return [ins.every((v) => v === 1) ? 0 : 1]
    case 'OR': return [ins.some((v) => v === 1) ? 1 : 0]
    case 'NOR': return [ins.some((v) => v === 1) ? 0 : 1]
    case 'XOR': return [parity(ins)]
    case 'XNOR': return [parity(ins) ^ 1]
    case 'DFF': case 'TFF': case 'JKFF': {
      const clk = ins[ins.length - 1]
      const rising = clk === 1 && st.clk === 0
      st.clk = clk
      if (rising) {
        if (type === 'DFF') st.q = ins[0]
        else if (type === 'TFF') st.q ^= ins[0]
        else {
          const [j, k] = ins
          if (j && k) st.q ^= 1
          else if (j) st.q = 1
          else if (k) st.q = 0
        }
      }
      return [st.q, st.q ^ 1]
    }
    case 'SRL': {
      const [s, r] = ins
      if (s && r) return [0, 0] // forbidden state: both outputs low, stored bit kept
      if (s) st.q = 1
      else if (r) st.q = 0
      return [st.q, st.q ^ 1]
    }
    case 'MUX': return [ins[2] ? ins[1] : ins[0]]
    case 'HA': return [ins[0] ^ ins[1], ins[0] & ins[1]]
    case 'FA': {
      const [a, b, c] = ins
      return [a ^ b ^ c, (a & b) | (c & (a ^ b))]
    }
  }
}
