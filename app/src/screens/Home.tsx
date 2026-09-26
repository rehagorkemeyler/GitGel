import { Icon } from '../components/Icon'
import { t } from '../i18n'
import type { Screen } from '../App'
import './Home.css'

/** Bottom panel of the home screen: one decision per screen. */
export function HomePeek({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="home">
      <button className="where-to" onClick={() => go('search')}>
        <Icon name="search" />
        <span>{t('whereTo')}</span>
      </button>
      <div className="home-squares">
        <button className="square" onClick={() => go('nearby')}>
          <Icon name="pin" size={28} />
          <span>{t('nearby')}</span>
        </button>
        <button className="square" onClick={() => go('lines')}>
          <Icon name="route" size={28} />
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
      </div>
    </div>
  )
}
