import { Panel } from '../components/Panel'
import { REPO_URL } from '../lib/config'
import { t } from '../i18n'
import { Logo } from '../components/Logo'
import './Info.css'

const SOURCES: { name: string; url: string; what: 'aboutTimetables' | 'aboutRail' | 'aboutBus' | 'aboutMap' | 'aboutTiles' | 'aboutRouting' }[] = [
  { name: 'İBB Açık Veri Portalı', url: 'https://data.ibb.gov.tr', what: 'aboutTimetables' },
  { name: 'Metro İstanbul', url: 'https://www.metro.istanbul', what: 'aboutRail' },
  { name: 'İETT', url: 'https://www.iett.istanbul', what: 'aboutBus' },
  { name: '© OpenStreetMap katkıcıları', url: 'https://www.openstreetmap.org/copyright', what: 'aboutMap' },
  { name: 'OpenFreeMap, OpenMapTiles', url: 'https://openfreemap.org', what: 'aboutTiles' },
  { name: 'MOTIS', url: 'https://github.com/motis-project/motis', what: 'aboutRouting' },
]

export function About({ onBack }: { onBack: () => void }) {
  return (
    <Panel title={t('about')} onBack={onBack}>
      <div className="about-logo">
        <Logo height={40} />
      </div>
      <p>{t('aboutIntro')}</p>
      <h2 className="about-h">{t('aboutSources')}</h2>
      <ul className="link-list">
        {SOURCES.map((s) => (
          <li key={s.name}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.name}
              <small>{t(s.what)}</small>
            </a>
          </li>
        ))}
      </ul>
      <p className="muted">{t('aboutLicense')}</p>
      <p className="muted">{t('aboutHonesty')}</p>
      <p className="muted">{t('aboutPrivacy')}</p>
      <p>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          {t('sourceCode')} (AGPL-3.0)
        </a>
      </p>
    </Panel>
  )
}
