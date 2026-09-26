# Metro İstanbul'a canlı tren verisi talebi (taslak)

Gönderim yolu: İBB Açık Veri Portalı "Veri Seti Talep Et" formu (https://data.ibb.gov.tr) ve/veya Metro İstanbul iletişim formu (https://www.metro.istanbul, "Bize Ulaşın"). Gerekirse CİMER / Bilgi Edinme (4982 sayılı Kanun) başvurusu olarak da kullanılabilir.

---

**Konu:** Raylı sistemlerde tren konumu / istasyona varış tahmini verisinin açık veri olarak yayımlanması talebi

Sayın Metro İstanbul A.Ş. ve İBB Açık Veri Ekibi,

İstanbul için ücretsiz, reklamsız, üyeliksiz ve açık kaynak kodlu (AGPL-3.0) bir toplu taşıma uygulaması olan GitGel'i geliştiriyorum (https://github.com/rehagorkemeyler/GitGel). Uygulama, İBB Açık Veri Portalı'nda yayımlanan Metro İstanbul web servislerini (hat, istasyon, sefer tarifesi, istasyonlar arası süre, hizmet durumu ve duyurular) ve İETT'nin araç konum servislerini İBB Açık Veri Lisansı'na uygun şekilde, kaynak göstererek kullanmaktadır.

Otobüs ve metrobüs için İETT'nin yayımladığı anlık araç konumu sayesinde yolculara "canlı" bilgi verebiliyoruz. Raylı sistemlerde ise böyle bir açık veri bulunmadığı için tren konumlarını yalnızca tarifeden hesaplayabiliyor ve bunu kullanıcıya açıkça "tarifeye göre" diye belirtiyoruz.

Bu nedenle, mümkünse aşağıdakilerden birinin veya birkaçının açık veri olarak yayımlanmasını rica ediyorum:

1. Hat bazında trenlerin anlık konumu ya da son geçtiği istasyon ve zaman bilgisi (sinyalizasyon/CBTC sistemlerinde zaten üretilen veri).
2. İstasyon bazında sonraki trenlerin tahmini varış süreleri (istasyon ekranlarında gösterilen bilgi).
3. Tercihen uluslararası GTFS-Realtime standardında (VehiclePositions ve/veya TripUpdates) veya mevcut MetroMobile V2 servislerine eklenecek bir uç nokta olarak.

Ayrıca iki küçük teknik bildirimde bulunmak isterim:

- `GetDirections` uç noktası 500 hatası dönmektedir.
- `GetStationBetweenTime` bazı hatlarda (ör. M3, M9) "Sequence contains more than one element" hatası vermektedir; `GetStationById/5` yanıtında Sultanbeyli, Hasanpaşa ve Veysel Karani istasyonlarının koordinatları boştur.
- `api.ibb.gov.tr` ağ geçidi isteklerin önemli bir kısmına 503 dönmektedir.

Veri yayımlanırsa, uygulama tamamen ücretsiz ve reklamsız kalmaya devam edecek, kaynak olarak Metro İstanbul ve İBB Açık Veri Portalı gösterilecek ve kodu herkese açık olacaktır. Konuyla ilgili her türlü teknik görüşmeye hazırım.

Saygılarımla,

Görkem Eyler
GitGel geliştiricisi
[e-posta]
[telefon, isteğe bağlı]
