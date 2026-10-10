import { describe, expect, it } from 'vitest'
import { addComp, addWire, decodeShare, displayName, encodeShare, EMPTY, parseCircuit, removeComp, setInputCount, structKey } from './circuit'
import { EXAMPLES } from './examples'
import { routePoints, pathD } from './route'
import { inputPos, outputPos, compHeight } from './types'

describe('circuit editing', () => {
  it('replaces the wire into an input that is already driven', () => {
    let c = EMPTY
    const a = addComp(c, 'SWITCH', 0, 0); c = a.circuit
    const b = addComp(c, 'SWITCH', 0, 50); c = b.circuit
    const l = addComp(c, 'LED', 100, 0); c = l.circuit
    c = addWire(c, [a.id, 0], [l.id, 0])
    c = addWire(c, [b.id, 0], [l.id, 0])
    expect(c.wires).toEqual([{ from: [b.id, 0], to: [l.id, 0] }])
  })
  it('ignores wires to missing pins', () => {
    const a = addComp(EMPTY, 'AND', 0, 0)
    const c = addWire(a.circuit, [a.id, 3], [a.id, 0])
    expect(c.wires).toHaveLength(0)
  })
  it('deleting a part removes its wires; shrinking a gate drops dangling wires', () => {
    let c = EMPTY
    const s = addComp(c, 'SWITCH', 0, 0); c = s.circuit
    const g = addComp(c, 'AND', 100, 0); c = g.circuit
    c = setInputCount(c, g.id, 3)
    c = addWire(c, [s.id, 0], [g.id, 2])
    expect(c.wires).toHaveLength(1)
    expect(setInputCount(c, g.id, 2).wires).toHaveLength(0)
    expect(removeComp(c, s.id).wires).toHaveLength(0)
  })
  it('structKey ignores positions and switch values', () => {
    const c = EXAMPLES[0].build()
    const moved = { ...c, comps: c.comps.map((k) => ({ ...k, x: k.x + 10, value: 1 as const })) }
    expect(structKey(moved)).toBe(structKey(c))
    expect(structKey(addComp(c, 'NOT', 0, 0).circuit)).not.toBe(structKey(c))
  })
  it('names switches A, B, C and LEDs Y0, Y1', () => {
    let c = EMPTY
    for (const t of ['SWITCH', 'SWITCH', 'LED'] as const) c = addComp(c, t, 0, 0).circuit
    expect(c.comps.map((k) => displayName(c, k))).toEqual(['A', 'B', 'Y0'])
  })
})

describe('pins', () => {
  it('are 20 px apart and centred', () => {
    const k = { id: 1, type: 'AND' as const, x: 100, y: 200 }
    expect(inputPos(k, 0)).toEqual({ x: 100, y: 210 })
    expect(inputPos(k, 1)).toEqual({ x: 100, y: 230 })
    expect(outputPos(k, 0)).toEqual({ x: 160, y: 220 })
    expect(compHeight({ type: 'FA' })).toBe(60)
  })
})

describe('parseCircuit', () => {
  it('accepts every example and round-trips', () => {
    for (const e of EXAMPLES) {
      const c = e.build()
      expect(parseCircuit(JSON.parse(JSON.stringify(c)))).toEqual(c)
    }
  })
  it('rejects bad data', () => {
    expect(() => parseCircuit(null)).toThrow()
    expect(() => parseCircuit({ comps: [{ id: 1, type: 'WAT', x: 0, y: 0 }], wires: [] })).toThrow(/Unknown/)
    expect(() => parseCircuit({ comps: [{ id: 1, type: 'AND', x: 0, y: 0 }], wires: [{ from: [1, 0], to: [1, 5] }] })).toThrow(/pin/)
    expect(() => parseCircuit({ comps: [{ id: 1, type: 'AND', x: 0, y: 0 }, { id: 1, type: 'AND', x: 0, y: 0 }], wires: [] })).toThrow()
    expect(() =>
      parseCircuit({
        comps: [{ id: 1, type: 'SWITCH', x: 0, y: 0 }, { id: 2, type: 'SWITCH', x: 0, y: 0 }, { id: 3, type: 'LED', x: 0, y: 0 }],
        wires: [{ from: [1, 0], to: [3, 0] }, { from: [2, 0], to: [3, 0] }],
      }),
    ).toThrow(/two wires/)
  })
})

describe('share links', () => {
  it('round-trips a circuit through a URL-safe string', async () => {
    const c = EXAMPLES.find((e) => e.id === 'ripple')!.build()
    const s = await encodeShare(c)
    expect(s).toMatch(/^[zj][A-Za-z0-9_-]+$/)
    expect(await decodeShare(s)).toEqual(c)
  })
  it('rejects garbage', async () => {
    await expect(decodeShare('xabc')).rejects.toThrow()
  })
})

describe('wire routing', () => {
  const horizontal = (p: { x: number; y: number }[]) => p.every((q, i) => i === 0 || q.x === p[i - 1].x || q.y === p[i - 1].y)
  it('is orthogonal and joins both pins, forward and backward', () => {
    for (const [a, b] of [[{ x: 0, y: 0 }, { x: 200, y: 80 }], [{ x: 200, y: 0 }, { x: 20, y: 40 }], [{ x: 0, y: 5 }, { x: 100, y: 5 }]]) {
      const p = routePoints(a, b, 3)
      expect(p[0]).toEqual(a)
      expect(p[p.length - 1]).toEqual(b)
      expect(horizontal(p)).toBe(true)
    }
    expect(pathD(routePoints({ x: 0, y: 0 }, { x: 100, y: 0 }))).toBe('M0,0 L100,0')
  })
})
