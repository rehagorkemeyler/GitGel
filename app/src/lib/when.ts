import { lang, t } from '../i18n'

export type When = { kind: 'now' } | { kind: 'depart' | 'arrive'; at: Date }

const pad = (n: number) => String(n).padStart(2, '0')

/** Istanbul wall-clock date + time -> Date (Istanbul is UTC+3 all year). */
export function istanbulDate(day: string, time: string): Date {
  return new Date(`${day}T${time}:00+03:00`)
}

export function istanbulParts(d: Date): { day: string; time: string } {
  const x = new Date(d.getTime() + 3 * 3600_000)
  return {
    day: `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`,
    time: `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`,
  }
}

export function whenLabel(w: When): string {
  if (w.kind === 'now') return t('leaveNow')
  const { time } = istanbulParts(w.at)
  const day = w.at.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' })
  return `${t(w.kind === 'depart' ? 'departAt' : 'arriveBy')} ${day} ${time}`
}

