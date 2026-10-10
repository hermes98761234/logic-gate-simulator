import type { Circuit, Comp, CompType, Wire } from './types'

class Builder {
  comps: Comp[] = []
  wires: Wire[] = []
  add(type: CompType, x: number, y: number, o: { label?: string; n?: number; value?: 0 | 1 } = {}): number {
    const id = this.comps.length + 1
    const k: Comp = { id, type, x, y }
    if (o.label) k.label = o.label
    if (o.n) k.n = o.n
    if (type === 'SWITCH') k.value = o.value ?? 0
    this.comps.push(k)
    return id
  }
  /** Wires output pin `fp` of `from` to input pin `tp` of `to`. */
  w(from: number, fp: number, to: number, tp: number) {
    this.wires.push({ from: [from, fp], to: [to, tp] })
  }
  done(): Circuit {
    return { comps: this.comps, wires: this.wires }
  }
}

function halfAdder(): Circuit {
  const b = new Builder()
  const a = b.add('SWITCH', 40, 40, { label: 'A' })
  const c = b.add('SWITCH', 40, 140, { label: 'B' })
  const x = b.add('XOR', 200, 40)
  const n = b.add('AND', 200, 140)
  const s = b.add('LED', 340, 40, { label: 'Sum' })
  const co = b.add('LED', 340, 140, { label: 'Carry' })
  b.w(a, 0, x, 0); b.w(c, 0, x, 1)
  b.w(a, 0, n, 0); b.w(c, 0, n, 1)
  b.w(x, 0, s, 0); b.w(n, 0, co, 0)
  return b.done()
}

function fullAdderGates(): Circuit {
  const b = new Builder()
  const a = b.add('SWITCH', 20, 20, { label: 'A', value: 1 })
  const c = b.add('SWITCH', 20, 100, { label: 'B', value: 1 })
  const ci = b.add('SWITCH', 20, 200, { label: 'Cin' })
  const x1 = b.add('XOR', 160, 40)
  const x2 = b.add('XOR', 300, 100)
  const a1 = b.add('AND', 160, 140)
  const a2 = b.add('AND', 300, 180)
  const o = b.add('OR', 440, 160)
  const s = b.add('LED', 560, 100, { label: 'Sum' })
  const co = b.add('LED', 560, 160, { label: 'Cout' })
  b.w(a, 0, x1, 0); b.w(c, 0, x1, 1)
  b.w(a, 0, a1, 0); b.w(c, 0, a1, 1)
  b.w(x1, 0, x2, 0); b.w(ci, 0, x2, 1)
  b.w(x1, 0, a2, 0); b.w(ci, 0, a2, 1)
  b.w(a1, 0, o, 0); b.w(a2, 0, o, 1)
  b.w(x2, 0, s, 0); b.w(o, 0, co, 0)
  return b.done()
}

function rippleAdder(): Circuit {
  const b = new Builder()
  const cin = b.add('SWITCH', 20, 130, { label: 'Cin' })
  const fa: number[] = []
  for (let i = 0; i < 4; i++) fa.push(b.add('FA', 100 + 200 * i, 40))
  const av = [1, 0, 1, 1]
  const bv = [1, 1, 0, 0]
  for (let i = 0; i < 4; i++) {
    const a = b.add('SWITCH', 20 + 200 * i, 0, { label: `A${i}`, value: av[i] as 0 | 1 })
    const c = b.add('SWITCH', 20 + 200 * i, 60 + (i === 0 ? 0 : 0), { label: `B${i}`, value: bv[i] as 0 | 1 })
    b.w(a, 0, fa[i], 0); b.w(c, 0, fa[i], 1)
  }
  b.w(cin, 0, fa[0], 2)
  for (let i = 1; i < 4; i++) b.w(fa[i - 1], 1, fa[i], 2)
  for (let i = 0; i < 4; i++) {
    const s = b.add('LED', 220 + 200 * i, 220, { label: `S${i}` })
    b.w(fa[i], 0, s, 0)
  }
  const co = b.add('LED', 870, 130, { label: 'Cout' })
  b.w(fa[3], 1, co, 0)
  return b.done()
}

function rippleCounter(): Circuit {
  const b = new Builder()
  const clk = b.add('CLOCK', 20, 140, { label: 'CLK' })
  const ff: number[] = []
  for (let i = 0; i < 4; i++) ff.push(b.add('DFF', 140 + 170 * i, 120))
  for (let i = 0; i < 4; i++) {
    b.w(ff[i], 1, ff[i], 0) // D = Q̄: toggles on every clock edge
    b.w(i === 0 ? clk : ff[i - 1], i === 0 ? 0 : 1, ff[i], 1)
  }
  for (let i = 0; i < 4; i++) {
    const led = b.add('LED', 240 + 170 * i, 30, { label: `Q${i}` })
    b.w(ff[i], 0, led, 0)
  }
  return b.done()
}

