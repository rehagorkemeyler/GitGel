# GitGel Görev Listesi

Claude Code görevleri sırayla, onay beklemeden yapar: her görev test edilir, işaretlenir, commit edilir ve main'e push'lanır. [Görkem] etiketli adımları Görkem kendisi yapar; Claude Code "SENİN SIRAN" başlığıyla adım adım talimat verir, aynısını docs/GORKEM-TODO.md'ye yazar ve Görkem'e bağlı olmayan sıradaki göreve geçer.

## Aşama 0: Kurulum ve keşif

- [x] [Görkem] GitHub'da `gitgel` adında public bir repo aç, bu dosyaları (CLAUDE.md, VISION.md, TASKS.md, docs/research.md) içine koy
- [x] Repo iskeleti: klasör yapısı, AGPL-3.0 LICENSE, README (Türkçe ve İngilizce kısa tanıtım), .gitignore
- [x] API keşfi: Metro İstanbul GetTimeTable ve GetStationBetweenTime POST gövdelerini deneme yoluyla bul. Tüm test edilen uç noktaların örnek yanıtlarını docs/api-samples/ altına kaydet. Bulunamazsa CLAUDE.md'deki yedek planı seç ve not düş
- [x] Marmaray ve M11 için veri kaynağını belirle (TCDD Taşımacılık tarife sayfası, OSM, eski GTFS), karar docs/research.md'ye yazılsın
- [x] Vapur (Şehir Hatları, Turyol, Dentur) tarifeleri için kaynağı belirle

Bitti sayılması için: docs/api-samples/ dolu, her mod için veri kaynağı kararı yazılı.

## Aşama 1: Veri (ETL)

- [x] etl/iett: İETT GTFS'i indir ve temizle (ZIP'teki tam stop_times, noktalı virgül, çift kodlama, koordinat düzeltme)
- [x] etl/rail: Metro İstanbul API + OSM hat geometrisinden raylı sistem GTFS'i üret (stops, routes, trips, stop_times, shapes)
- [x] etl/other: Marmaray, M11, vapur ve eksik hatlar
- [x] etl/merge: hepsini tek GTFS'te birleştir, gtfs-validator ile doğrula
- [x] etl/static: uygulamanın ihtiyaç duyduğu küçük JSON'lar (hat listesi, renkler, istasyonlar, arama indeksi)
- [x] GitHub Actions: her gece ETL'i çalıştır, çıktıyı yayınla (release data-latest)

Bitti sayılması için: doğrulayıcıdan hatasız geçen tek bir İstanbul GTFS'i her gece otomatik üretiliyor.

## Aşama 2: Sunucu ve rota

