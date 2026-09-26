// Turkish and English UI strings. Turkish is the default; English when the
// device language is not Turkish.
const tr = {
  whereTo: 'Nereye?',
  map: 'Harita',
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
  walkTo: 'yürü:',
  destination: 'varış noktası',
  direction: 'yönü',
  stops: 'durak',
  nextDepartures: 'Sonraki kalkışlar',
  nearbyNeedsLocation: 'Yakındaki durakları görmek için konumunu aç. Konumun sadece telefonunda kalır.',
  nothingNearby: 'Yakında durak bulunamadı.',
  noDepartures: 'Yakın zamanda kalkış yok.',
  linePlaceholder: 'Hat numarası ya da adı (örn. 500T, M2)',
  typeToFindBus: 'Diğer otobüs hatları için numarasını yaz.',
  firstTrip: 'İlk sefer',
  lastTrip: 'Son sefer',
  weekday: 'Hafta içi',
  saturday: 'Cumartesi',
  sunday: 'Pazar',
  scheduleNote: 'Saatler hattın ilk durağından kalkış saatleridir, tarifeye göre.',
  modeMetro: 'Metro',
  modeRail: 'Marmaray ve banliyö',
  modeTram: 'Tramvay',
  modeFunicular: 'Füniküler',
  modeCablecar: 'Teleferik',
  modeMetrobus: 'Metrobüs',
  modeFerry: 'Vapur',
  modeBus: 'Otobüs',
  contactIntro: 'Yanlış bir rota, eksik bir durak ya da bir hata mı gördün? Bize yaz, düzeltelim.',
  reportProblem: 'Hata bildir',
  reportProblemSub: 'GitHub üzerinden, herkese açık',
  email: 'E-posta',
  sourceCode: 'Kaynak kod',
  supportIntro1: 'GitGel ücretsiz, reklamsız ve üyeliksiz bir İstanbul toplu taşıma uygulaması. Kodu açık, veri kaynakları açık.',
  supportIntro2: 'Sunucu ve alan adı giderlerini karşılamak için bağış kabul ediyoruz. Bağış hiçbir özelliği açmaz ya da kısıtlamaz.',
  donate: 'Bağış yap',
  donateSoon: 'Bağış bağlantısı yakında eklenecek.',
  contribute: 'Koda katkı ver',
  supportNoStrings: 'Bu ekran sadece sen açtığında görünür, asla kendiliğinden açılmaz.',
  liveVehicles: 'araç haritada canlı (İETT GPS)',
  serviceNotice: 'seferlerde aksama var',
  scheduledHidden: 'Bu hatların tarifeye göre tren noktaları gizlendi.',
  legend: 'Harita işaretleri',
  about: 'Hakkında',
  outsideIstanbul: 'İstanbul dışındasın. Denemek için haritada bir konum seçebilirsin.',
  pickLocation: 'Örnek konum seç',
  pickLocationHelp: 'Haritayı kaydırıp pini istediğin yere getir. Sayfayı yenileyene kadar konumun bu kabul edilir.',
  useThisLocation: 'Bu konumu kullan',
  cancel: 'Vazgeç',
  aboutIntro: 'GitGel, İstanbul\'un herkese açık ulaşım verisini sade bir araçla sunar. Ücretsiz, reklamsız, üyeliksiz.',
  aboutSources: 'Veri kaynakları',
  aboutTimetables: 'İETT ve vapur tarifeleri, İBB Açık Veri Lisansı',
  aboutRail: 'Raylı sistem hatları, tarifeleri, hizmet durumu',
  aboutBus: 'Canlı otobüs ve metrobüs konumları',
  aboutMap: 'Harita, hat geometrisi, yürüme yolları (ODbL)',
  aboutTiles: 'Harita görüntüsü',
  aboutRouting: 'Rota motoru (MIT lisansı)',
  aboutLicense: 'Veriler İBB Açık Veri Lisansı ve ODbL koşullarıyla, olduğu gibi kullanılır. Kaynaklar kesintiye uğrayabilir; o durumda son iyi veri gösterilir.',
  aboutHonesty: 'Otobüs ve metrobüs noktaları İETT GPS verisinden gelir ve "canlı" yazar. Raylı sistem noktaları tarifeden hesaplanır, içi boş gösterilir ve "tarifeye göre" yazar.',
  aboutPrivacy: 'Konumun sadece telefonunda kullanılır. Son aramalar sadece bu cihazda saklanır. İzleme, reklam ya da analiz aracı yoktur.',
}

