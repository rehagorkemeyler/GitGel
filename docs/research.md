# Ücretsiz İstanbul Ulaşım Uygulaması: Araştırma Raporu

Tarih: 26 Eylül 2026
Hedef: "Martı kadar basit, Google kadar ücretsiz, ama İstanbul raylı sistemini ondan iyi bilen" açık kaynak bir PWA.

## 1. Özet

Sonuçları kısaca:

1. Raylı sistemler için herkese açık bir canlı tren konumu API'si bulamadım. Metro İstanbul'un açık API'sinde 40'a yakın uç nokta var: hatlar, istasyonlar, tarifeler, istasyonlar arası süreler, hizmet durumu, arızalar, duyurular. Ama tren konumu ya da "sonraki tren kaç dakikada" bilgisi yok. Metro İstanbul'un kendi uygulaması ve sitesi de canlı takip sunmuyor. Rayist'in geliştiricisi de Play Store'daki yorumlarda kendi takibinin çoğunlukla tarifeye dayalı olduğunu kabul etmiş.
2. Otobüs ve metrobüs için canlı konum var. İETT'nin SOAP servisleri (GetFiloAracKonum_json, GetHatOtoKonum_json) bütün filonun anlık GPS konumunu, hızını ve en yakın durağını veriyor.
3. Statik veri sorunlu. İBB'nin çok operatörlü GTFS paketi (metro, Marmaray, vapur) 2023'ten beri güncellenmiyor ve "bu veri güncellenmeyecektir" diye işaretli. M11, M12, T5 ve yeni uzantılar içinde yok. İETT otobüs GTFS'i güncel (Nisan 2026) ama bozuk yayınlanıyor.
4. Bu yüzden raylı sistem GTFS'ini kendimiz üretmemiz gerekiyor: Metro İstanbul API'sinden (tarifeler ve istasyonlar arası süreler) ve OpenStreetMap geometrisinden.
5. Rota motoru için MOTIS öneriyorum: MIT lisanslı, az bellek kullanıyor, geocoding (yani "Nereye?" araması) ve harita tile'ı içinde geliyor, GTFS-RT destekliyor. MacBook'unu rahat kaldırır.
6. Lisans uygun. İBB Açık Veri Lisansı ticari ve ticari olmayan kullanıma, yeniden dağıtıma ve ürüne entegrasyona izin veriyor, sadece atıf şart.

Önemli not: Bulunduğum ortamın ağ kısıtlaması nedeniyle API'leri canlı olarak çağırıp yanıtlarını göremedim. Uç nokta listesi resmi yardım sayfasından alındı. Claude Code ile ilk iş olarak bunları kendi bilgisayarından test etmek gerekiyor (bkz. Bölüm 8).

## 2. Canlı tren konumu: gerçek durum ve çözüm

### 2.1 Ne var, ne yok

| Kaynak | Canlı konum | Not |
|---|---|---|
| Metro İstanbul açık API (api.ibb.gov.tr/MetroIstanbul) | Yok | Tarife, istasyonlar arası süre, hizmet durumu, arıza var |
| Metro İstanbul uygulaması ve sitesi | Yok | Tarife ve ekipman durumu gösteriyor |
| Marmaray (TCDD Taşımacılık) | Yok | Sadece web sayfasında günlük tren saatleri |
| İETT otobüs ve metrobüs | Var | GetFiloAracKonum_json, GetHatOtoKonum_json |
| Rayist | Büyük ölçüde tarife tahmini | Geliştiricinin kendi açıklaması |

Senin "İBB live API'dan geliyor" dediğin kaynağı resmi dokümantasyonda bulamadım. Bildiğin belirli bir uç nokta varsa (örneğin başka bir uygulamanın ağ trafiğinde gördüğün bir adres) bana ilet, onu da incelerim.

### 2.2 Senin interpolasyon fikrin

Fikir doğru ve sektörde standart yöntem bu: trenin bir istasyondan çıkış anını ve bir sonraki istasyona varış anını biliyorsan, aradaki konumu hat geometrisi üzerinde hesaplayabilirsin. Google Maps'teki küçük toplar da çoğu şehirde böyle çalışıyor.

