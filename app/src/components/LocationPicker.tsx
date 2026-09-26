import type { Map as MlMap } from 'maplibre-gl'
import { Icon } from './Icon'
import { t } from '../i18n'
import './LocationPicker.css'

/** Move the map under the fixed centre pin, then confirm: that point is "my location" until reload. */
export function LocationPicker({ map, onPick, onCancel }: { map: MlMap | null; onPick: (p: [number, number]) => void; onCancel: () => void }) {
  return (
    <>
      <div className="picker-pin" aria-hidden>
        <Icon name="pin" size={40} />
      </div>
      <div className="picker-bar" role="dialog" aria-label={t('pickLocation')}>
        <p>{t('pickLocationHelp')}</p>
        <div className="picker-actions">
          <button className="picker-cancel" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button
            className="picker-ok"
            onClick={() => {
              if (!map) return
              const c = map.getCenter()
              onPick([c.lng, c.lat])
            }}
          >
            {t('useThisLocation')}
          </button>
        </div>
      </div>
    </>
  )
}
