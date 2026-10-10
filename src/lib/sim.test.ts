import { describe, expect, it } from 'vitest'
import { addComp, addWire, EMPTY } from './circuit'
import { evaluate, HEX_SEGS } from './logic'
import { createSim, getInput, inputValue, outputValue, resetSim, setInput, settle, tick } from './sim'
import { truthTable } from './truth'
import { EXAMPLES } from './examples'
import type { CompType } from './types'

const ev = (t: CompType, ...ins: number[]) => evaluate(t, ins, { q: 0, clk: 0 })

describe('gate truth tables', () => {
  const combos = [[0, 0], [0, 1], [1, 0], [1, 1]]
  const table: Record<string, number[]> = {
    AND: [0, 0, 0, 1], NAND: [1, 1, 1, 0], OR: [0, 1, 1, 1], NOR: [1, 0, 0, 0], XOR: [0, 1, 1, 0], XNOR: [1, 0, 0, 1],
  }
  for (const [t, expected] of Object.entries(table)) {
    it(t, () => expect(combos.map(([a, b]) => ev(t as CompType, a, b)[0])).toEqual(expected))
  }
  it('NOT and BUF', () => {
    expect([ev('NOT', 0)[0], ev('NOT', 1)[0], ev('BUF', 0)[0], ev('BUF', 1)[0]]).toEqual([1, 0, 0, 1])
  })
  it('3-input gates', () => {
    expect(ev('AND', 1, 1, 1)[0]).toBe(1)
    expect(ev('AND', 1, 0, 1)[0]).toBe(0)
    expect(ev('XOR', 1, 1, 1)[0]).toBe(1) // odd parity
    expect(ev('NOR', 0, 0, 0, 0)[0]).toBe(1)
  })
  it('full adder block adds every input combination', () => {
    for (let n = 0; n < 8; n++) {
      const [a, b, c] = [(n >> 2) & 1, (n >> 1) & 1, n & 1]
      const [s, co] = ev('FA', a, b, c)
      expect(s + 2 * co).toBe(a + b + c)
    }
  })
  it('half adder and mux', () => {
    expect(ev('HA', 1, 1)).toEqual([0, 1])
    expect(ev('MUX', 0, 1, 0)[0]).toBe(0)
    expect(ev('MUX', 0, 1, 1)[0]).toBe(1)
  })
})

describe('flip-flops', () => {
  it('D flip-flop samples D only on the rising edge', () => {
    const st = { q: 0, clk: 0 }
    expect(evaluate('DFF', [1, 0], st)).toEqual([0, 1])
    expect(evaluate('DFF', [1, 1], st)).toEqual([1, 0])
    expect(evaluate('DFF', [0, 1], st)).toEqual([1, 0]) // clock still high: no change
    expect(evaluate('DFF', [0, 0], st)).toEqual([1, 0]) // falling edge: no change
    expect(evaluate('DFF', [0, 1], st)).toEqual([0, 1])
  })
  it('T flip-flop toggles when T=1', () => {
    const st = { q: 0, clk: 0 }
    evaluate('TFF', [1, 1], st)
    expect(st.q).toBe(1)
    evaluate('TFF', [1, 0], st)
    evaluate('TFF', [1, 1], st)
    expect(st.q).toBe(0)
  })
  it('JK flip-flop: set, reset, hold, toggle', () => {
    const st = { q: 0, clk: 0 }
    const clock = (j: number, k: number) => { evaluate('JKFF', [j, k, 0], st); evaluate('JKFF', [j, k, 1], st); return st.q }
    expect(clock(1, 0)).toBe(1)
    expect(clock(0, 0)).toBe(1)
    expect(clock(1, 1)).toBe(0)
    expect(clock(1, 1)).toBe(1)
    expect(clock(0, 1)).toBe(0)
  })
  it('SR latch remembers', () => {
    const st = { q: 0, clk: 0 }
    expect(evaluate('SRL', [1, 0], st)[0]).toBe(1)
    expect(evaluate('SRL', [0, 0], st)[0]).toBe(1)
    expect(evaluate('SRL', [0, 1], st)[0]).toBe(0)
    expect(evaluate('SRL', [1, 1], st)).toEqual([0, 0])
  })
})

describe('hex decoder', () => {
  it('lights the standard segments', () => {
    expect(HEX_SEGS).toHaveLength(16)
    expect(HEX_SEGS[8]).toBe('abcdefg')
    expect(HEX_SEGS[1]).toBe('bc')
    expect(HEX_SEGS[0]).not.toContain('g')
  })
})

