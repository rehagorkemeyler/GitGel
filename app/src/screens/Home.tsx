import { useState } from 'react'
import { Icon } from '../components/Icon'
import { PlaceBadge } from '../components/PlaceBadge'
import { cityName, lang, setLang, t } from '../i18n'
import { CITY } from '../lib/city'
import { stationIcon } from '../lib/placeRules'
import { recentPlaces, type RecentPlace } from '../lib/recent'
import type { Screen } from '../App'
import './Home.css'

/** Bottom panel of the home screen (native Home.tsx): "Nereye?", two cards, recent places, small links. */
export function HomePeek({
  go,
  destination,
  onCity,
  onRecent,
}: {
  go: (s: Screen) => void
  destination?: string
  onCity: () => void
  onRecent: (p: RecentPlace) => void
}) {
  const [recent] = useState(() => recentPlaces().slice(0, 4))
  return (
    <div className="home">
      <button className="where-to" onClick={() => go('search')}>
        <Icon name="search" size={22} />
        <span>{destination ?? t('whereTo')}</span>
      </button>
      <div className="home-squares">
        <button className="square" onClick={() => go('nearby')}>
          <span className="square-badge accent">
            <Icon name="pin" size={16} />
          </span>
          <span className="square-text">
            <span className="square-title">{t('nearbyTitle')}</span>
            <small>{t('nearbySub')}</small>
          </span>
        </button>
        <button className="square" onClick={() => go('lines')}>
          <span className="square-badge live">
            <Icon name="bus" size={16} />
          </span>
          <span className="square-text">
            <span className="square-title">{t('linesTitle')}</span>
            <small>{t('linesSub')}</small>
          </span>
        </button>
      </div>
      <div className="section-label">{t('recent')}</div>
      <div className="recent">
        {recent.length === 0 ? (
          <div className="recent-empty">
            <Icon name="clock" size={20} />
            <span>{t('recentEmpty')}</span>
          </div>
        ) : (
          recent.map((p, i) => (
            <button key={`${p.name}-${i}`} className="recent-row" onClick={() => onRecent(p)}>
              <PlaceBadge icon={p.station ? stationIcon(p.station.mode) : 'clock'} tint="var(--text-2)" />
              <span className="recent-text">
                <span className="recent-title">{p.name}</span>
                <span className="recent-sub">{p.station ? t('stopCard') : p.sub}</span>
              </span>
            </button>
          ))
        )}
      </div>
      {/* Footer order follows native Home.tsx: support, contact, city, language. */}
      <div className="home-small">
        <button className="small" onClick={() => go('support')}>
          <Icon name="heart" size={15} />
          {t('support')}
        </button>
        <button className="small" onClick={() => go('contact')}>
          {t('contact')}
        </button>
        <button className="small" onClick={onCity}>
          <Icon name="pin" size={15} />
          {cityName(CITY.id)}
        </button>
        <button
          className="small"
          onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')}
          aria-label={lang === 'tr' ? 'Switch to English' : 'Türkçeye geç'}
        >
          <Icon name="globe" size={15} />
          {lang === 'tr' ? 'English' : 'Türkçe'}
        </button>
      </div>
    </div>
  )
}
