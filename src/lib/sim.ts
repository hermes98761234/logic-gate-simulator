import { evaluate, type St } from './logic'
import { inputNames, outputNames, type Circuit, type Comp } from './types'

export interface Sim {
  comps: Comp[]
  index: Map<number, number>
  /** Per component and input pin: the output slot that drives it, or -1. */
  src: number[][]
  /** Per component: first output slot. */
  base: number[]
  /** Current value of every output slot. */
  out: Uint8Array
  /** Per output slot: components whose inputs it feeds. */
  fan: number[][]
  st: St[]
  queue: Set<number>
  /** Number of unit-delay steps simulated so far. */
  time: number
}

function readIns(sim: Sim, i: number): number[] {
  return sim.src[i].map((s) => (s < 0 ? 0 : sim.out[s]))
}

const EDGE = new Set(['DFF', 'TFF', 'JKFF'])

/** Evaluates components one at a time, in order, until nothing changes. Gives latches a defined power-up state. */
function powerUp(sim: Sim) {
  for (let sweep = 0; sweep < 100; sweep++) {
    let changed = false
    for (let i = 0; i < sim.comps.length; i++) {
      const ins = readIns(sim, i)
      // No phantom clock edges while powering up.
      if (EDGE.has(sim.comps[i].type)) sim.st[i].clk = ins[ins.length - 1]
      const outs = evaluate(sim.comps[i].type, ins, sim.st[i])
      outs.forEach((v, j) => {
        if (sim.out[sim.base[i] + j] !== v) {
          sim.out[sim.base[i] + j] = v
          changed = true
        }
      })
    }
    if (!changed) break
  }
}

export function createSim(c: Circuit): Sim {
  const comps = c.comps
  const index = new Map<number, number>()
  comps.forEach((k, i) => index.set(k.id, i))
  const base: number[] = []
  let slots = 0
  for (const k of comps) {
    base.push(slots)
    slots += outputNames(k).length
  }
  const src = comps.map((k) => inputNames(k).map(() => -1))
  const fan: number[][] = Array.from({ length: slots }, () => [])
  for (const w of c.wires) {
    const a = index.get(w.from[0])
    const b = index.get(w.to[0])
    if (a === undefined || b === undefined) continue
    const slot = base[a] + w.from[1]
    src[b][w.to[1]] = slot
    if (!fan[slot].includes(b)) fan[slot].push(b)
  }
  const st: St[] = comps.map((k) => ({ q: k.type === 'HIGH' ? 1 : k.type === 'SWITCH' ? (k.value ?? 0) : 0, clk: 0 }))
  const sim: Sim = { comps, index, src, base, out: new Uint8Array(slots), fan, st, queue: new Set(), time: 0 }
  powerUp(sim)
  return sim
}

/** One unit-delay step: every queued component is evaluated against the old values, then all results are applied at once. */
export function step(sim: Sim) {
  const list = [...sim.queue]
  sim.queue.clear()
  const results = list.map((i) => evaluate(sim.comps[i].type, readIns(sim, i), sim.st[i]))
  list.forEach((i, n) => {
    results[n].forEach((v, j) => {
      const slot = sim.base[i] + j
      if (sim.out[slot] !== v) {
        sim.out[slot] = v
        for (const f of sim.fan[slot]) sim.queue.add(f)
      }
    })
  })
  sim.time++
}

/** Runs until no events are left. Returns false if the circuit is still changing after `max` steps (oscillation). */
export function settle(sim: Sim, max = 500): boolean {
  let n = 0
  while (sim.queue.size > 0 && n++ < max) step(sim)
  return sim.queue.size === 0
}

function drive(sim: Sim, i: number, v: number) {
  sim.st[i].q = v
  const slot = sim.base[i]
  if (sim.out[slot] !== v) {
    sim.out[slot] = v
    for (const f of sim.fan[slot]) sim.queue.add(f)
  }
}

/** Sets a switch without settling. Call `settle` afterwards. */
export function setInput(sim: Sim, id: number, v: number) {
  const i = sim.index.get(id)
  if (i !== undefined && sim.comps[i].type === 'SWITCH') drive(sim, i, v)
}

export function getInput(sim: Sim, id: number): number {
  const i = sim.index.get(id)
  return i === undefined ? 0 : sim.st[i].q
}

/** Toggles every clock, then settles. */
export function tick(sim: Sim): boolean {
  sim.comps.forEach((k, i) => {
    if (k.type === 'CLOCK') drive(sim, i, sim.st[i].q ^ 1)
  })
  return settle(sim)
}

/** Clears all stored bits and clocks and re-settles; switch positions are kept. */
export function resetSim(sim: Sim) {
  sim.queue.clear()
  sim.comps.forEach((k, i) => {
    if (k.type === 'CLOCK' || DEF_SEQ.has(k.type)) sim.st[i] = { q: 0, clk: 0 }
  })
  sim.out.fill(0)
  powerUp(sim)
  sim.time = 0
}

const DEF_SEQ = new Set(['DFF', 'TFF', 'JKFF', 'SRL'])

export function hasClock(c: Circuit): boolean {
  return c.comps.some((k) => k.type === 'CLOCK')
}

export function isSequential(c: Circuit): boolean {
  return c.comps.some((k) => DEF_SEQ.has(k.type))
}

export function outputValue(sim: Sim, id: number, pin: number): number {
  const i = sim.index.get(id)
  return i === undefined ? 0 : sim.out[sim.base[i] + pin]
}

export function inputValue(sim: Sim, id: number, pin: number): number {
  const i = sim.index.get(id)
  if (i === undefined) return 0
  const s = sim.src[i][pin]
  return s < 0 ? 0 : sim.out[s]
}

export function isConnected(sim: Sim, id: number, pin: number): boolean {
  const i = sim.index.get(id)
  return i !== undefined && sim.src[i][pin] >= 0
}
