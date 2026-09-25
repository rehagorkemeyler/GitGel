# GitGel

"Martı kadar basit, Google kadar ücretsiz, ama İstanbul raylı sistemini ondan iyi bilen."

## Vizyon

İstanbul'da yaşayan herkes, nereden nereye gideceğini telefonu açtıktan sonra 5 saniye içinde, para ödemeden, reklam izlemeden ve üye olmadan öğrenebilmeli.

## Misyon

İstanbul'un zaten halka açık olan ulaşım verisini, sade, hızlı ve dürüst bir araçla halka geri vermek. Kod açık kaynak (AGPL-3.0), veri kaynakları açık, sunucu maliyeti sıfır.

## İlkeler

| İlke | Anlamı |
|---|---|
| 5 saniye kuralı | Aç, "Nereye?" yaz, rotayı gör. Arada hiçbir engel yok |
| Sıfır engel | Pop-up yok, hesap yok, paywall yok, reklam yok |
| Dürüstlük | Canlı veri "canlı", tahmin "tarifeye göre" diye işaretlenir |
| Gizlilik | Konum telefonda kalır, kişisel veri toplanmaz ve satılmaz |
| Açıklık | Kod açık, veri kaynakları ve atıflar uygulamada yazılı |
| Az ama doğru | Her özellik "bir yerden bir yere gitmeye yardım ediyor mu?" sorusundan geçer |
| Minimum bilişsel yük | Bir ekranda bir karar. Kullanıcı hiçbir zaman "şimdi ne yapacağım?" diye düşünmez |

## İlk sürüm (MVP)

| Özellik | Açıklama |
|---|---|
| Ana ekran | Konumunda tam ekran harita. Altta panel: "Nereye?" arama kutusu, altında yan yana iki kare buton ("Yakın duraklar", "Hat ve sefer ara"), en altta iki küçük buton ("Bize ulaşın", "Destek olun") |
| Arama | Yazarken anında öneri. İstasyon ve durak adları önce gelir, yazım hatasını ve Türkçe karaktersiz yazımı tolere eder |
| Rota | Tüm toplu taşıma: metro, Marmaray, tramvay, füniküler, teleferik, metrobüs, otobüs, vapur. 2 ila 3 seçenek, süre, aktarma sayısı, yürüme |
| Rota detayı | Hat renkleri, durak sayısı, aktarma istasyonu, sonraki kalkış |
| Canlı otobüs ve metrobüs | İETT GPS verisi. İçi dolu nokta, "canlı" etiketi |
| Raylı sistem noktaları | Tarifeye göre hesaplanan tren konumu. İçi boş nokta, "tarifeye göre" etiketi. Hatta aksama varsa gizlenir |
| Hat durumu | Aksama olan hatlarda sade bir uyarı bandı |
| Yakın duraklar | En yakın istasyon ve duraklar, yürüme mesafesiyle |
| Hat ve sefer ara | Hat listesi, hat sayfası, istasyonlar, ilk ve son sefer |
| Bize ulaşın | İletişim bilgisi, hata bildirme linki (GitHub Issues) |
| Destek olun | Proje hakkında kısa metin, bağış linki (sonra bağlanacak), GitHub linki. Hiçbir özelliği kısıtlamaz, asla kendiliğinden açılmaz |
| Son aramalar | Sadece telefonda saklanır |
| Dil | Türkçe ve İngilizce |
| Tema | Açık ve koyu mod, sistem ayarını izler |

## Sonraki sürümler

Raylı sistemde gerçek canlı konum (Metro İstanbul'a resmi veri talebiyle), topluluktan "tren geldi" sinyali, ev ve iş kısayolları, sefer uyarıları, asansör ve yürüyen merdiven arıza bilgisi, mağaza sürümleri (Capacitor), Arapça.

## Asla olmayacaklar

Hesap ve üyelik. Abonelik, paywall, "premium". Reklam. Puan, kredi, hediye kutusu gibi oyunlaştırma. Yapay zeka asistanı. Hava durumu, eczane, gezi rehberi, uçak takibi gibi ulaşım dışı özellikler. Kullanıcı takibi, veri satışı. Sahte "canlı" etiketi. Moovit gibi özel, belgelenmemiş API'lere bağımlılık.

## Tasarım dili

Apple benzeri, sade ve profesyonel. Her telefonda akıcı çalışır.

| Konu | Kural |
|---|---|
| Izgara | 8 px ızgara. Tüm boşluklar 4, 8, 12, 16, 24, 32 |
| Köşeler | Tutarlı yarıçap ölçeği: 8 (küçük), 12 (buton), 16 (kart), 24 (alt panel). İç içe öğelerde iç yarıçap = dış yarıçap eksi iç boşluk, böylece kenarlar birbirine paralel durur |
| Yazı | Sistem yazı tipi (iOS'ta SF, Android'de Roboto). En fazla 3 boyut ve 2 kalınlık |
| Renk | Nötr gri tonlar, tek bir vurgu rengi. Hat renkleri resmi renkler (Metro İstanbul API'sinden) |
| Tema | Açık ve koyu mod renk değişkenleri, sistem ayarını izler |
| Efekt | Cam ve bulanıklık efekti yok. Hafif gölge ve ince kenarlıklar |
| Animasyon | Sadece transform ve opacity (60 fps). 200 ila 300 ms, yaylanan (spring) geçişler. Alt panel parmakla sürüklenir. "Hareketi azalt" ayarına uyar |
| Dokunma alanı | En az 44 x 44 px |
| Erişilebilirlik | WCAG AA kontrast, ekran okuyucu etiketleri |

## Başarı ölçütleri

Test yolculuklarının tamamında doğru rota. Açılıştan rotaya 5 saniyenin altı. Sunucu maliyeti sıfır. Rayist'in bulamadığı rotaları bulmak.