Hesap şöyle:

```
ilerleme = (şimdi - kalkış_i) / (varış_i+1 - kalkış_i)      0 ile 1 arası
konum    = hat_çizgisi.nokta_bul(mesafe_i + ilerleme * (mesafe_i+1 - mesafe_i))
```

Daha gerçekçi görünüm için sabit hız yerine hızlanma, seyir ve yavaşlama (trapez hız profili) kullanılabilir, istasyonda da 20 ila 40 saniyelik bekleme süresi eklenir.

Sorun formülde değil, "tam olarak ne zaman girdi" verisinde. Canlı olay verisi olmadığı için üç kademeli bir yaklaşım öneriyorum:

1. Kademe 1, tarifeye dayalı (ilk sürüm): Metro İstanbul GetTimeTable ile kalkış saatlerini, GetStationBetweenTime ile istasyonlar arası süreleri alıp her treni tarifeye göre hat üzerinde hareket ettiririz. Arayüzde bu noktalar açıkça "tarifeye göre" olarak işaretlenir (örneğin içi boş halka). İstanbul metrosunun sürücüsüz ve CBTC sinyalli hatları (M4, M5, M11 gibi) oldukça dakik çalıştığı için bu tahmin çoğu zaman makul olur, ama gerçek değildir ve öyle sunulmaz.
2. Kademe 2, hizmet durumuyla düzeltme: GetServiceStatuses ve arıza servisleri bir hatta aksama gösterdiğinde o hattın tahmini noktaları gizlenir ya da "sefer düzensiz" uyarısı çıkar. Böylece en azından yanlış güven vermeyiz.
3. Kademe 3, gerçek olay verisi (gelecek): İki yol var. Birincisi resmi: Metro İstanbul'un sinyalizasyon sisteminde bu veri zaten var. İBB Açık Veri Portalı'nın veri seti talep formu ya da Bilgi Edinme başvurusuyla "raylı sistem araç konum" servisi istenebilir. Açık kaynak ve ücretsiz bir kamu yararı projesi olarak başvurmak ciddiye alınma şansını artırır. İkincisi topluluk: kullanıcıların "tren geldi" dokunuşlarıyla varış anlarını toplamak. Yer altında GPS çalışmadığı için telefon konumu işe yaramaz, ama anonim bir dokunuş yeterli bir sinyal olabilir. Bu ikinci sürüm için düşünülmeli.

Otobüs ve metrobüs tarafında ise gerçek GPS var. Orada interpolasyonu farklı kullanırız: 15 ila 30 saniyede bir gelen konumu hat çizgisine oturtup, iki ölçüm arasında aracı yumuşak biçimde kaydırırız. Bu noktalar içi dolu ve "canlı" olarak gösterilir.

## 3. Veri kaynakları

| Veri | Kaynak | Durum | Kullanım |
|---|---|---|---|
| İETT otobüs GTFS | data.ibb.gov.tr/dataset/iett-gtfs-verisi | Güncel (21 Nisan 2026), bozuk biçimli | Otobüs rotaları |
| Çok operatörlü GTFS (metro, Marmaray, İDO, minibüs vb.) | data.ibb.gov.tr/dataset/public-transport-gtfs-data | 2021 ila 2023 arası, güncellenmeyecek | Sadece referans, geometri kontrolü |
| Metro İstanbul REST API | api.ibb.gov.tr/MetroIstanbul/Help | Aktif | Raylı GTFS'i üretmek, durum, duyuru |
| İETT SOAP servisleri | api.ibb.gov.tr/iett/... | Aktif | Canlı otobüs ve metrobüs konumu, duyurular |
| Marmaray saatleri | tcddtasimacilik.gov.tr/marmaray | Sadece web sayfası | Marmaray GTFS'ini elle ya da betikle üretmek |
| Harita ve hat geometrisi | OpenStreetMap | Güncel | Hat çizgileri, yürüme ağı, arama |
| Harita görüntüsü | OpenFreeMap | Ücretsiz, limitsiz, anahtarsız | Arka plan harita |

