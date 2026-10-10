import { DEFS, inputNames, outputNames, type Circuit, type Comp, type CompType, type Wire } from './types'

export const EMPTY: Circuit = { comps: [], wires: [] }

export function nextId(c: Circuit): number {
  return c.comps.reduce((m, k) => Math.max(m, k.id), 0) + 1
}

export function addComp(c: Circuit, type: CompType, x: number, y: number): { circuit: Circuit; id: number } {
  const id = nextId(c)
  const comp: Comp = { id, type, x, y }
  if (type === 'SWITCH') comp.value = 0
  return { circuit: { ...c, comps: [...c.comps, comp] }, id }
}

export function updateComp(c: Circuit, id: number, patch: Partial<Comp>): Circuit {
  return { ...c, comps: c.comps.map((k) => (k.id === id ? { ...k, ...patch } : k)) }
}

export function removeComp(c: Circuit, id: number): Circuit {
  return {
    comps: c.comps.filter((k) => k.id !== id),
    wires: c.wires.filter((w) => w.from[0] !== id && w.to[0] !== id),
  }
}

/** Changes the input count of a gate and drops wires to pins that no longer exist. */
export function setInputCount(c: Circuit, id: number, n: number): Circuit {
  const k = c.comps.find((q) => q.id === id)
  if (!k || !DEFS[k.type].variadic) return c
  const count = Math.min(4, Math.max(2, n))
  return {
    comps: c.comps.map((q) => (q.id === id ? { ...q, n: count } : q)),
    wires: c.wires.filter((w) => w.to[0] !== id || w.to[1] < count),
  }
}

export const wireKey = (w: Wire) => `${w.from[0]}.${w.from[1]}>${w.to[0]}.${w.to[1]}`

/** Connects an output to an input. An input has one driver, so an existing wire into it is replaced. */
export function addWire(c: Circuit, from: [number, number], to: [number, number]): Circuit {
  const a = c.comps.find((k) => k.id === from[0])
  const b = c.comps.find((k) => k.id === to[0])
  if (!a || !b) return c
  if (from[1] < 0 || from[1] >= outputNames(a).length) return c
  if (to[1] < 0 || to[1] >= inputNames(b).length) return c
  const wires = c.wires.filter((w) => !(w.to[0] === to[0] && w.to[1] === to[1]))
  return { ...c, wires: [...wires, { from, to }] }
}

export function removeWire(c: Circuit, key: string): Circuit {
  return { ...c, wires: c.wires.filter((w) => wireKey(w) !== key) }
}

/** Changes whenever the wiring or the set of parts changes; ignores positions, labels and switch values. */
export function structKey(c: Circuit): string {
  return c.comps.map((k) => `${k.id}${k.type}${k.n ?? ''}`).join(',') + '|' + c.wires.map(wireKey).join(',')
}

/** The name shown for a part: its label, or A, B, C… for switches and Y0, Y1… for LEDs. */
export function displayName(c: Circuit, k: Comp): string {
  if (k.label) return k.label
  if (k.type === 'SWITCH') {
    const n = c.comps.filter((q) => q.type === 'SWITCH').findIndex((q) => q.id === k.id)
    return n < 26 ? String.fromCharCode(65 + n) : `S${n}`
  }
  if (k.type === 'LED') return `Y${c.comps.filter((q) => q.type === 'LED').findIndex((q) => q.id === k.id)}`
  return ''
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Validates untrusted JSON and returns a clean circuit. Throws an Error with a readable reason. */
export function parseCircuit(data: unknown): Circuit {
  if (typeof data !== 'object' || data === null) throw new Error('Not a circuit file')
  const d = data as { comps?: unknown; wires?: unknown }
  if (!Array.isArray(d.comps) || !Array.isArray(d.wires)) throw new Error('Not a circuit file')
  if (d.comps.length > 2000 || d.wires.length > 6000) throw new Error('Circuit is too large')
  const comps: Comp[] = []
  const seen = new Set<number>()
  for (const raw of d.comps as Record<string, unknown>[]) {
    if (typeof raw !== 'object' || raw === null) throw new Error('Bad component')
    const { id, type, x, y, label, n, value } = raw
    if (!isNum(id) || !Number.isInteger(id) || seen.has(id)) throw new Error('Bad component id')
    if (typeof type !== 'string' || !(type in DEFS)) throw new Error(`Unknown component type: ${String(type)}`)
    if (!isNum(x) || !isNum(y)) throw new Error('Bad component position')
    seen.add(id)
    const k: Comp = { id, type: type as CompType, x: Math.round(x), y: Math.round(y) }
    if (typeof label === 'string' && label) k.label = label.slice(0, 24)
    if (DEFS[k.type].variadic && isNum(n) && n >= 2 && n <= 4) k.n = Math.round(n)
    if (k.type === 'SWITCH') k.value = value === 1 ? 1 : 0
    comps.push(k)
  }
  const byId = new Map(comps.map((k) => [k.id, k]))
  const wires: Wire[] = []
  const driven = new Set<string>()
  for (const raw of d.wires as { from?: unknown; to?: unknown }[]) {
    const f = raw?.from
    const t = raw?.to
    if (!Array.isArray(f) || !Array.isArray(t) || f.length !== 2 || t.length !== 2) throw new Error('Bad wire')
    const [fa, fp] = f as unknown[]
    const [ta, tp] = t as unknown[]
    if (!isNum(fa) || !isNum(fp) || !isNum(ta) || !isNum(tp)) throw new Error('Bad wire')
    const a = byId.get(fa)
    const b = byId.get(ta)
    if (!a || !b) throw new Error('Wire to a missing component')
    if (!Number.isInteger(fp) || fp < 0 || fp >= outputNames(a).length) throw new Error('Wire from a missing pin')
    if (!Number.isInteger(tp) || tp < 0 || tp >= inputNames(b).length) throw new Error('Wire to a missing pin')
    const key = `${ta}.${tp}`
    if (driven.has(key)) throw new Error('An input has two wires')
    driven.add(key)
    wires.push({ from: [fa, fp], to: [ta, tp] })
  }
  return { comps, wires }
}

// --- sharing -------------------------------------------------------------

const b64 = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64 = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const w = stream.writable.getWriter()
  void w.write(bytes as BufferSource).catch(() => {})
  void w.close().catch(() => {})
  return new Uint8Array(await new Response(stream.readable).arrayBuffer())
}

/** Compact URL-safe text for a circuit: "z" + deflate when available, otherwise "j" + plain JSON. */
export async function encodeShare(c: Circuit): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(c))
  if (typeof CompressionStream !== 'undefined') return 'z' + b64(await pipe(bytes, new CompressionStream('deflate-raw')))
  return 'j' + b64(bytes)
}

export async function decodeShare(s: string): Promise<Circuit> {
  const kind = s[0]
  const raw = unb64(s.slice(1))
  let bytes: Uint8Array
  if (kind === 'z') bytes = await pipe(raw, new DecompressionStream('deflate-raw'))
  else if (kind === 'j') bytes = raw
  else throw new Error('Bad link')
  return parseCircuit(JSON.parse(new TextDecoder().decode(bytes)))
}

export function bounds(c: Circuit, size: (k: Comp) => { w: number; h: number }) {
  if (c.comps.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const k of c.comps) {
    const s = size(k)
    x0 = Math.min(x0, k.x); y0 = Math.min(y0, k.y)
    x1 = Math.max(x1, k.x + s.w); y1 = Math.max(y1, k.y + s.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
