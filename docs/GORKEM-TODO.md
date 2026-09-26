# Görkem'in yapacakları

Claude Code'un senden beklediği adımlar. Bitirince çıktıyı sohbete yapıştır.

## 1. Sunucu ilk kurulum ve otomatik dağıtım (Aşama 2)

Bu adımlar bir kez yapılır. Sonrasında main'e her push'ta GitHub Actions sunucuda `git pull` ve `docker compose up -d` çalıştırır.

Mac'te Terminal'i aç ve sırayla yapıştır:

1. Sadece dağıtım için ayrı bir anahtar üret (şifre sormaz):

   ```
   ssh-keygen -t ed25519 -f ~/.ssh/gitgel_deploy -N "" -C gitgel-deploy
   ```

2. Sunucuyu kur (güncellemeler, otomatik güvenlik güncellemeleri, 4 GB swap, Docker, repo, deploy anahtarı). 5 ila 10 dakika sürer:

   ```
   ssh gitgel "curl -fsSL https://raw.githubusercontent.com/rehagorkemeyler/GitGel/main/infra/setup-server.sh -o /tmp/setup.sh && sudo bash /tmp/setup.sh '$(cat ~/.ssh/gitgel_deploy.pub)'"
   ```

   Beklenen: en sonda `Docker version 2x.x.x`, bir swap satırı (`/swapfile ... 4G`) ve `GITGEL SETUP OK`.

3. GitHub'a üç gizli değer ekle: https://github.com/rehagorkemeyler/GitGel/settings/secrets/actions/new. Dikkat: komutun kendisini değil, komutun çıktısını yapıştır.

   - `DEPLOY_HOST`: Terminal'de `ssh -G gitgel | awk '/^hostname /{print $2}'` çalıştır, ekrana çıkan IP'yi (örnek `152.70.12.34`) yaz.
   - `DEPLOY_KEY`: `pbcopy < ~/.ssh/gitgel_deploy` çalıştır (ekrana bir şey yazmaz), sonra alana Cmd+V. `-----BEGIN OPENSSH PRIVATE KEY-----` ile başlamalı.
   - `DEPLOY_KNOWN_HOSTS`: `ssh-keyscan -t ed25519 $(ssh -G gitgel | awk '/^hostname /{print $2}') 2>/dev/null` çalıştır, çıkan tek satırı (`IP ssh-ed25519 AAAA...`) yapıştır.

4. Dağıtımı dene: https://github.com/rehagorkemeyler/GitGel/actions/workflows/deploy-server.yml sayfasında "Run workflow" > "Run workflow". 1 dakika içinde yeşil tik görmelisin; içinde `deployed <commit>` satırı olur.

5. Sohbete şunların çıktısını yapıştır:

   ```
   ssh gitgel "free -h; df -h /; nproc; docker ps; sudo iptables -S INPUT | head -20"
   ```

## 2A. Ücretsiz yol: Tailscale Funnel (şimdilik bunu yap)