### 3.1 Metro İstanbul API'sindeki işe yarar uç noktalar

Taban adres: `https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/`

| Uç nokta | Yöntem | İşe yarayan kısım |
|---|---|---|
| GetLines, GetStations, GetStationById/{LineId} | GET | Hat ve istasyon listesi |
| GetDirections, GetDirectionById/{LineId} | GET | Yön bilgisi |
| GetTimeTable | POST | Sefer tarifeleri |
| GetStationBetweenTime | POST | İstasyonlar arası süre, interpolasyonun temeli |
| GetServiceStatuses | GET | Hatların hizmet durumu |
| GetAnnouncements/{Language} | GET | Duyurular (TR/EN) |
| GetFailureTypes, GetFaultyEquipments | GET | Arızalar, asansör ve yürüyen merdiven durumu |

### 3.2 İETT GTFS'teki bilinen hatalar

Aynı veriyle çalışmış bir açık kaynak proje (Miqell24/istanbul-bus-map) şunları belgelemiş, ETL aşamasında hepsini düzeltmemiz gerekecek:

1. stop_times CSV'si Excel satır sınırında (1.048.575 satır) kesilmiş, 1.096 hattın sadece 139'unu kapsıyor. Tam veri (6,2 milyon satır) ayrı ZIP kaynağında.
2. Dosyalar noktalı virgülle ayrılmış ve metin çift kodlanmış ("KADIKÃ–Y" aslında "KADIKÖY"). Hat kodları da etkileniyor ("11CÃœ" aslında "11CÜ").
3. Koordinatlarda ondalık nokta kaybolmuş ("410.191.700.005.564" aslında 41.0191700005564).
4. Otobüs hatlarında shape (güzergah çizgisi) hiç yok. Durak sırası OSM yol ağına oturtularak çizilmesi gerekiyor.

Raylı paket ise cp1254 kodlamalı ve kendi haliyle geçerli GTFS değil.

## 4. Önerilen mimari

```
Kullanıcı telefonu (PWA)
  │
  ├── Cloudflare Pages ── statik uygulama (ücretsiz)
  ├── OpenFreeMap ─────── harita tile'ları (ücretsiz)
  │
  └── Cloudflare Tunnel ─► MacBook (ev)
                             ├── MOTIS: rota + "Nereye?" araması
                             ├── canli-servis: İETT GPS + raylı tarife simülasyonu
                             │     → araç konumlarını JSON / GTFS-RT olarak verir
                             └── ETL (günde 1 kez): temiz GTFS üretir, MOTIS'i yeniden yükler
```

### 4.1 Bileşenler

| Katman | Seçim | Neden |
|---|---|---|
| Ön yüz | Vite + React + TypeScript, vite-plugin-pwa | Claude Code'un en rahat çalıştığı yığın, PWA desteği hazır |
| Harita | MapLibre GL JS + OpenFreeMap | Google'a bağımlılık ve ücret yok, akıcı vektör harita |
| Rota ve arama | MOTIS | MIT lisans, düşük bellek, geocoding ve GTFS-RT dahil, tek binary |
| Canlı servis | Küçük bir Node.js ya da Python servisi | İETT'yi sorgular, raylı simülasyonu hesaplar, önbelleğe alır |
| ETL | Python (pandas) | GTFS temizleme ve raylı GTFS üretimi |
| Dağıtım | Docker Compose + Cloudflare Tunnel | Ev ağında port açmadan yayın |

### 4.2 Neden OpenTripPlanner değil de MOTIS

