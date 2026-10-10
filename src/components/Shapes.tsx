import { HEX_SEGS } from '../lib/logic'
import { compHeight, compWidth, DEFS, inputNames, inputPos, outputNames, outputPos, type Comp } from '../lib/types'

/** Pin values for drawing: what each input reads and what each output drives. */
export interface PinState {
  ins: number[]
  outs: number[]
  connected: boolean[]
}

const hbar = (x1: number, x2: number, y: number) =>
  `${x1},${y} ${x1 + 3},${y - 3} ${x2 - 3},${y - 3} ${x2},${y} ${x2 - 3},${y + 3} ${x1 + 3},${y + 3}`
const vbar = (x: number, y1: number, y2: number) =>
  `${x},${y1} ${x + 3},${y1 + 3} ${x + 3},${y2 - 3} ${x},${y2} ${x - 3},${y2 - 3} ${x - 3},${y1 + 3}`

const SEGMENTS: Record<string, string> = {
  a: hbar(5, 25, 3), g: hbar(5, 25, 27), d: hbar(5, 25, 51),
  f: vbar(3, 5, 25), b: vbar(27, 5, 25), e: vbar(3, 29, 49), c: vbar(27, 29, 49),
}

function Digit({ x, y, lit }: { x: number; y: number; lit: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {Object.entries(SEGMENTS).map(([name, pts]) => (
        <polygon key={name} points={pts} className={lit.includes(name) ? 'seg on' : 'seg'} />
      ))}
    </g>
  )
}

function gateBody(type: string, h: number): { d: string; extra?: string; invert: boolean } {
  const m = h / 2
  const invert = type === 'NAND' || type === 'NOR' || type === 'XNOR'
  if (type === 'AND' || type === 'NAND') {
    return { d: `M8,2 H28 A24,${m - 2} 0 0 1 28,${h - 2} H8 Z`, invert }
  }
  const d = `M8,2 H22 Q42,2 52,${m} Q42,${h - 2} 22,${h - 2} H8 Q18,${m} 8,2 Z`
  const extra = type === 'XOR' || type === 'XNOR' ? `M2,2 Q12,${m} 2,${h - 2}` : undefined
  return { d, extra, invert }
}

const TITLES: Partial<Record<Comp['type'], string>> = { DFF: 'DFF', TFF: 'TFF', JKFF: 'JK', SRL: 'SR', MUX: 'MUX', HA: 'HA', FA: 'FA' }

/** Draws one component body in its own coordinates (origin = top-left). Pins are drawn by the caller. */
export function Body({ k, pins }: { k: Comp; pins: PinState }) {
  const w = compWidth(k)
  const h = compHeight(k)
  const type = k.type
  const ins = inputNames(k)
  const outs = outputNames(k)
  const stubs = (
    <>
      {ins.map((_, i) => {
        const p = inputPos({ ...k, x: 0, y: 0 }, i)
        return <line key={`i${i}`} x1={0} y1={p.y} x2={type === 'LED' ? 6 : 14} y2={p.y} className={pins.ins[i] ? 'stub on' : 'stub'} />
      })}
      {outs.map((_, i) => {
        const p = outputPos({ ...k, x: 0, y: 0 }, i)
        return <line key={`o${i}`} x1={w - (DEFS[type].cat === 'gate' ? 10 : 14)} y1={p.y} x2={w} y2={p.y} className={pins.outs[i] ? 'stub on' : 'stub'} />
      })}
    </>
  )
  if (type === 'SWITCH') {
    const on = pins.outs[0] === 1
    return (
      <>
        {stubs}
        <rect x={2} y={2} width={36} height={36} rx={7} className={on ? 'shape on' : 'shape'} />
        <text x={20} y={15} className="bit">{on ? 1 : 0}</text>
        <rect x={7} y={20} width={26} height={14} rx={7} className="slot" />
        <circle cx={on ? 26 : 14} cy={27} r={5.5} className="knob" />
      </>
    )
  }
  if (type === 'CLOCK') {
    const on = pins.outs[0] === 1
    return (
      <>
        {stubs}
        <rect x={2} y={2} width={36} height={36} rx={7} className={on ? 'shape on' : 'shape'} />
        <polyline points="8,26 8,14 16,14 16,26 24,26 24,14 32,14" className="wave" />
        <text x={20} y={35} className="tiny">CLK</text>
      </>
    )
  }
  if (type === 'HIGH' || type === 'LOW') {
    return (
      <>
        {stubs}
        <rect x={6} y={6} width={28} height={28} rx={6} className={type === 'HIGH' ? 'shape on' : 'shape'} />
        <text x={20} y={26} className="bit big">{type === 'HIGH' ? 1 : 0}</text>
      </>
    )
  }
  if (type === 'LED') {
    return (
      <>
        {stubs}
        <circle cx={20} cy={20} r={14} className={pins.ins[0] ? 'led on' : 'led'} />
        <circle cx={15} cy={15} r={4} className="gloss" />
      </>
    )
  }
  if (type === 'SEG7' || type === 'HEX') {
    let lit = ''
    if (type === 'SEG7') lit = 'abcdefg'.split('').filter((_, i) => pins.ins[i]).join('')
    else lit = HEX_SEGS[pins.ins[0] + 2 * pins.ins[1] + 4 * pins.ins[2] + 8 * pins.ins[3]]
    return (
      <>
        {stubs}
        <rect x={8} y={2} width={w - 16} height={h - 4} rx={4} className="shape display" />
        <Digit x={(w - 30) / 2} y={(h - 54) / 2} lit={lit} />
        {ins.map((n, i) => (
          <text key={n} x={12} y={inputPos({ ...k, x: 0, y: 0 }, i).y + 3} className="pinlabel">{n}</text>
        ))}
      </>
    )
  }
  if (type === 'NOT' || type === 'BUF') {
    const inv = type === 'NOT'
    return (
      <>
        {stubs}
        <path d={`M10,6 V${h - 6} L${inv ? 50 : 54},${h / 2} Z`} className="shape" />
        {inv && <circle cx={54} cy={h / 2} r={4} className="shape bubble" />}
      </>
    )
  }
  if (DEFS[type].cat === 'gate') {
    const { d, extra, invert } = gateBody(type, h)
    return (
      <>
        {stubs}
        <path d={d} className="shape" />
        {extra && <path d={extra} className="line" />}
        {invert && <circle cx={56} cy={h / 2} r={4} className="shape bubble" />}
      </>
    )
  }
  // flip-flops, latch, mux, adders
  return (
    <>
      {stubs}
      <rect x={8} y={2} width={w - 16} height={h - 4} rx={4} className="shape" />
      <text x={w / 2} y={h / 2 + 4} className="title">{TITLES[type]}</text>
      {ins.map((n, i) => (
        <text key={`i${i}`} x={12} y={inputPos({ ...k, x: 0, y: 0 }, i).y + 3} className="pinlabel">{n}</text>
      ))}
      {outs.map((n, i) => (
        <text key={`o${i}`} x={w - 12} y={outputPos({ ...k, x: 0, y: 0 }, i).y + 3} className="pinlabel end">{n}</text>
      ))}
    </>
  )
}
