import { PanelHeader } from '../components/PanelHeader'
import { Icon } from '../components/Icon'
import { CONTACT_EMAIL, DONATE_URL, ISSUES_URL, REPO_URL } from '../lib/config'
import { t } from '../i18n'
import './Info.css'

/** The text and chevron of a link row (native LinkRow): the label, an optional secondary line, the chevron on the right. */
function RowBody({ label, sub }: { label: string; sub?: string }) {
  return (
    <>
      <span className="link-text">
        {label}
        {sub && <small>{sub}</small>}
      </span>
      <span className="link-chevron" aria-hidden="true">
        <Icon name="back" size={18} />
      </span>
    </>
  )
}

export function Contact({ onBack, onAbout }: { onBack: () => void; onAbout: () => void }) {
  return (
    <div className="info-body">
      <PanelHeader title={t('contact')} onClose={onBack} />
      <p>{t('contactIntro')}</p>
      <ul className="link-list">
        <li>
          <a href={ISSUES_URL} target="_blank" rel="noreferrer">
            <RowBody label={t('reportProblem')} sub={t('reportProblemSub')} />
          </a>
        </li>
        {CONTACT_EMAIL && (
          <li>
            <a href={`mailto:${CONTACT_EMAIL}`}>
              <RowBody label={t('email')} sub={CONTACT_EMAIL} />
            </a>
          </li>
        )}
        <li>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            <RowBody label={t('sourceCode')} sub="GitHub" />
          </a>
        </li>
        <li>
          <button className="link-row" onClick={onAbout}>
            <RowBody label={t('about')} sub={t('aboutSources')} />
          </button>
        </li>
      </ul>
    </div>
  )
}

export function Support({ onBack }: { onBack: () => void }) {
  return (
    <div className="info-body">
      <PanelHeader title={t('support')} onClose={onBack} />
      <p>{t('supportIntro1')}</p>
      <p>{t('supportIntro2')}</p>
      <ul className="link-list">
        {DONATE_URL ? (
          <li>
            <a href={DONATE_URL} target="_blank" rel="noreferrer">
              <RowBody label={t('donate')} />
            </a>
          </li>
        ) : (
          // Native: secondary text row, no chevron.
          <li className="muted">{t('donateSoon')}</li>
        )}
        <li>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            <RowBody label={t('contribute')} sub="GitHub" />
          </a>
        </li>
      </ul>
      <p className="muted">{t('supportNoStrings')}</p>
    </div>
  )
}
