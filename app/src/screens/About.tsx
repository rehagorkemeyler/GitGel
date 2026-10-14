import { PanelHeader } from '../components/PanelHeader'
import { Icon } from '../components/Icon'
import { REPO_URL } from '../lib/config'
import { t, type StringKey } from '../i18n'
import './Info.css'

// Same order as native About.tsx, with each map and data attribution next to its data:
// EGO Mac after BURULAŞ, OpenFreeMap after OpenStreetMap, Google before MOTIS and Photon.
const SOURCES: { name: string; url: string; what: StringKey }[] = [
  { name: 'İBB Açık Veri Portalı', url: 'https://data.ibb.gov.tr', what: 'aboutTimetables' },
  { name: 'Metro İstanbul', url: 'https://www.metro.istanbul', what: 'aboutRail' },
  { name: 'İETT', url: 'https://www.iett.istanbul', what: 'aboutBus' },
  { name: 'EGO Genel Müdürlüğü', url: 'https://www.ego.gov.tr', what: 'aboutEgo' },
  { name: 'BURULAŞ / BursaKart', url: 'https://www.bursakart.com.tr', what: 'aboutBursa' },
  { name: 'EGO Mac (byigitt/egomac)', url: 'https://github.com/byigitt/egomac', what: 'aboutEgoMac' },
  { name: '© OpenStreetMap katkıcıları', url: 'https://www.openstreetmap.org/copyright', what: 'aboutMap' },
  { name: 'OpenFreeMap, OpenMapTiles', url: 'https://openfreemap.org', what: 'aboutTiles' },
  { name: 'Google', url: 'https://policies.google.com/terms', what: 'aboutGoogle' },
  { name: 'MOTIS', url: 'https://github.com/motis-project/motis', what: 'aboutRouting' },
  { name: 'Photon', url: 'https://github.com/komoot/photon', what: 'aboutSearch' },
]

/** Data sources and licences, honesty notes, privacy, version. The footer opens Contact and Support on top of this panel. */
export function About({ onBack, onContact, onSupport }: { onBack: () => void; onContact: () => void; onSupport: () => void }) {
  return (
    <div className="info-body">
      <PanelHeader title={t('about')} subtitle={`GitGel · ${t('version')} ${__APP_VERSION__}`} onClose={onBack} />
      <p>{t('aboutIntro')}</p>
      <h2 className="section-label">{t('aboutSources')}</h2>
      <ul className="link-list">
        {SOURCES.map((s) => (
          <li key={s.name}>
            <a href={s.url} target="_blank" rel="noreferrer">
              <span className="link-text">
                {s.name}
                <small>{t(s.what)}</small>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="muted">{t('aboutLicense')}</p>
      <p className="muted">{t('aboutHonesty')}</p>
      <p className="muted">{t('aboutHonestyAnkara')}</p>
      <p className="muted">{t('aboutPrivacy')}</p>
      <p>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          {t('sourceCode')} (AGPL-3.0)
        </a>
      </p>
      <div className="about-links">
        <button onClick={onContact}>
          <Icon name="mail" size={16} />
          {t('contact')}
        </button>
        <button onClick={onSupport}>
          <Icon name="heart" size={16} />
          {t('support')}
        </button>
      </div>
    </div>
  )
}
