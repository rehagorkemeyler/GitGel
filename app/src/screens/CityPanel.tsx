import { PanelHeader } from '../components/PanelHeader'
import { Icon } from '../components/Icon'
import { CITIES, CITY, type CityId } from '../lib/city'
import { cityName, t } from '../i18n'
import './CityPanel.css'

/** Which city the map, lines and search show (native CityPanel). The current city closes the sheet. */
export function CityPanel({ onPick, onClose }: { onPick: (id: CityId) => void; onClose: () => void }) {
  return (
    <div className="city-panel">
      <PanelHeader title={t('pickCity')} subtitle={t('cityHint')} onClose={onClose} />
      <div className="city-group" role="radiogroup" aria-label={t('pickCity')}>
        {(Object.keys(CITIES) as CityId[]).map((id, i) => {
          const on = id === CITY.id
          return (
            <button
              key={id}
              role="radio"
              aria-checked={on}
              className={i > 0 ? 'city-row sep' : 'city-row'}
              onClick={() => (on ? onClose() : onPick(id))}
            >
              <span className="city-name">{cityName(id)}</span>
              {on && (
                <span className="city-check">
                  <Icon name="check" size={20} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
