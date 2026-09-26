import { t } from '../i18n'

/** "3 dk 12 sn", counting down between refreshes. */
export function eta(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 30) return t('atStop')
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} ${t('min')} ${s % 60} ${t('sec')}` : `${s} ${t('sec')}`
}

/** "12 sn önce" / "3 dk önce" for a GPS fix. */
export function ago(at: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(at)) / 1000))
  return s < 60 ? `${s} ${t('secondsAgo')}` : `${Math.floor(s / 60)} ${t('minutesAgo')}`
}
