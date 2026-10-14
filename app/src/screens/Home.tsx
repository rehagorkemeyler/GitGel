import { useState } from 'react'
import { Icon } from '../components/Icon'
import { cityName, lang, setLang, t } from '../i18n'
import { CITY } from '../lib/city'
import { recentPlaces, type RecentPlace } from '../lib/recent'
import type { Screen } from '../App'
import './Home.css'

/** Bottom panel of the home screen: one decision per screen, then the last four places opened. */
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
        <Icon name="search" />
        <span>{destination ?? t('whereTo')}</span>
      </button>
      <div className="home-squares">
        <button className="square" onClick={() => go('nearby')}>
          <Icon name="pin" size={28} />
          <span>
            {t('nearbyTitle')}
            <small>{t('nearbySub')}</small>
          </span>
        </button>
        <button className="square" onClick={() => go('lines')}>
          <Icon name="train" size={28} />
          <span>
            {t('linesTitle')}
            <small>{t('linesSub')}</small>
          </span>
        </button>
      </div>
      {recent.length > 0 && (
        <>
          <div className="section-label">{t('recent')}</div>
          <div className="recent">
            {recent.map((p, i) => (
              <button key={`${p.name}-${i}`} className="recent-row" onClick={() => onRecent(p)}>
                <Icon name={p.station ? 'pin' : 'search'} />
                <span className="recent-text">
                  <span className="recent-title">{p.name}</span>
                  <span className="recent-sub">{p.station ? t('stopCard') : p.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="home-small">
        <button className="small" onClick={() => go('contact')}>
          {t('contact')}
        </button>
        <button className="small" onClick={() => go('support')}>
          {t('support')}
        </button>
        <button className="small" onClick={onCity}>
          <Icon name="pin" size={16} />
          {cityName(CITY.id)}
        </button>
        <button
          className="small lang"
          onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')}
          aria-label={lang === 'tr' ? 'Switch to English' : 'Türkçeye geç'}
        >
          <Icon name="globe" size={16} />
          {lang === 'tr' ? 'English' : 'Türkçe'}
        </button>
      </div>
    </div>
  )
}
