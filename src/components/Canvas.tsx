import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { addComp, addWire, bounds, displayName, updateComp, wireKey } from '../lib/circuit'
import { inputValue, isConnected, outputValue, type Sim } from '../lib/sim'
import { pathD, routePoints, type Pt } from '../lib/route'
import {
  compHeight, compWidth, DEFS, inputNames, inputPos, outputNames, outputPos,
  type Circuit, type Comp, type CompType,
} from '../lib/types'
import type { T } from '../i18n'
import { Body } from './Shapes'

export type Selection = { kind: 'comp'; id: number } | { kind: 'wire'; key: string } | null

export interface AddRequest { type: CompType; nonce: number }

interface Props {
  circuit: Circuit
  sim: Sim
  selection: Selection
  fitToken: number
  addRequest: AddRequest | null
  t: T
  onSelect: (s: Selection) => void
  /** `record` is true for the first change of a user action, so one undo step covers a whole drag. */
  onEdit: (next: Circuit, record: boolean) => void
  onToggle: (id: number) => void
}

interface View { x: number; y: number; k: number }
interface PinRef { comp: number; pin: number; out: boolean }

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'move'; id: number; dx: number; dy: number; sx: number; sy: number; moved: boolean }
  | { kind: 'wire'; from: PinRef }

const snap = (v: number) => Math.round(v / 10) * 10
const sizeOf = (k: Comp) => ({ w: compWidth(k), h: compHeight(k) })

function pinPoint(c: Circuit, p: PinRef): Pt {
  const k = c.comps.find((q) => q.id === p.comp)!
  return p.out ? outputPos(k, p.pin) : inputPos(k, p.pin)
}