describe('event-driven simulation', () => {
  it('propagates through a chain of gates with unit delay', () => {
    let c = EMPTY
    const ids: number[] = []
    for (const t of ['SWITCH', 'NOT', 'NOT', 'NOT', 'LED'] as CompType[]) {
      const r = addComp(c, t, ids.length * 100, 0)
      c = r.circuit
      ids.push(r.id)
    }
    for (let i = 0; i < 4; i++) c = addWire(c, [ids[i], 0], [ids[i + 1], 0])
    const sim = createSim(c)
    expect(inputValue(sim, ids[4], 0)).toBe(1) // three inverters on 0
    setInput(sim, ids[0], 1)
    expect(sim.queue.size).toBe(1)
    const t0 = sim.time
    expect(settle(sim)).toBe(true)
    expect(sim.time - t0).toBe(4) // three inverters, then the LED reads the result
    expect(inputValue(sim, ids[4], 0)).toBe(0)
    expect(getInput(sim, ids[0])).toBe(1)
  })

  it('detects a ring oscillator', () => {
    let c = EMPTY
    const r = addComp(c, 'NOT', 0, 0)
    c = addWire(r.circuit, [r.id, 0], [r.id, 0])
    const sim = createSim(c)
    sim.queue.add(0)
    expect(settle(sim, 50)).toBe(false)
  })

  it('cross-coupled NOR latch holds its state', () => {
    const sim = createSim(EXAMPLES.find((e) => e.id === 'sr')!.build())
    // ids: 1 = R, 2 = S, 3/4 = NOR, 5/6 = LEDs. S=1 sets Q.
    expect(outputValue(sim, 3, 0)).toBe(1)
    expect(outputValue(sim, 4, 0)).toBe(0)
    setInput(sim, 2, 0); settle(sim)
    expect(outputValue(sim, 3, 0)).toBe(1) // S released, Q held
    setInput(sim, 1, 1); settle(sim)
    expect(outputValue(sim, 3, 0)).toBe(0) // reset
    setInput(sim, 1, 0); settle(sim)
    expect(outputValue(sim, 3, 0)).toBe(0) // held low
    expect(outputValue(sim, 4, 0)).toBe(1)
  })

  it('ripple counter counts 0..15 and wraps', () => {
    const c = EXAMPLES.find((e) => e.id === 'counter')!.build()
    const sim = createSim(c)
    const leds = c.comps.filter((k) => k.type === 'LED')
    const read = () => leds.reduce((a, k, i) => a | (inputValue(sim, k.id, 0) << i), 0)
    expect(read()).toBe(0)
    const seen: number[] = []
    for (let i = 0; i < 34; i++) {
      expect(tick(sim)).toBe(true)
      if (i % 2 === 1) seen.push(read()) // after each full clock cycle
    }
    expect(seen).toEqual([...Array(16).keys()].slice(1).concat([0, 1]))
    resetSim(sim)
    expect(read()).toBe(0)
  })

  it('shift register moves a bit one stage per clock', () => {
    const c = EXAMPLES.find((e) => e.id === 'shift')!.build()
    const sim = createSim(c)
    const leds = c.comps.filter((k) => k.type === 'LED')
    const read = () => leds.map((k) => inputValue(sim, k.id, 0)).join('')
    expect(read()).toBe('0000')
    const out: string[] = []
    for (let i = 0; i < 8; i++) { tick(sim); if (i % 2) out.push(read()) }
    expect(out).toEqual(['1000', '1100', '1110', '1111'])
  })
})

describe('truth tables of the examples', () => {
  it('half adder', () => {
    const t = truthTable(EXAMPLES[0].build())
    expect(t.inputs).toEqual(['A', 'B'])
    expect(t.outputs).toEqual(['Sum', 'Carry'])
    expect(t.rows.map((r) => r.outs.join(''))).toEqual(['00', '10', '10', '01'])
  })
  it('full adder from gates adds correctly', () => {
    const t = truthTable(EXAMPLES[1].build())
    expect(t.rows).toHaveLength(8)
    for (const r of t.rows) {
      const total = r.ins[0] + r.ins[1] + r.ins[2]
      expect(r.outs[0] + 2 * r.outs[1]).toBe(total)
    }
  })
  it('4-bit ripple adder adds all 512 input combinations', () => {
    const c = EXAMPLES.find((e) => e.id === 'ripple')!.build()
    const t = truthTable(c)
    const names = t.inputs
    expect(t.rows).toHaveLength(512)
    expect(t.tooMany).toBe(false)
    const idx = (n: string) => names.indexOf(n)
    for (const r of t.rows) {
      const v = (p: string) => [0, 1, 2, 3].reduce((a, i) => a | (r.ins[idx(`${p}${i}`)] << i), 0)
      const sum = v('A') + v('B') + r.ins[idx('Cin')]
      const got = [0, 1, 2, 3].reduce((a, i) => a | (r.outs[t.outputs.indexOf(`S${i}`)] << i), 0) + 16 * r.outs[t.outputs.indexOf('Cout')]
      expect(got).toBe(sum)
    }
  })
  it('4:1 mux selects the addressed input', () => {
    const t = truthTable(EXAMPLES.find((e) => e.id === 'mux4')!.build())
    const names = t.inputs
    for (const r of t.rows) {
      const sel = r.ins[names.indexOf('S1')] * 2 + r.ins[names.indexOf('S0')]
      expect(r.outs[0]).toBe(r.ins[names.indexOf(`D${sel}`)])
    }
  })
  it('refuses too many inputs', () => {
    let c = EMPTY
    for (let i = 0; i < 11; i++) c = addComp(c, 'SWITCH', 0, i * 50).circuit
    expect(truthTable(c).tooMany).toBe(true)
  })
})