export type StringKey = keyof typeof tr

const en: Record<StringKey, string> = {
  whereTo: 'Where to?',
  map: 'Map',
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
  walkTo: 'walk to',
  destination: 'your destination',
  direction: 'direction',
  stops: 'stops',
  nextDepartures: 'Next departures',
  nearbyNeedsLocation: 'Turn on your location to see stops near you. It stays on your phone.',
  nothingNearby: 'No stops nearby.',
  noDepartures: 'No departures soon.',
  linePlaceholder: 'Line number or name (e.g. 500T, M2)',
  typeToFindBus: 'Type a number to find other bus lines.',
  firstTrip: 'First',
  lastTrip: 'Last',
  weekday: 'Weekdays',
  saturday: 'Saturday',
  sunday: 'Sunday',
  scheduleNote: 'Departure times from the first stop, as scheduled.',
  modeMetro: 'Metro',
  modeRail: 'Marmaray and commuter rail',
  modeTram: 'Tram',
  modeFunicular: 'Funicular',
  modeCablecar: 'Cable car',
  modeMetrobus: 'Metrobüs',
  modeFerry: 'Ferry',
  modeBus: 'Bus',
  contactIntro: 'Seen a wrong route, a missing stop or a bug? Tell us and we will fix it.',
  reportProblem: 'Report a problem',
  reportProblemSub: 'On GitHub, public',
  email: 'Email',
  sourceCode: 'Source code',
  supportIntro1: 'GitGel is a free, ad-free, account-free Istanbul transit app. The code and the data sources are open.',
  supportIntro2: 'Donations cover the server and domain costs. Donating never unlocks or limits any feature.',
  donate: 'Donate',
  donateSoon: 'The donation link will be added soon.',
  contribute: 'Contribute code',
  supportNoStrings: 'This screen only appears when you open it, never on its own.',
  liveVehicles: 'vehicles live on the map (İETT GPS)',
  serviceNotice: 'service disruption',
  scheduledHidden: 'Scheduled train dots for these lines are hidden.',
  legend: 'Map symbols',
  about: 'About',
  outsideIstanbul: 'You are outside Istanbul. To try the app, pick a location on the map.',
  pickLocation: 'Pick a test location',
  pickLocationHelp: 'Move the map to put the pin where you want. It counts as your location until you reload.',
  useThisLocation: 'Use this location',
  cancel: 'Cancel',
  aboutIntro: 'GitGel presents Istanbul\'s public transit data in a simple tool. Free, no ads, no account.',
  aboutSources: 'Data sources',
  aboutTimetables: 'İETT and ferry timetables, İBB Open Data License',
  aboutRail: 'Rail lines, timetables, service status',
  aboutBus: 'Live bus and Metrobüs positions',
  aboutMap: 'Map, line geometry, walking paths (ODbL)',
  aboutTiles: 'Map tiles',
  aboutRouting: 'Routing engine (MIT license)',
  aboutLicense: 'Data is used as is under the İBB Open Data License and the ODbL. Sources can go down; the last good data is shown then.',
  aboutHonesty: 'Bus and Metrobüs dots come from İETT GPS and are labelled "live". Rail dots are computed from timetables, drawn hollow and labelled "scheduled".',
  aboutPrivacy: 'Your location is only used on your phone. Recent searches stay on this device. No tracking, ads or analytics.',
}

const LANG_KEY = 'gitgel.lang'

function savedLang(): 'tr' | 'en' | null {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return v === 'tr' || v === 'en' ? v : null
  } catch {
    return null
  }
}

/** Turkish unless the device language is not Turkish; the user's choice wins. */
export const lang: 'tr' | 'en' =
  savedLang() ??
  (typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('tr') ? 'en' : 'tr')

export function setLang(l: 'tr' | 'en'): void {
  try {
    localStorage.setItem(LANG_KEY, l)
  } catch {
    // ignore: the choice then lasts only for this page load
  }
  location.reload()
}

const dict = lang === 'tr' ? tr : en

if (typeof document !== 'undefined') document.documentElement.lang = lang

export function t(key: StringKey): string {
  return dict[key]
}
