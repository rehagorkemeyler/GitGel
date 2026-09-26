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
- [ ] GitHub Actions: her gece ETL'i çalıştır, çıktıyı yayınla

Bitti sayılması için: doğrulayıcıdan hatasız geçen tek bir İstanbul GTFS'i her gece otomatik üretiliyor.

## Aşama 2: Sunucu ve rota

- [x] [Görkem] Oracle Cloud Always Free hesabı aç
- [x] [Görkem] Ampere A1 Ubuntu 24.04 sunucu oluştur (4 OCPU, 24 GB, 100 GB disk, Milano bölgesi). Bağlantı: `ssh gitgel` (~/.ssh/config tanımlı, anahtar ~/.ssh/gitgel.key)
- [ ] Otomatik dağıtım: GitHub Actions ile main'e her push'ta sunucuda `git pull` ve `docker compose up -d` (ayrı deploy anahtarı, repo secret'ları). İlk kurulum [Görkem]
- [ ] Sunucu temel kurulumu: güncellemeler, güvenlik duvarı (sadece 22), otomatik güvenlik güncellemeleri, Docker, swap
- [x] infra/docker-compose.yml: motis + live servisleri
- [x] MOTIS'i İstanbul OSM kesiti ve bizim GTFS ile çalıştır
- [x] CLAUDE.md'deki test yolculuklarının hepsini MOTIS API'si ile dene, sonuçları docs/route-tests.md'ye yaz (ilk koşu yerelde aynı imaj ve ayarla; sunucu hazır olunca scripts/route_tests.py ile tekrar)
- [ ] [Görkem] Cloudflare'de alan adı ve Tunnel kur, api adresini sunucuya bağla
- [ ] Sunucu gece yeni GTFS'i çekip MOTIS'i yeniden yüklesin

Bitti sayılması için: test yolculuklarının hepsi internetten erişilebilen API'den doğru dönüyor.

## Aşama 3: Uygulama

- [x] app iskeleti: Vite + React + TS + PWA + MapLibre + OpenFreeMap, açık ve koyu tema değişkenleri, tasarım ölçekleri (VISION.md)
- [x] Ana ekran: tam ekran harita, konum izni, alt panel (Nereye, iki kare buton, iki küçük buton), sürüklenebilir panel animasyonu
- [x] Arama: MOTIS geocoding + yerel istasyon indeksi, Türkçe karakter ve yazım hatası toleransı, son aramalar (localStorage)
- [x] Rota sonuçları: 2 ila 3 kart, süre, aktarma, yürüme, hat renkleri
- [x] Rota detayı: adım adım, haritada çizim, sonraki kalkış
- [x] Yakın duraklar ekranı
- [ ] Hat ve sefer ara ekranı: hat listesi, hat sayfası
- [ ] Bize ulaşın ve Destek olun ekranları
- [ ] Türkçe ve İngilizce metinler
- [ ] GitHub Pages'e otomatik yayın
- [ ] Performans testi: düşük seviye Android'de akıcılık, açılıştan rotaya 5 saniye

Bitti sayılması için: gerçek telefonda 5 saniye kuralını geçiyor.

## Aşama 4: Canlı katman

- [ ] live servisi: İETT hat bazlı araç konumu (istek üzerine ve önbellekli), Metro İstanbul hizmet durumu ve duyurular
- [ ] Uygulamada canlı otobüs ve metrobüs noktaları, iki ölçüm arasında yumuşak kaydırma
- [ ] Raylı tarife simülasyonu: hat geometrisi üzerinde içi boş noktalar, "tarifeye göre" etiketi
- [ ] Hat durumu bandı, aksamalı hatta tahmini noktaları gizleme

Bitti sayılması için: noktalar hat üzerinde düzgün hareket ediyor, etiketler dürüst.

## Aşama 5: Yayın

- [ ] Hakkında ekranında tüm atıflar
- [ ] README'de ekran görüntüleri, kurulum ve katkı rehberi
- [ ] [Görkem] Duyuru ve ilk kullanıcılar
- [ ] [Görkem] Metro İstanbul'a canlı tren verisi için resmi talep (Claude Code taslak yazar)
