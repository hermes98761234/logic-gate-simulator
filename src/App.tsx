import { useEffect, useReducer, useRef, useState } from 'react'
import {
  decodeShare, displayName, EMPTY, encodeShare, parseCircuit, removeComp, removeWire, setInputCount, structKey, updateComp,
} from './lib/circuit'
import { EXAMPLES } from './lib/examples'
import { createSim, getInput, resetSim, setInput, settle, tick, type Sim } from './lib/sim'
import { rowIndex } from './lib/truth'
import { DEFS, type Circuit, type CompType, type Lang, type Theme } from './lib/types'
import { N, tr, type T } from './i18n'
import Canvas, { type AddRequest, type Selection } from './components/Canvas'
import Palette from './components/Palette'
import TruthPanel from './components/TruthPanel'

const KEY = 'logic-gate-simulator:v1'
const SPEEDS = [1, 2, 4, 8, 16]

interface Settings { lang: Lang; theme: Theme; speed: number }
const DEFAULTS: Settings = { lang: 'en', theme: 'auto', speed: 4 }

function load(): { settings: Settings; circuit: Circuit } {
  const fallback = { settings: DEFAULTS, circuit: EXAMPLES[1].build() }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!raw) return fallback
    const s = raw.settings ?? {}
    const settings: Settings = {
      lang: s.lang === 'uk' ? 'uk' : s.lang === 'en' ? 'en' : navigator.language.startsWith('uk') ? 'uk' : 'en',
      theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'auto',
      speed: SPEEDS.includes(s.speed) ? s.speed : DEFAULTS.speed,
    }
    return { settings, circuit: raw.circuit ? parseCircuit(raw.circuit) : fallback.circuit }
  } catch {
    return fallback
  }
}