OpenTripPlanner 2 de iyi bir seçenek ve dünyada yaygın. Ama Java tabanlı ve bellek ihtiyacı yüksek (resmi dokümanda Finlandiya için 10 GB'ın üzeri). Arama (geocoding) için ayrıca bir servis gerekiyor. MOTIS aynı işi daha az bellekle yapıyor, arama ve tile servisi içinde geliyor ve Transitous'un dünya çapındaki ücretsiz servisi de MOTIS üzerinde çalışıyor. Bu yüzden 16 GB'lık bir dizüstü için MOTIS daha doğru.

### 4.3 Martı tarzı ilk ekran

Açılış: konumunda harita, altta tek bir "Nereye?" kutusu, hepsi bu. Pop-up yok, hesap yok, hediye kutusu yok.

Akış: "Nereye?" dokun, "yenikapı" yaz, öneriler anında gelir (MOTIS geocoding, İstanbul'a sınırlı ve istasyon adlarına öncelikli), seç, 2 ila 3 rota seçeneği kart olarak çıkar, birine dokununca hat çizgisi ve üzerinde araç noktaları görünür.

Bu akışta hedef, uygulamayı açtıktan sonra 5 saniye içinde rotayı görmek.

## 5. MacBook sunucu olarak

Donanım: i5-10250H (4 çekirdek, 8 thread), 16 GB RAM.

Tahmini kullanım (doğrulanması gerekiyor): İstanbul ölçeğinde MOTIS birkaç GB bellekle rahat çalışmalı. Canlı servis ve ETL birlikte 1 ila 2 GB. Geriye Immich ve sistem için yer kalıyor. Ön yüz ve harita dışarıda (Cloudflare ve OpenFreeMap) sunulduğu için MacBook'a sadece rota ve canlı konum istekleri geliyor. Canlı konum yanıtı 10 ila 15 saniye önbelleklenirse aynı anda 200 ila 300 kullanıcı sorun olmaz.

Dizüstü sunucu için pratik notlar:

1. Uyku: kapak kapalıyken ve prizdeyken uyumaması için sistem ayarı ya da caffeinate gerekli.
2. Pil: sürekli prizde duran Intel MacBook'larda pil şişmesi riski var. Şarjı yüzde 80 civarında sınırlayan bir araç kullanmak iyi olur.
3. Isı: Intel i5 yük altında ısınır, havalandırması açık bir yerde durmalı.
4. Ev interneti: kesintide uygulama da durur. Ön yüz Cloudflare'de olduğu için en azından "sunucuya ulaşılamıyor" mesajı düzgün gösterilebilir.

## 6. Lisans ve atıf

İBB Açık Veri Lisansı kopyalama, yayınlama, dağıtma, uyarlama ve ticari ya da ticari olmayan kullanıma, kendi ürününe entegre etmeye izin veriyor. Şart: kaynağa atıf. Uygulamada "Hakkında" sayfasına İBB Açık Veri, Metro İstanbul, İETT, OpenStreetMap katkıcıları ve OpenFreeMap atıfları konmalı. Veri "olduğu gibi" sunuluyor, sürekli erişim garanti değil, bu yüzden her kaynağın önbelleklenmesi ve kaynak düşünce uygulamanın zarif şekilde devam etmesi gerekiyor.

Kod lisansı için önerim AGPL-3.0: kod herkese açık, ama biri alıp sunucu tarafında kapalı ve ücretli bir sürüm çalıştırırsa değişikliklerini açmak zorunda.

## 7. Yol haritası

| Aşama | İçerik | Sonuç |
|---|---|---|
| 0. Keşif | Tüm API'leri kendi bilgisayarından test et, yanıt örneklerini kaydet | Veri gerçekten ne veriyor, netleşir |
| 1. Veri | ETL: İETT GTFS'i temizle, raylı GTFS'i Metro İstanbul API + OSM'den üret, Marmaray'ı ekle | Tek, geçerli bir İstanbul GTFS'i |
| 2. Rota | MOTIS'i MacBook'ta Docker ile kur, GTFS ve İstanbul OSM ile besle | Yenikapı → Ayrılıkçeşmesi sorusu doğru cevap verir |
| 3. Ön yüz | Martı tarzı PWA: harita + "Nereye?" + rota kartları | Kullanılabilir ilk sürüm |
| 4. Canlı | İETT GPS noktaları + raylı tarife simülasyonu + hizmet durumu | Hat üzerinde hareket eden noktalar |
| 5. Yayın | Cloudflare Pages + Tunnel, alan adı, atıflar, AGPL, GitHub | Herkese açık |
| 6. Sonrası | Metro İstanbul'a veri talebi, topluluk "tren geldi" sinyali, mağaza sürümleri (Capacitor) | Gerçek canlı raylı konum yolunda |

Ölçüt olarak basit bir test listesi öneriyorum: Rayist'in başarısız olduğu iki sorgu (Kadıköy → Alibeyköy, Yenikapı → Ayrılıkçeşmesi) ve 20 kadar gerçek İstanbul yolculuğu. Her sürümde Google Maps sonucuyla karşılaştırılır.

## 8. Claude Code için ilk görev

Kendi bilgisayarında (normal terminalde) şu uç noktaları çağırıp yanıtları `samples/` klasörüne kaydetmek:

```
GET  https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/GetLines
GET  https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/GetStations
GET  https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/GetServiceStatuses
POST https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/GetTimeTable
POST https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/GetStationBetweenTime
SOAP https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx  (GetFiloAracKonum_json)
```

POST gövdelerinin alanları yardım sayfasında (api.ibb.gov.tr/MetroIstanbul/Help) her uç noktanın detayında yazıyor. Bu yanıtlar geldikten sonra ETL ve simülasyon tasarımı kesinleşir.

## 8.1 Doğrulanan testler (26 Eylül 2026, Görkem'in bilgisayarından)

| Test | Sonuç | Not |
|---|---|---|
| Metro İstanbul GetServiceStatuses | Çalışıyor, anahtarsız | Sadece sorunlu hatları döndürüyor (örnek: M7 Mecidiyeköy onarımı). Alanlar: LineId, LineName, Description, UpdateDate, LineColor |
| Metro İstanbul GetLines | Çalışıyor, anahtarsız | Id, Name, FunctionalCode, Color (RGB), FirstTime, LastTime, Order. HTML içerikte sefer süresi ve pik saat sıklığı yazıyor. M11, Marmaray, F2, T2 listede yok |
| Metro İstanbul GetStationById/{LineId} | Çalışıyor, anahtarsız | Sıralı istasyonlar, enlem ve boylam, yürüyen merdiven ve asansör sayısı |
| Metro İstanbul GetAnnouncements/tr | Çalışıyor, anahtarsız | 14 Eylül 2026'da kış tarifesine geçilmiş, tarife düzenli yenilenmeli |
| Metro İstanbul Help sayfası, GetTimeTable, GetStationBetweenTime | Tarayıcıdan açılmadı | POST gövdesi hâlâ bilinmiyor |
| İETT GetFiloAracKonum_json (SOAP) | Çalışıyor, anahtarsız | Tüm filo: KapiNo, Plaka, Enlem, Boylam, Hiz, Saat, Operator. Hat kodu yok. Bazı kayıtlar saatlerce eski (park halindeki araçlar), zaman filtresi şart |
| İETT GetHatOtoKonum_json (SOAP, HatKodu) | Çalışıyor, anahtarsız | Hat bazında: kapino, enlem, boylam, hatkodu, guzergahkodu, yon, son_konum_zamani, yakinDurakKodu. Canlı otobüs katmanı için ana kaynak |
| İETT GetFiloDurum_json | Ağ geçidinde kapalı | WSDL'de tanımlı ama dışarıya açık değil |
| metro.istanbul "Nasıl Giderim?" | Moovit gömülü | Metro İstanbul'un resmi yol tarifi moovitapp.com tripplan üzerinden çalışıyor (linesarrival istekleri Moovit'e gidiyor). Moovit'in özel API'si kullanılmayacak |
| rayist.com.tr | Sadece tanıtım sitesi | Web üzerinde uygulama arayüzü yok |

İETT SOAP çağrı şablonu:

```
curl -s -X POST "https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx" \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H 'SOAPAction: "http://tempuri.org/GetHatOtoKonum_json"' \
  -d '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetHatOtoKonum_json xmlns="http://tempuri.org/"><HatKodu>500T</HatKodu></GetHatOtoKonum_json></soap:Body></soap:Envelope>'
```

Yanıt, SOAP zarfının içinde metin olarak gömülü bir JSON dizisi. Ayrıştırma: XML'den GetHatOtoKonum_jsonResult içeriğini al, JSON olarak çöz.

## 8.2 API keşfi sonucu (26 Eylül 2026)

GetTimeTable ve GetStationBetweenTime gövdeleri deneme yoluyla bulundu, ayrıntılar ve örnekler docs/api-samples/README.md'de. Özet: `{"BoardingStationId": 20, "DirectionId": 34}` (DirectionId, GetDirectionById/{LineId}'den gelen gerçek kimlik). GetTimeTable DateTime verilmezse bugünün tüm seferlerini, verilirse o saatin seferlerini döndürüyor. GetStationBetweenTime yönün tüm istasyonlarını ilk istasyondan birikimli dakika olarak veriyor. Bu yüzden CLAUDE.md'deki yedek plana (FirstTime/LastTime + sıklık) gerek yok: raylı GTFS gerçek tarifeden üretilecek. api.ibb.gov.tr ağ geçidi isteklerin yaklaşık yarısında 503 veriyor, her istemci yeniden denemeli.