Alan adı almadan sunucuya sabit bir HTTPS adresi verir (`https://gitgel.XXXX.ts.net`). Sunucu bağlantıyı dışarı doğru kurar, 22 dışında port açılmaz. İleride alan adı alınca 2. bölüme geçeriz. 1. bölüm (secret'lar ve ilk dağıtım) bitmiş olmalı.

1. https://login.tailscale.com adresinde "Sign up" ile ücretsiz hesap aç (GitHub ile giriş yeterli). Kurulum sihirbazı bir cihaz eklemeni isterse bu adımı atla ya da Mac'ine kur, fark etmez.
2. Tailscale'i sunucuya kur ve bağla:

   ```
   ssh -t gitgel "curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up --hostname=gitgel"
   ```

   Ekrana `https://login.tailscale.com/a/...` ile başlayan bir adres yazar. Bu adresi tarayıcıda aç ve "Connect" de. Terminalde `Success.` görmelisin.
3. Yayını aç:

   ```
   ssh -t gitgel "sudo tailscale funnel --bg --set-path /live http://127.0.0.1:8081 && sudo tailscale funnel --bg http://127.0.0.1:8080"
   ```

   İlk seferde "Funnel is not enabled" deyip bir adres verebilir: o adresi tarayıcıda aç, "Enable" de, sonra komutu tekrar çalıştır.
4. Adresi öğren:

   ```
   ssh gitgel "tailscale funnel status"
   ```

   `https://gitgel.XXXX.ts.net` ile başlayan satır senin adresin.
5. https://github.com/rehagorkemeyler/GitGel/settings/variables/actions/new sayfasında iki değişken ekle (ikisinin değeri de aynı adres, sonunda `/` olmadan): Name `API_BASE`, Value `https://gitgel.XXXX.ts.net`. Sonra tekrar "New repository variable": Name `LIVE_BASE`, Value aynı adres.
6. Sohbete 4. adımın çıktısını ve şunun çıktısını yapıştır (adresi kendi adresinle değiştir):

   ```
   curl -s "https://gitgel.XXXX.ts.net/live/status" | head -c 200
   ```

## 2. Alan adı ve Cloudflare Tunnel (sonra, alan adı alınca)

Uygulama rotaları `api.<alan-adın>` adresinden alacak. Sunucuda 22 dışında port açılmaz; trafik Cloudflare Tunnel ile gelir. 1. adım (sunucu kurulumu) bitmiş olmalı.

1. Alan adı: https://dash.cloudflare.com adresinde ücretsiz hesap aç (varsa gir). Sol menüde "Domain Registration" > "Register Domains" ile bir alan adı al (örneğin `gitgel.app` ya da `gitgel.org`; yılda yaklaşık 10 ila 15 dolar, Cloudflare maliyet fiyatına satar). Başka yerden aldıysan "Add a domain" ile Cloudflare'e ekle ve verdiği iki nameserver'ı alan adını aldığın yerde gir.
2. Tünel: sol menüde "Zero Trust" > "Networks" > "Tunnels" > "Create a tunnel" > "Cloudflared" seç, ad olarak `gitgel` yaz, "Save tunnel".
3. Çıkan sayfada "Docker" sekmesindeki komutta `--token` sonrasındaki uzun metni kopyala (sadece token, `eyJ...` ile başlar). Bu sayfada başka bir şey kurma, "Next"e bas.
4. "Public Hostname" ekle: Subdomain `api`, Domain senin alan adın, Service Type `HTTP`, URL `localhost:8080`. "Save tunnel".
5. Token'ı sunucuya kaydet ve tüneli başlat (TOKEN yerine kopyaladığın metni yapıştır, tırnaklar kalsın):

   ```
   ssh gitgel "echo 'TUNNEL_TOKEN=TOKEN' > /opt/gitgel/infra/.env && chmod 600 /opt/gitgel/infra/.env && cd /opt/gitgel && COMPOSE_PROFILES=tunnel docker compose -f infra/docker-compose.yml up -d"
   ```

6. Dene (ALANADI yerine kendi alan adın):

   ```
   curl -s "https://api.ALANADI/api/v1/geocode?text=Taksim" | head -c 300
   ```

   Beklenen: `[{"type":"STOP",...` ile başlayan bir metin. İlk MOTIS içe aktarımı sunucuda 10 ila 20 dakika sürebilir; o sırada hata gelirse biraz bekle.

7. Sohbete alan adını ve 6. adımın çıktısını yapıştır.

## 3. GitHub Pages'i aç (Aşama 3)

Uygulama https://rehagorkemeyler.github.io/GitGel/ adresinde yayınlanacak.

1. https://github.com/rehagorkemeyler/GitGel/settings/pages sayfasını aç.
2. "Build and deployment" altında "Source" kutusunda "GitHub Actions" seç. Başka bir şeye dokunma.
3. https://github.com/rehagorkemeyler/GitGel/actions/workflows/deploy-pages.yml sayfasında "Run workflow" > "Run workflow".
4. 2 dakika sonra https://rehagorkemeyler.github.io/GitGel/ adresini telefonda aç. Harita ve "Nereye?" paneli görünmeli.

Alan adı ve tünel (2. bölüm) bitince bir değişken daha ekleyeceğiz: https://github.com/rehagorkemeyler/GitGel/settings/variables/actions/new sayfasında Name `API_BASE`, Value `https://api.ALANADI` (ALANADI senin alan adın). Sonra 3. adımı tekrarla.

## 4. Gerçek telefonda deneme (Aşama 3 sonu)

3. bölüm bittikten sonra, elindeki en yavaş Android telefonda:

1. Chrome ile https://rehagorkemeyler.github.io/GitGel/ adresini aç, menüden "Ana ekrana ekle".
2. Uygulamayı kapat, ana ekrandan aç, "Nereye?"ye dokun, bir istasyon yaz, seç. Açılıştan rota kartları görünene kadar geçen süreyi say.
3. Paneli parmakla yukarı aşağı sürükle; takılma var mı bak.
4. Süreyi ve gözlemini sohbete yaz.

### 2b. Canlı servis adresi (2. bölümle birlikte yap)

Tünel sayfasında ("Zero Trust" > "Networks" > "Tunnels" > `gitgel` > "Public Hostname" > "Add a public hostname") ikinci bir adres ekle: Subdomain `live`, Domain senin alan adın, Service Type `HTTP`, URL `localhost:8081`. Sonra https://github.com/rehagorkemeyler/GitGel/settings/variables/actions/new sayfasında Name `LIVE_BASE`, Value `https://live.ALANADI` değişkenini ekle.

Deneme: `curl -s "https://live.ALANADI/live/status" | head -c 300` komutu `{"lines":[` ile başlayan bir metin döndürmeli.
