import { Panel } from '../components/Panel'
import { CONTACT_EMAIL, DONATE_URL, ISSUES_URL, REPO_URL } from '../lib/config'
import { t } from '../i18n'
import './Info.css'

export function Contact({ onBack, onAbout }: { onBack: () => void; onAbout: () => void }) {
  return (
    <Panel title={t('contact')} onBack={onBack}>
      <p>{t('contactIntro')}</p>
      <ul className="link-list">
        <li>
          <a href={ISSUES_URL} target="_blank" rel="noreferrer">
            {t('reportProblem')}
            <small>{t('reportProblemSub')}</small>
          </a>
        </li>
        {CONTACT_EMAIL && (
          <li>
            <a href={`mailto:${CONTACT_EMAIL}`}>
              {t('email')}
              <small>{CONTACT_EMAIL}</small>
            </a>
          </li>
        )}
        <li>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            {t('sourceCode')}
            <small>GitHub</small>
          </a>
        </li>
        <li>
          <button className="link-row" onClick={onAbout}>
            {t('about')}
            <small>{t('aboutSources')}</small>
          </button>
        </li>
      </ul>
    </Panel>
  )
}

export function Support({ onBack }: { onBack: () => void }) {
  return (
    <Panel title={t('support')} onBack={onBack}>
      <p>{t('supportIntro1')}</p>
      <p>{t('supportIntro2')}</p>
      <ul className="link-list">
        {DONATE_URL ? (
          <li>
            <a href={DONATE_URL} target="_blank" rel="noreferrer">
              {t('donate')}
            </a>
          </li>
        ) : (
          <li className="muted">{t('donateSoon')}</li>
        )}
        <li>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            {t('contribute')}
            <small>GitHub</small>
          </a>
        </li>
      </ul>
      <p className="muted">{t('supportNoStrings')}</p>
    </Panel>
  )
}
