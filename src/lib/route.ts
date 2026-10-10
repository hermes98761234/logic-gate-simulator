export interface Pt { x: number; y: number }

/** Orthogonal wire route from an output pin to an input pin. `seed` spreads parallel wires apart. */
export function routePoints(a: Pt, b: Pt, seed = 0): Pt[] {
  const s = Math.abs(Math.round(seed))
  if (b.x - a.x >= 28) {
    if (a.y === b.y) return [a, b]
    const mid = Math.round((a.x + b.x) / 2 + ((s % 5) - 2) * 6)
    const mx = Math.min(b.x - 14, Math.max(a.x + 14, mid))
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b]
  }
  // Backward or very tight: leave to the right, run below both pins, and come in from the left.
  const ym = Math.max(a.y, b.y) + 30 + (s % 3) * 8
  return [a, { x: a.x + 14, y: a.y }, { x: a.x + 14, y: ym }, { x: b.x - 14, y: ym }, { x: b.x - 14, y: b.y }, b]
}

export function pathD(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
}