## 8.3 Mod bazında veri kaynağı kararları (26 Eylül 2026)

| Mod | Tarife kaynağı | Durak ve geometri | Not |
|---|---|---|---|
| Otobüs, metrobüs (İETT) | İETT GTFS ZIP (data.ibb.gov.tr/dataset/iett-gtfs-verisi) | GTFS stops; shape yok, durak sırasından çizilir | Temizleme etl/iett'te |
| Metro İstanbul hatları (18 hat: M1A, M1B, M2 to M9, T1, T3, T4, T5, F1, F4, TF1, TF2) | API GetTimeTable (gün ve yön bazında), GetStationBetweenTime (istasyon ofsetleri) | GetStationById + OSM route ilişkileri | Hafta içi, cumartesi, pazar için ayrı sorgu |
| Marmaray | TCDD Taşımacılık web sayfası (makine okunur kaynak yok, buradan 502 veriyor). Karar: repo içinde elle tutulan `etl/other/manual/marmaray.yaml` (ilk ve son sefer, dönem bazında sıklık, istasyonlar arası süre, kaynak URL ve tarih). GTFS'e frequencies.txt ile girilir | İstasyonlar ve geometri OSM (route=train, Marmaray ilişkisi); eski çok operatörlü GTFS kontrol için | Tarife değişince YAML güncellenir; ETL YAML 180 günden eskiyse uyarır |
| M11 | Metro İstanbul işletmiyor, API'de yok. Aynı yöntem: `etl/other/manual/m11.yaml` (06:00 to 00:00, sıklık, istasyon süreleri; kaynak: işletmeci sitesi ve basın) | OSM route=subway M11 ilişkisi | Halkalı to Arnavutköy kesimi Haziran 2026'da açıldı, OSM'de güncelliği kontrol edilmeli |
| Diğer eksikler (T2 nostaljik, F2 Tünel, varsa M12) | Aynı elle tutulan YAML yöntemi | OSM | Düşük öncelik |
| Vapur (Şehir Hatları, Turyol, Dentur, İDO) | Bkz. 8.4 | İBB deniz-ulasim-istasyonlari ve deniz-ulasim-hatlari-vektor-verisi (GeoJSON, 2025) + eski GTFS stops | |

