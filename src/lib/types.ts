export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'

export type CompType =
  | 'SWITCH' | 'CLOCK' | 'HIGH' | 'LOW'
  | 'LED' | 'SEG7' | 'HEX'
  | 'NOT' | 'BUF' | 'AND' | 'NAND' | 'OR' | 'NOR' | 'XOR' | 'XNOR'
  | 'DFF' | 'TFF' | 'JKFF' | 'SRL'
  | 'MUX' | 'HA' | 'FA'

export type Category = 'input' | 'output' | 'gate' | 'memory' | 'block'

export interface Comp {
  id: number
  type: CompType
  x: number
  y: number
  label?: string
  /** Number of inputs for variadic gates (2..4). */
  n?: number
  /** Switch position. */
  value?: 0 | 1
}

/** from = [component id, output pin], to = [component id, input pin]. */
export interface Wire {
  from: [number, number]
  to: [number, number]
}

export interface Circuit {
  comps: Comp[]
  wires: Wire[]
}

export interface Def {
  name: string
  cat: Category
  ins: string[]
  outs: string[]
  w: number
  /** AND/OR style gates accept 2..4 inputs. */
  variadic?: boolean
  /** Holds state between evaluations. */
  seq?: boolean
}

const g = (name: string): Def => ({ name, cat: 'gate', ins: ['A', 'B'], outs: ['Y'], w: 60, variadic: true })

export const DEFS: Record<CompType, Def> = {
  SWITCH: { name: 'Switch', cat: 'input', ins: [], outs: ['Q'], w: 40 },
  CLOCK: { name: 'Clock', cat: 'input', ins: [], outs: ['Q'], w: 40 },
  HIGH: { name: 'High (1)', cat: 'input', ins: [], outs: ['Q'], w: 40 },
  LOW: { name: 'Low (0)', cat: 'input', ins: [], outs: ['Q'], w: 40 },
  LED: { name: 'LED', cat: 'output', ins: ['A'], outs: [], w: 40 },
  SEG7: { name: '7-segment', cat: 'output', ins: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], outs: [], w: 70 },
  HEX: { name: 'Hex display', cat: 'output', ins: ['1', '2', '4', '8'], outs: [], w: 70 },
  NOT: { name: 'NOT', cat: 'gate', ins: ['A'], outs: ['Y'], w: 60 },
  BUF: { name: 'Buffer', cat: 'gate', ins: ['A'], outs: ['Y'], w: 60 },
  AND: g('AND'),
  NAND: g('NAND'),
  OR: g('OR'),
  NOR: g('NOR'),
  XOR: g('XOR'),
  XNOR: g('XNOR'),
  DFF: { name: 'D flip-flop', cat: 'memory', ins: ['D', '>'], outs: ['Q', 'Q̅'], w: 70, seq: true },
  TFF: { name: 'T flip-flop', cat: 'memory', ins: ['T', '>'], outs: ['Q', 'Q̅'], w: 70, seq: true },
  JKFF: { name: 'JK flip-flop', cat: 'memory', ins: ['J', 'K', '>'], outs: ['Q', 'Q̅'], w: 70, seq: true },
  SRL: { name: 'SR latch', cat: 'memory', ins: ['S', 'R'], outs: ['Q', 'Q̅'], w: 70, seq: true },
  MUX: { name: 'Mux 2:1', cat: 'block', ins: ['A', 'B', 'S'], outs: ['Y'], w: 70 },
  HA: { name: 'Half adder', cat: 'block', ins: ['A', 'B'], outs: ['S', 'C'], w: 70 },
  FA: { name: 'Full adder', cat: 'block', ins: ['A', 'B', 'Ci'], outs: ['S', 'Co'], w: 70 },
}

export const TYPE_ORDER: CompType[] = Object.keys(DEFS) as CompType[]

export const CATEGORIES: Category[] = ['input', 'output', 'gate', 'memory', 'block']

export function inputNames(c: Pick<Comp, 'type' | 'n'>): string[] {
  const d = DEFS[c.type]
  if (!d.variadic) return d.ins
  return Array.from({ length: c.n ?? 2 }, (_, i) => String.fromCharCode(65 + i))
}

export function outputNames(c: Pick<Comp, 'type'>): string[] {
  return DEFS[c.type].outs
}

export function compHeight(c: Pick<Comp, 'type' | 'n'>): number {
  const d = DEFS[c.type]
  const k = Math.max(2, inputNames(c).length, d.outs.length)
  if (c.type === 'LED' || d.cat === 'input') return 40
  return 20 * k
}

export function compWidth(c: Pick<Comp, 'type'>): number {
  return DEFS[c.type].w
}

/** Pin offset inside the component. Pins are centred vertically, 20 px apart. */
function pinY(i: number, count: number, h: number): number {
  return h / 2 + (i - (count - 1) / 2) * 20
}

export function inputPos(c: Comp, i: number): { x: number; y: number } {
  const h = compHeight(c)
  return { x: c.x, y: c.y + pinY(i, inputNames(c).length, h) }
}

export function outputPos(c: Comp, i: number): { x: number; y: number } {
  const h = compHeight(c)
  return { x: c.x + compWidth(c), y: c.y + pinY(i, outputNames(c).length, h) }
}
