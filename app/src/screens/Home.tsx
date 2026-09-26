import { Icon } from '../components/Icon'
import { lang, setLang, t } from '../i18n'
import type { Screen } from '../App'
import './Home.css'

/** Bottom panel of the home screen: one decision per screen. */
export function HomePeek({ go, destination }: { go: (s: Screen) => void; destination?: string }) {
  return (
    <div className="home">
      <button className="where-to" onClick={() => go('search')}>
        <Icon name="search" />
        <span>{destination ?? t('whereTo')}</span>
      </button>
      <div className="home-squares">
        <button className="square" onClick={() => go('nearby')}>
          <Icon name="pin" size={28} />
          <span>{t('nearby')}</span>
        </button>
        <button className="square" onClick={() => go('lines')}>
          <Icon name="train" size={28} />
          <span>{t('lines')}</span>
        </button>
      </div>
      <div className="home-small">
        <button className="small" onClick={() => go('contact')}>
          {t('contact')}
        </button>
        <button className="small" onClick={() => go('support')}>
          {t('support')}
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
