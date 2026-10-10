import { CATEGORIES, DEFS, TYPE_ORDER, type Category, type CompType } from '../lib/types'
import { N, type T } from '../i18n'

const CAT_LABEL: Record<Category, string> = {
  input: N('Inputs'),
  output: N('Outputs'),
  gate: N('Gates'),
  memory: N('Memory'),
  block: N('Blocks'),
}

interface Props {
  t: T
  onAdd: (type: CompType) => void
}

export default function Palette({ t, onAdd }: Props) {
  return (
    <div className="section">
      <h3>{t('Parts')}</h3>
      <p className="hint">{t('Drag a part onto the canvas, or tap it to add it.')}</p>
      {CATEGORIES.map((cat) => (
        <div key={cat} className="pal-group">
          <div className="pal-title">{t(CAT_LABEL[cat])}</div>
          <div className="pal-items">
            {TYPE_ORDER.filter((ty) => DEFS[ty].cat === cat).map((ty) => (
              <button
                key={ty}
                className="pal-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/x-gate', ty)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onAdd(ty)}
              >
                {DEFS[ty].name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