Genel ilke: işletmecinin kendi sitesi dış çağrıyı açıkça reddediyorsa (metro.istanbul AJAXSeferGetir gibi) atlatılmaz. Elle tutulan tarifeler "tarifeye göre" etiketiyle gösterilir, hiçbir zaman "canlı" değildir.

## 8.4 Vapur kaynağı kararı (26 Eylül 2026)

1. Eski çok operatörlü GTFS'te vapur verisi var ve 2024'te güncellenmiş: Şehir Hatları 69, Turyol 18, Dentur 8, İDO 5 hat, stop_times ve frequencies ile. Başlangıç tabanı bu olacak (cp1254 kodlu, dönüştürülecek).
2. Güncel Şehir Hatları tarifesi sehirhatlari.istanbul'da, ama sitenin bot koruması bulut IP'lerine 403 veriyor. ETL her gece dener; olmazsa taban veri kullanılır. Görkem'in ya da sunucunun erişip erişemediği denenmeli.
3. Turyol ve Dentur sitelerindeki tarife sayfaları yıl içinde az değişiyor; hat bazında elle tutulan `etl/other/manual/ferries_*.yaml` ile eski GTFS'in üzerine yazılır.
4. Hat geometrisi İBB deniz-ulasim-hatlari-vektor-verisi GeoJSON'undan.