export default function Canvas({ circuit, sim, selection, fitToken, addRequest, t, onSelect, onEdit, onToggle }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const [view, setView] = useState<View>({ x: 40, y: 40, k: 1 })
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [wiring, setWiring] = useState<PinRef | null>(null)
  const drag = useRef<Drag | null>(null)
  const latest = useRef({ circuit, view })
  useLayoutEffect(() => {
    latest.current = { circuit, view }
  })

  const world = (e: { clientX: number; clientY: number }): Pt => {
    const r = svg.current!.getBoundingClientRect()
    const { view: v } = latest.current
    return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k }
  }

  const fit = () => {
    const el = svg.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const b = bounds(latest.current.circuit, sizeOf)
    if (b.w === 0) return setView({ x: 40, y: 40, k: 1 })
    const pad = 40
    const k = Math.min(1.4, Math.max(0.2, Math.min((r.width - 2 * pad) / b.w, (r.height - 2 * pad) / b.h)))
    setView({ k, x: (r.width - b.w * k) / 2 - b.x * k, y: (r.height - b.h * k) / 2 - b.y * k })
  }

  // Fit when asked (example loaded, file opened, first render).
  useEffect(fit, [fitToken])

  // Add a part at the centre of the visible area (palette click).
  const handled = useRef(0)
  useEffect(() => {
    if (!addRequest || handled.current === addRequest.nonce) return
    handled.current = addRequest.nonce
    const r = svg.current!.getBoundingClientRect()
    const { circuit: c, view: v } = latest.current
    const h = compHeight({ type: addRequest.type })
    let x = snap((r.width / 2 - v.x) / v.k - compWidth({ type: addRequest.type }) / 2)
    let y = snap((r.height / 2 - v.y) / v.k - h / 2)
    const w = compWidth({ type: addRequest.type })
    const overlaps = () =>
      c.comps.some((k) => x < k.x + compWidth(k) + 10 && k.x < x + w + 10 && y < k.y + compHeight(k) + 10 && k.y < y + h + 10)
    for (let i = 0; i < 50 && overlaps(); i++) { x += 20; y += 20 }
    const res = addComp(c, addRequest.type, x, y)
    onEdit(res.circuit, true)
    onSelect({ kind: 'comp', id: res.id })
  }, [addRequest, onEdit, onSelect])

  // Non-passive wheel listener so the page does not scroll while zooming.
  useEffect(() => {
    const el = svg.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setView((v) => {
        const k = Math.min(3, Math.max(0.2, v.k * Math.exp(-e.deltaY * 0.0015)))
        const px = e.clientX - r.left
        const py = e.clientY - r.top
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (f: number) => {
    const r = svg.current!.getBoundingClientRect()
    setView((v) => {
      const k = Math.min(3, Math.max(0.2, v.k * f))
      const px = r.width / 2
      const py = r.height / 2
      return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k }
    })
  }

  const capture = (e: RPointerEvent) => {
    try {
      svg.current!.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic or already-released pointer */
    }
  }

  const onBgDown = (e: RPointerEvent) => {
    capture(e)
    onSelect(null)
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
  }

  const onCompDown = (e: RPointerEvent, k: Comp) => {
    e.stopPropagation()
    capture(e)
    const w = world(e)
    onSelect({ kind: 'comp', id: k.id })
    drag.current = { kind: 'move', id: k.id, dx: w.x - k.x, dy: w.y - k.y, sx: e.clientX, sy: e.clientY, moved: false }
  }

  const onPinDown = (e: RPointerEvent, p: PinRef) => {
    e.stopPropagation()
    capture(e)
    drag.current = { kind: 'wire', from: p }
    setWiring(p)
    setCursor(world(e))
  }

  const nearestPin = (w: Pt, wantOut: boolean): PinRef | null => {
    let best: PinRef | null = null
    let bd = 14 * 14
    for (const k of latest.current.circuit.comps) {
      const n = wantOut ? outputNames(k).length : inputNames(k).length
      for (let i = 0; i < n; i++) {
        const p = wantOut ? outputPos(k, i) : inputPos(k, i)
        const d = (p.x - w.x) ** 2 + (p.y - w.y) ** 2
        if (d < bd) { bd = d; best = { comp: k.id, pin: i, out: wantOut } }
      }
    }
    return best
  }

  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }))
    } else if (d.kind === 'move') {
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return
      const w = world(e)
      const x = snap(w.x - d.dx)
      const y = snap(w.y - d.dy)
      const k = latest.current.circuit.comps.find((q) => q.id === d.id)
      if (!k || (k.x === x && k.y === y)) return
      onEdit(updateComp(latest.current.circuit, d.id, { x, y }), !d.moved)
      d.moved = true
    } else {
      setCursor(world(e))
    }
  }

  const onUp = (e: RPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'move' && !d.moved) {
      const k = latest.current.circuit.comps.find((q) => q.id === d.id)
      if (k?.type === 'SWITCH') onToggle(k.id)
    } else if (d.kind === 'wire') {
      const target = nearestPin(world(e), !d.from.out)
      if (target) {
        const [o, i] = d.from.out ? [d.from, target] : [target, d.from]
        onEdit(addWire(latest.current.circuit, [o.comp, o.pin], [i.comp, i.pin]), true)
      }
      setWiring(null)
      setCursor(null)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('text/x-gate') as CompType
    if (!(type in DEFS)) return
    const w = world(e)
    const x = snap(w.x - compWidth({ type }) / 2)
    const y = snap(w.y - compHeight({ type }) / 2)
    const res = addComp(circuit, type, x, y)
    onEdit(res.circuit, true)
    onSelect({ kind: 'comp', id: res.id })
  }

  const sel = selection?.kind === 'comp' ? selection.id : -1
  const selWire = selection?.kind === 'wire' ? selection.key : ''

  return (
    <div className="canvas-wrap">
      <svg
        ref={svg}
        className="canvas"
        role="img"
        aria-label={t('Circuit canvas')}
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <defs>
          <pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <circle cx={0} cy={0} r={0.9} className="dot" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {circuit.wires.map((w) => {
            const a = circuit.comps.find((k) => k.id === w.from[0])
            const b = circuit.comps.find((k) => k.id === w.to[0])
            if (!a || !b) return null
            const key = wireKey(w)
            const d = pathD(routePoints(outputPos(a, w.from[1]), inputPos(b, w.to[1]), a.id * 3 + w.to[1] + b.id))
            const on = outputValue(sim, a.id, w.from[1]) === 1
            return (
              <g key={key}>
                <path d={d} className="wire-hit" onPointerDown={(e) => { e.stopPropagation(); onSelect({ kind: 'wire', key }) }} />
                <path d={d} className={`wire${on ? ' on' : ''}${key === selWire ? ' selected' : ''}`} />
              </g>
            )
          })}
          {circuit.comps.map((k) => {
            const w = compWidth(k)
            const h = compHeight(k)
            const pins = {
              ins: inputNames(k).map((_, i) => inputValue(sim, k.id, i)),
              outs: outputNames(k).map((_, i) => outputValue(sim, k.id, i)),
              connected: inputNames(k).map((_, i) => isConnected(sim, k.id, i)),
            }
            const name = k.type === 'SWITCH' || k.type === 'LED' ? displayName(circuit, k) : (k.label ?? '')
            return (
              <g key={k.id} transform={`translate(${k.x} ${k.y})`} className={k.type === 'SWITCH' ? 'comp clickable' : 'comp'}>
                {k.id === sel && <rect x={-4} y={-4} width={w + 8} height={h + 8} rx={6} className="sel" />}
                <g onPointerDown={(e) => onCompDown(e, k)}>
                  <rect x={0} y={0} width={w} height={h} fill="transparent" />
                  <Body k={k} pins={pins} />
                </g>
                {name && <text x={w / 2} y={-7} className="name">{name}</text>}
                {inputNames(k).map((_, i) => {
                  const p = inputPos({ ...k, x: 0, y: 0 }, i)
                  return (
                    <g key={`i${i}`} onPointerDown={(e) => onPinDown(e, { comp: k.id, pin: i, out: false })}>
                      <circle cx={p.x} cy={p.y} r={10} fill="transparent" className="pin-hit" />
                      <circle cx={p.x} cy={p.y} r={3.5} className={pins.connected[i] ? (pins.ins[i] ? 'pin on' : 'pin conn') : 'pin'} />
                    </g>
                  )
                })}
                {outputNames(k).map((_, i) => {
                  const p = outputPos({ ...k, x: 0, y: 0 }, i)
                  return (
                    <g key={`o${i}`} onPointerDown={(e) => onPinDown(e, { comp: k.id, pin: i, out: true })}>
                      <circle cx={p.x} cy={p.y} r={10} fill="transparent" className="pin-hit" />
                      <circle cx={p.x} cy={p.y} r={3.5} className={pins.outs[i] ? 'pin on' : 'pin conn'} />
                    </g>
                  )
                })}
              </g>
            )
          })}
          {wiring && cursor && (() => {
            const a = pinPoint(circuit, wiring)
            const pts = wiring.out ? routePoints(a, cursor) : routePoints(cursor, a)
            return <path d={pathD(pts)} className="wire preview" />
          })()}
        </g>
      </svg>
      <div className="zoom">
        <button className="small" onClick={() => zoomBy(1.25)} aria-label={t('Zoom in')} title={t('Zoom in')}>+</button>
        <button className="small" onClick={() => zoomBy(0.8)} aria-label={t('Zoom out')} title={t('Zoom out')}>{'−'}</button>
        <button className="small" onClick={fit}>{t('Fit')}</button>
      </div>
      {circuit.comps.length === 0 && <div className="empty">{t('Drag parts from the left, or open an example.')}</div>}
    </div>
  )
}
