import { memo, useMemo } from 'react'
import { MAX_TRUTH_INPUTS, truthTable } from '../lib/truth'
import type { Circuit } from '../lib/types'
import type { T } from '../i18n'

interface Props {
  circuit: Circuit
  /** Index of the row that matches the current switch positions. */
  active: number
  structure: string
  labels: string
  lang: string
  t: T
}

function TruthPanel({ circuit, active, t }: Props) {
  const table = useMemo(() => truthTable(circuit), [circuit])
  const csv = () => {
    const lines = [[...table.inputs, ...table.outputs].join(',')]
    for (const r of table.rows) lines.push([...r.ins, ...r.outs].join(','))
    const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'truth-table.csv'
    a.click()
    URL.revokeObjectURL(url)
  }
  if (table.tooMany) return <p className="hint">{t('Too many switches for a truth table (limit {0}).', MAX_TRUTH_INPUTS)}</p>
  if (table.inputs.length === 0 || table.outputs.length === 0) return <p className="hint">{t('Add at least one switch and one LED to get a truth table.')}</p>
  return (
    <div>
      <div className="row">
        <span className="hint">{t('{0} inputs, {1} outputs, {2} rows. The row matching the switches is highlighted.', table.inputs.length, table.outputs.length, table.rows.length)}</span>
        <span className="spacer" />
        <button className="small" onClick={csv}>{t('Download CSV')}</button>
      </div>
      {table.sequential && <p className="hint warn-text">{t('This circuit has memory, so the table depends on its history and may not be a pure function.')}</p>}
      <div className="truth-scroll">
        <table className="data truth">
          <thead>
            <tr>
              {table.inputs.map((n, i) => <th key={`i${i}`} className="in">{n}</th>)}
              {table.outputs.map((n, i) => <th key={`o${i}`} className="out">{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, ri) => (
              <tr key={ri} className={ri === active ? 'active' : ''}>
                {r.ins.map((v, i) => <td key={`i${i}`} className={v ? 'one in' : 'in'}>{v}</td>)}
                {r.outs.map((v, i) => <td key={`o${i}`} className={v ? 'one out' : 'out'}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Positions and switch values do not change the table, so only wiring, labels, language and the highlighted row matter. */
export default memo(
  TruthPanel,
  (a, b) => a.structure === b.structure && a.labels === b.labels && a.lang === b.lang && a.active === b.active,
)