- [x] [Görkem] Oracle Cloud Always Free hesabı aç
- [x] [Görkem] Ampere A1 Ubuntu 24.04 sunucu oluştur (4 OCPU, 24 GB, 100 GB disk, Milano bölgesi). Bağlantı: `ssh gitgel` (~/.ssh/config tanımlı, anahtar ~/.ssh/gitgel.key)
- [x] Otomatik dağıtım: GitHub Actions ile main'e her push'ta sunucuda `git pull` ve `docker compose up -d` (ayrı deploy anahtarı, repo secret'ları). İlk kurulum [Görkem]
- [x] Sunucu temel kurulumu: güncellemeler, güvenlik duvarı (sadece 22), otomatik güvenlik güncellemeleri, Docker, swap
- [x] infra/docker-compose.yml: motis + live servisleri
- [x] MOTIS'i İstanbul OSM kesiti ve bizim GTFS ile çalıştır
- [x] CLAUDE.md'deki test yolculuklarının hepsini MOTIS API'si ile dene, sonuçları docs/route-tests.md'ye yaz (ilk koşu yerelde aynı imaj ve ayarla; sunucu hazır olunca scripts/route_tests.py ile tekrar)
- [x] [Görkem] Sunucuyu internete aç: şimdilik ücretsiz Tailscale Funnel (https://gitgel.tail90b397.ts.net); alan adı alınırsa Cloudflare Tunnel (GORKEM-TODO 2)
- [x] Sunucu gece yeni GTFS'i çekip MOTIS'i yeniden yüklesin

Bitti sayılması için: test yolculuklarının hepsi internetten erişilebilen API'den doğru dönüyor.

## Aşama 3: Uygulama

- [x] app iskeleti: Vite + React + TS + PWA + MapLibre + OpenFreeMap, açık ve koyu tema değişkenleri, tasarım ölçekleri (VISION.md)
- [x] Ana ekran: tam ekran harita, konum izni, alt panel (Nereye, iki kare buton, iki küçük buton), sürüklenebilir panel animasyonu
- [x] Arama: MOTIS geocoding + yerel istasyon indeksi, Türkçe karakter ve yazım hatası toleransı, son aramalar (localStorage)
- [x] Rota sonuçları: 2 ila 3 kart, süre, aktarma, yürüme, hat renkleri
- [x] Rota detayı: adım adım, haritada çizim, sonraki kalkış
- [x] Yakın duraklar ekranı
- [x] Hat ve sefer ara ekranı: hat listesi, hat sayfası
- [x] Bize ulaşın ve Destek olun ekranları
- [x] Türkçe ve İngilizce metinler
- [ ] GitHub Pages'e otomatik yayın
- [x] Performans testi: düşük seviye Android'de akıcılık, açılıştan rotaya 5 saniye (öykünmede 3,5 sn, docs/performance.md; gerçek telefon denemesi GORKEM-TODO 4)

Bitti sayılması için: gerçek telefonda 5 saniye kuralını geçiyor.

## Aşama 3b: Görkem'in ilk telefon geri bildirimi (26 Eylül 2026)

- [x] Rota sonuçları sürekli yeniden aranıp titriyor (konum güncellemesi her seferinde yeni arama başlatıyor)
- [x] İstanbul dışındaki konumda harita kayboluyor; test için "örnek konum seç" butonu (ortadaki pini sürükle, onayla, oturum boyunca konum o kabul edilsin)
- [x] Aksama bandı: küçük hali yazıyla orantılı ve tutarlı olsun
- [x] Alt panel sadece çizgiden değil her yerinden sürüklenebilsin
- [x] "Hat ve sefer ara" ikonu "Yakın duraklar" ile aynı boyut ve ağırlıkta olsun
- [x] Dil seçeneği (TR/EN) ana panelin sağ alt köşesinde
- [x] Rota aramasında çıkış günü ve saati seçimi
- [x] Haritada raylı sistem, tramvay, füniküler, teleferik ve vapur hatları resmi renkleriyle çizili
- [x] Haritada istasyon ve durak işaretleri; dokununca alttan istasyon kartı: ad, yol tarifi butonu, geçen hatlar, hat ve yön bazında sonraki varışlar (otobüs durakları dahil)
- [x] Hat sayfası: üst yarıda hattın haritada renkli çizimi, altta kaydırılabilir bilgi; durağa dokununca o durağa her seferin varış saatleri
- [x] Haritadaki tren halkasına dokununca bilgi: hat, yön, hangi istasyondan hangisine, tahmini varış

## Aşama 4: Canlı katman

- [x] live servisi: İETT hat bazlı araç konumu (istek üzerine ve önbellekli), Metro İstanbul hizmet durumu ve duyurular
- [x] Uygulamada canlı otobüs ve metrobüs noktaları, iki ölçüm arasında yumuşak kaydırma
- [x] Raylı tarife simülasyonu: hat geometrisi üzerinde içi boş noktalar, "tarifeye göre" etiketi
- [x] Hat durumu bandı, aksamalı hatta tahmini noktaları gizleme

Bitti sayılması için: noktalar hat üzerinde düzgün hareket ediyor, etiketler dürüst.

## Aşama 5: Yayın

- [x] Hakkında ekranında tüm atıflar
- [x] README'de ekran görüntüleri, kurulum ve katkı rehberi
- [ ] [Görkem] Duyuru ve ilk kullanıcılar
- [ ] [Görkem] Metro İstanbul'a canlı tren verisi için resmi talep (taslak hazır: docs/metro-istanbul-talep.md)

## Aşama 3c: Doğruluk (26 Eylül 2026)

- [x] Marmaray tarifesi: istasyon bazlı süreler, Cuma/Cumartesi gece seferleri, Pendik–Zeytinburnu kısa trenleri
- [x] Otobüs durak saatlerini canlı GPS ile kalibre et (canlı servis toplar, gece ETL'i uygular)

## Aşama 6: Ankara

- [x] live: Ankara sağlayıcı arayüzü (`live/src/providers/ego.ts`), `/live/ankara/vehicles` ve `/live/ankara/arrivals` uç noktaları, sahte veri modu (EGO_MOCK=1), testler, sözleşme belgesi (docs/ankara-live-provider.md)
- [x] Ankara canlı veri kaynağı `ego.ts` içinde: EGO Cepte servisi (hat bazında otobüsler, durak bazında kaç dk/sn kaldı, plaka, hız, yön, körüklü/engelli); uç noktalar EGO Mac projesinden (byigitt/egomac, MIT)
- [x] etl/ankara: EGO Cepte servisinden (`HatBilgileri`) hat listesi, hat bilgisi, sefer saatleri, sıralı duraklar ve güzergah çizgisi (günde bir kez, istekler arası bekleme)
- [x] etl/ankara: durak koordinatları: OSM yerine doğrudan EGO'dan (tam koordinat)
- [x] etl/ankara: otobüs güzergah geometrisi: EGO'nun kendi güzergah çizgisi; yoksa sıralı duraklardan
- [x] etl/ankara: Ankara GTFS (stops, routes, trips, stop_times, shapes, calendar) + gtfs-validator; metro ve Ankaray dahil (validator hatasız)
- [ ] MOTIS'e Ankara OSM kesiti ve GTFS'i ekle, Ankara test yolculukları
- [x] app: şehir seçici (İstanbul, Ankara), harita başlangıç görünümü; ilk açılışta şehir dışındaysan "Şehir seç", sonra "...'da değilsin, örnek konum seç"; alt menüde "Şehir değiştir"
- [x] app: Ankara raylı hatları resmi renkleriyle, otobüs güzergahları daha ince ve soluk çizgiyle; hat seçilince öne çıksın
- [x] app: Ankara durak kartı: canlı "kaç dk kaç sn var" listesi (plaka, kaç durak önce, engelli/körüklü)
- [ ] app: Ankara durak kartında canlı yoksa "tarifeye göre" saatler (MOTIS'te Ankara olunca)
- [x] app: Ankara canlı otobüs noktaları (hat sayfasında), iki ölçüm arasında yumuşak kaydırma
- [ ] app: canlı otobüs noktasında "x sn önce"
- [x] Hakkında ekranına Ankara atıfları (EGO, EGO Mac, OpenStreetMap katkıcıları)

Bitti sayılması için: Ankara'da bir durağa dokununca liste açılıyor, otobüs güzergahları çizili, sağlayıcı uygulandığında canlı noktalar hareket ediyor.