function shiftRegister(): Circuit {
  const b = new Builder()
  const clk = b.add('CLOCK', 20, 220, { label: 'CLK' })
  const d = b.add('SWITCH', 20, 100, { label: 'Data', value: 1 })
  const ff: number[] = []
  for (let i = 0; i < 4; i++) ff.push(b.add('DFF', 140 + 150 * i, 80 + 30 * i))
  b.w(d, 0, ff[0], 0)
  for (let i = 1; i < 4; i++) b.w(ff[i - 1], 0, ff[i], 0)
  // The clock line to every flip-flop: one wire per input, all from the same output.
  for (let i = 0; i < 4; i++) b.w(clk, 0, ff[i], 1)
  for (let i = 0; i < 4; i++) {
    const led = b.add('LED', 240 + 150 * i, 10 + 30 * i, { label: `Q${i}` })
    b.w(ff[i], 0, led, 0)
  }
  return b.done()
}

function srLatch(): Circuit {
  const b = new Builder()
  const r = b.add('SWITCH', 40, 40, { label: 'R' })
  const s = b.add('SWITCH', 40, 160, { label: 'S', value: 1 })
  const n1 = b.add('NOR', 200, 40)
  const n2 = b.add('NOR', 200, 160)
  const q = b.add('LED', 380, 40, { label: 'Q' })
  const qn = b.add('LED', 380, 160, { label: 'Q̅' })
  b.w(r, 0, n1, 0); b.w(s, 0, n2, 1)
  b.w(n2, 0, n1, 1); b.w(n1, 0, n2, 0)
  b.w(n1, 0, q, 0); b.w(n2, 0, qn, 0)
  return b.done()
}

function mux4(): Circuit {
  const b = new Builder()
  const d = [0, 1, 2, 3].map((i) => b.add('SWITCH', 20, 20 + 60 * i, { label: `D${i}`, value: (i === 2 ? 1 : 0) as 0 | 1 }))
  const s0 = b.add('SWITCH', 20, 280, { label: 'S0', value: 0 })
  const s1 = b.add('SWITCH', 220, 300, { label: 'S1', value: 1 })
  const m0 = b.add('MUX', 140, 20)
  const m1 = b.add('MUX', 140, 160)
  const m2 = b.add('MUX', 360, 90)
  const y = b.add('LED', 500, 100, { label: 'Y' })
  b.w(d[0], 0, m0, 0); b.w(d[1], 0, m0, 1); b.w(s0, 0, m0, 2)
  b.w(d[2], 0, m1, 0); b.w(d[3], 0, m1, 1); b.w(s0, 0, m1, 2)
  b.w(m0, 0, m2, 0); b.w(m1, 0, m2, 1); b.w(s1, 0, m2, 2)
  b.w(m2, 0, y, 0)
  return b.done()
}

function hexDemo(): Circuit {
  const b = new Builder()
  const hex = b.add('HEX', 200, 20)
  const labels = ['1', '2', '4', '8']
  const vals = [0, 1, 1, 1] as const
  labels.forEach((l, i) => {
    const s = b.add('SWITCH', 40, 20 + 60 * i, { label: l, value: vals[i] })
    b.w(s, 0, hex, i)
  })
  return b.done()
}

export interface Example {
  id: string
  title: string
  note: string
  build: () => Circuit
}

export const EXAMPLES: Example[] = [
  { id: 'half', title: 'Half adder', note: 'XOR gives the sum bit, AND gives the carry.', build: halfAdder },
  { id: 'full', title: 'Full adder (gates)', note: 'Two half adders and an OR gate.', build: fullAdderGates },
  { id: 'ripple', title: '4-bit ripple-carry adder', note: 'Four full-adder blocks, the carry ripples from bit 0 up.', build: rippleAdder },
  { id: 'counter', title: '4-bit ripple counter', note: 'Press Run: each flip-flop divides the clock by two.', build: rippleCounter },
  { id: 'shift', title: '4-bit shift register', note: 'Run the clock and flip Data: the bit marches along.', build: shiftRegister },
  { id: 'sr', title: 'SR latch (NOR)', note: 'Two cross-coupled NOR gates remember a bit.', build: srLatch },
  { id: 'mux4', title: '4:1 multiplexer', note: 'Three 2:1 mux blocks pick one of four inputs.', build: mux4 },
  { id: 'hex', title: 'Hex display demo', note: 'Four switches (weights 1, 2, 4, 8) drive a hex digit.', build: hexDemo },
]