## 9. Açık sorular ve riskler

1. Raylı sistemde gerçek canlı veri yok. Ürünün "Google'dan iyi" iddiası ilk sürümde canlı konuma değil; hıza, sadeliğe, İstanbul'a özel doğru rotaya, hizmet durumuna ve dürüst etiketlemeye dayanmalı.
2. Metro İstanbul API'sinin istek sınırı, kimlik doğrulama isteyip istemediği ve yanıt biçimi test edilmeden bilinmiyor.
3. Marmaray için makine tarafından okunabilir bir kaynak yok, web sayfasından üretmek gerekecek ve tarife değişikliklerini takip etmek gerekecek.
4. Vapur (Şehir Hatları, Turyol, Dentur, İDO) verisi eski. Tüm toplu taşıma kapsamı için vapur tarifelerini ayrıca araştırmak gerekiyor.
5. Tek bir dizüstü tek arıza noktası. Kullanıcı sayısı büyürse küçük bir VPS'e taşınma planı hazır olmalı.

## Kaynaklar

1. İBB Açık Veri, Toplu Ulaşım GTFS Verisi: https://data.ibb.gov.tr/dataset/public-transport-gtfs-data
2. İBB Açık Veri, İETT GTFS Verisi: https://data.ibb.gov.tr/dataset/iett-gtfs-verisi
3. İBB Açık Veri, API listesi: https://data.ibb.gov.tr/dataset?res_format=API
4. Metro İstanbul Web Servisleri Yardım Sayfası: https://api.ibb.gov.tr/MetroIstanbul/Help
5. Metro İstanbul Sefer Tarifeleri Web Servisi: https://data.ibb.gov.tr/en/dataset/metro-istanbul-sefer-tarifeleri-listesi-web-servisi
6. Metro İstanbul resmi sitesi: https://www.metro.istanbul/
7. Metro İstanbul uygulaması (App Store): https://apps.apple.com/tr/app/metro-i-stanbul/id570644574
8. İETT SOAP servisleri notları: https://burakbayramli.github.io/dersblog/sk/2023/01/iett-ibb-otobus-verisi.html
9. İETT Web Servis Kullanım Dokümanı: https://data.ibb.gov.tr/en/dataset/53b985b6-24af-4fda-aa59-1b45dde2e665/resource/6efd7520-0fbf-421b-975a-a73cb9137ef2/download/iett-web-servis-kullanm-dokuman.pdf
10. Miqell24/istanbul-bus-map (GTFS hataları): https://github.com/Miqell24/istanbul-bus-map
11. MobilityData, İstanbul GTFS tartışması: https://github.com/MobilityData/mobility-database-catalogs/issues/1390
12. Hero4mohamed/Metro-Istanbul-General-City-Map: https://github.com/Hero4mohamed/Metro-Istanbul-General-City-Map
13. MOTIS: https://github.com/motis-project/motis
14. OpenTripPlanner sistem gereksinimleri: https://docs.opentripplanner.org/en/v2.3.0/System-Requirements/
15. OpenFreeMap: https://openfreemap.org/
16. İBB Açık Veri Lisansı: https://data.ibb.gov.tr/license
17. Marmaray tren saatleri: https://www.tcddtasimacilik.gov.tr/marmaray/tr/gunluk_tren_saatleri
18. Rayİst, Google Play: https://play.google.com/store/apps/details?id=co.median.android.bnnnywd&hl=tr
