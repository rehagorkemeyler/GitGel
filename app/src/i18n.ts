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
  searchPlaceholder: 'İstasyon, durak ya da adres',
  myLocation: 'Konumum',
  recent: 'Son aramalar',
  clear: 'Temizle',
  noResults: 'Sonuç yok. Yazımı kontrol et ya da başka bir yer dene.',
  dataUnavailable: 'Durak listesi şu an yüklenemedi. Biraz sonra tekrar dene.',
  from: 'Nereden?',
  pickOrigin: 'Nereden çıkacağını seç ya da konumunu aç.',
  searchingRoutes: 'Rotalar aranıyor…',
  routingUnavailable: 'Rota servisine şu an ulaşılamıyor. Biraz sonra tekrar dene.',
  retry: 'Tekrar dene',
  noRoute: 'Bu saatte uygun bir rota bulunamadı.',
  min: 'dk',
  noTransfer: 'Aktarmasız',
  transfers: 'aktarma',
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
  searchPlaceholder: 'Station, stop or address',
  myLocation: 'My location',
  recent: 'Recent searches',
  clear: 'Clear',
  noResults: 'No results. Check the spelling or try another place.',
  dataUnavailable: 'The stop list could not be loaded right now. Try again shortly.',
  from: 'From where?',
  pickOrigin: 'Choose where you start, or turn on your location.',
  searchingRoutes: 'Finding routes…',
  routingUnavailable: 'The route service cannot be reached right now. Try again shortly.',
  retry: 'Try again',
  noRoute: 'No suitable route at this time.',
  min: 'min',
  noTransfer: 'No transfer',
  transfers: 'transfers',
}

export const lang: 'tr' | 'en' =
  typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('tr') ? 'en' : 'tr'

const dict = lang === 'tr' ? tr : en

export function t(key: StringKey): string {
  return dict[key]
}
