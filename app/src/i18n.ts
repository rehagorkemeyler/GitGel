// Turkish and English UI strings. Turkish is the default; English when the
// device language is not Turkish.
const tr = {
  whereTo: 'Nereye?',
  nearby: 'Yakın duraklar',
  lines: 'Hat ve sefer ara',
  contact: 'Bize ulaşın',
  support: 'Destek olun',
  locateMe: 'Konumumu göster',
  locationDenied: 'Konum izni verilmedi. Haritayı elle kaydırabilirsin.',
  locationUnavailable: 'Konum şu an alınamıyor.',
  back: 'Geri',
  close: 'Kapat',
  comingSoon: 'Bu ekran hazırlanıyor.',
  live: 'canlı',
  scheduled: 'tarifeye göre',
}

export type StringKey = keyof typeof tr

const en: Record<StringKey, string> = {
  whereTo: 'Where to?',
  nearby: 'Nearby stops',
  lines: 'Lines and timetables',
  contact: 'Contact us',
  support: 'Support us',
  locateMe: 'Show my location',
  locationDenied: 'Location permission was not given. You can move the map by hand.',
  locationUnavailable: 'Location is not available right now.',
  back: 'Back',
  close: 'Close',
  comingSoon: 'This screen is being built.',
  live: 'live',
  scheduled: 'scheduled',
}

export const lang: 'tr' | 'en' =
  typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('tr') ? 'en' : 'tr'

const dict = lang === 'tr' ? tr : en

export function t(key: StringKey): string {
  return dict[key]
}