export default function App() {
  const [init] = useState(load)
  const [settings, setSettings] = useState<Settings>(init.settings)
  const [circuit, setCircuit] = useState<Circuit>(init.circuit)
  const [undo, setUndo] = useState<Circuit[]>([])
  const [redo, setRedo] = useState<Circuit[]>([])
  const [selection, setSelection] = useState<Selection>(null)
  const [running, setRunning] = useState(false)
  const [osc, setOsc] = useState(false)
  const [truthOpen, setTruthOpen] = useState(true)
  const [fitToken, setFitToken] = useState(0)
  const [addRequest, setAddRequest] = useState<AddRequest | null>(null)
  const [toast, setToast] = useState<{ msg: string; args: (string | number)[] } | null>(null)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const fileInput = useRef<HTMLInputElement>(null)
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)

  const circuitRef = useRef(circuit)
  useEffect(() => {
    circuitRef.current = circuit
  })

  // The simulator is rebuilt only when the wiring changes, not when parts are moved or switches flipped.
  const structure = structKey(circuit)
  const [simState, setSimState] = useState<{ key: string; sim: Sim }>(() => ({ key: structure, sim: createSim(circuit) }))
  let current = simState
  if (simState.key !== structure) {
    current = { key: structure, sim: createSim(circuit) }
    setSimState(current)
  }
  const sim = current.sim

  const say = (msg: string, ...args: (string | number)[]) => {
    const next = { msg, args }
    setToast(next)
    window.setTimeout(() => setToast((m) => (m === next ? null : m)), 3500)
  }

  const edit = (next: Circuit, record: boolean) => {
    if (record) {
      setUndo((u) => [...u.slice(-99), circuitRef.current])
      setRedo([])
    }
    setCircuit(next)
  }

  const replaceCircuit = (next: Circuit) => {
    edit(next, true)
    setSelection(null)
    setRunning(false)
    setOsc(false)
    setFitToken((n) => n + 1)
  }

  const doUndo = () => {
    const prev = undo[undo.length - 1]
    if (!prev) return
    setUndo(undo.slice(0, -1))
    setRedo([...redo, circuit])
    setCircuit(prev)
    setSelection(null)
  }
  const doRedo = () => {
    const next = redo[redo.length - 1]
    if (!next) return
    setRedo(redo.slice(0, -1))
    setUndo([...undo, circuit])
    setCircuit(next)
    setSelection(null)
  }

  const toggle = (id: number) => {
    const v = getInput(sim, id) ^ 1
    setInput(sim, id, v)
    setOsc(!settle(sim))
    setCircuit((c) => updateComp(c, id, { value: v as 0 | 1 }))
  }

  const doTick = () => {
    setOsc(!tick(sim))
    bump()
  }

  const deleteSelection = () => {
    if (!selection) return
    edit(selection.kind === 'comp' ? removeComp(circuit, selection.id) : removeWire(circuit, selection.key), true)
    setSelection(null)
  }

  // Persist settings and circuit.
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ settings, circuit }))
    } catch {
      /* storage may be unavailable */
    }
  }, [settings, circuit])

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.lang = settings.lang
  }, [settings.theme, settings.lang])

  // Clock loop.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      setOsc(!tick(sim))
      bump()
    }, 1000 / settings.speed)
    return () => window.clearInterval(id)
  }, [running, settings.speed, sim])

  // Open a circuit shared in the URL hash (#c=...).
  useEffect(() => {
    const m = /^#c=(.+)$/.exec(location.hash)
    if (!m) return
    decodeShare(m[1]).then(
      (c) => {
        setCircuit(c)
        setUndo([])
        setRedo([])
        setFitToken((n) => n + 1)
        history.replaceState(null, '', location.pathname + location.search)
      },
      () => say(N('The shared link could not be opened.')),
    )
  }, [])

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, select, textarea')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) doRedo()
        else doUndo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        doRedo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelection()
      } else if (e.key === 'Escape') setSelection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const save = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(circuit, null, 1)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'circuit.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const open = async (file: File | undefined) => {
    if (!file) return
    try {
      replaceCircuit(parseCircuit(JSON.parse(await file.text())))
    } catch (e) {
      say(N('Could not open the file: {0}'), e instanceof Error ? e.message : String(e))
    }
  }

  const share = async () => {
    const url = `${location.origin}${location.pathname}#c=${await encodeShare(circuit)}`
    try {
      await navigator.clipboard.writeText(url)
      say(N('Link copied to the clipboard.'))
    } catch {
      history.replaceState(null, '', url.slice(url.indexOf('#')))
      say(N('Copy the link from the address bar.'))
    }
  }

  const selComp = selection?.kind === 'comp' ? circuit.comps.find((k) => k.id === selection.id) : undefined
  const switches = circuit.comps.filter((k) => k.type === 'SWITCH')
  const active = rowIndex(switches.map((k) => getInput(sim, k.id)))
  const hasClock = circuit.comps.some((k) => k.type === 'CLOCK')
  const setS = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{t('Logic gate simulator')}</span>
        <span className="hint">{t('Build digital circuits, flip switches and watch the signals.')}</span>
      </header>
      <div className="body">
        <aside className="side">
          <div className="panel">
            <div className="section">
              <h3>{t('Examples')}</h3>
              <div className="examples">
                {EXAMPLES.map((e) => (
                  <button key={e.id} className="example" title={t(e.note)} onClick={() => replaceCircuit(e.build())}>
                    {t(e.title)}
                  </button>
                ))}
              </div>
            </div>
            <Palette t={t} onAdd={(type: CompType) => setAddRequest((r) => ({ type, nonce: (r?.nonce ?? 0) + 1 }))} />
            <div className="section">
              <h3>{t('Settings')}</h3>
              <div className="grid2">
                <div className="field">
                  <label htmlFor="lang">{t('Language')}</label>
                  <select id="lang" value={settings.lang} onChange={(e) => setS({ lang: e.target.value as Lang })}>
                    <option value="en">English</option>
                    <option value="uk">Українська</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="theme">{t('Theme')}</label>
                  <select id="theme" value={settings.theme} onChange={(e) => setS({ theme: e.target.value as Theme })}>
                    <option value="auto">{t('System')}</option>
                    <option value="light">{t('Light')}</option>
                    <option value="dark">{t('Dark')}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </aside>
        <main className="main">
          <div className="box controls">
            <button onClick={() => setRunning((r) => !r)} disabled={!hasClock} title={hasClock ? '' : t('Add a Clock to run the simulation.')}>
              {running ? t('Pause') : t('Run')}
            </button>
            <button onClick={doTick} disabled={!hasClock}>{t('Step')}</button>
            <button onClick={() => { resetSim(sim); setOsc(false); bump() }}>{t('Reset')}</button>
            <label htmlFor="speed">{t('Clock speed')}</label>
            <select id="speed" value={settings.speed} onChange={(e) => setS({ speed: +e.target.value })}>
              {SPEEDS.map((s) => <option key={s} value={s}>{t('{0} steps/s', s)}</option>)}
            </select>
            <span className="spacer" />
            <button onClick={doUndo} disabled={undo.length === 0}>{t('Undo')}</button>
            <button onClick={doRedo} disabled={redo.length === 0}>{t('Redo')}</button>
            <button className="danger" onClick={() => { if (circuit.comps.length) replaceCircuit(EMPTY) }} disabled={circuit.comps.length === 0}>{t('Clear')}</button>
            <button onClick={save}>{t('Save')}</button>
            <button onClick={() => fileInput.current?.click()}>{t('Open')}</button>
            <button onClick={share}>{t('Share link')}</button>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className="status" role="status">
            {osc
              ? <span className="err-text">{t('The circuit keeps changing and never settles (oscillation).')}</span>
              : <span className="hint">{t('Click a switch to flip it. Drag from a pin to another pin to draw a wire. Press Delete to remove the selection.')}</span>}
            {toast && <span className="toast">{t(toast.msg, ...toast.args)}</span>}
          </div>
          {(selComp || selection?.kind === 'wire') && (
            <div className="box inspector">
              {selComp ? (
                <>
                  <strong>{t(DEFS[selComp.type].name)}</strong>
                  <label htmlFor="lbl">{t('Label')}</label>
                  <input id="lbl" type="text" maxLength={24} value={selComp.label ?? ''} placeholder={displayName(circuit, selComp)}
                    onChange={(e) => edit(updateComp(circuit, selComp.id, { label: e.target.value || undefined }), false)} />
                  {DEFS[selComp.type].variadic && (
                    <>
                      <label htmlFor="nin">{t('Inputs')}</label>
                      <select id="nin" value={selComp.n ?? 2} onChange={(e) => edit(setInputCount(circuit, selComp.id, +e.target.value), true)}>
                        {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </>
                  )}
                </>
              ) : (
                <strong>{t('Wire')}</strong>
              )}
              <span className="spacer" />
              <button className="danger" onClick={deleteSelection}>{t('Delete')}</button>
            </div>
          )}
          <Canvas
            circuit={circuit}
            sim={sim}
            selection={selection}
            fitToken={fitToken}
            addRequest={addRequest}
            t={t}
            onSelect={setSelection}
            onEdit={edit}
            onToggle={toggle}
          />
          <div className="box">
            <div className="row">
              <h3 className="grow">{t('Truth table')}</h3>
              <button className="small" onClick={() => setTruthOpen((o) => !o)}>{truthOpen ? t('Hide') : t('Show')}</button>
            </div>
            {truthOpen && <TruthPanel circuit={circuit} active={active} structure={structure} labels={circuit.comps.map((k) => k.label ?? '').join('\u0001')} lang={settings.lang} t={t} />}
          </div>
        </main>
      </div>
      <p className="hint foot">
        {t('Unit-delay, event-driven simulation. Everything runs in your browser.')}{' '}
        <a href="https://github.com/hermes98761234/logic-gate-simulator">{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}
