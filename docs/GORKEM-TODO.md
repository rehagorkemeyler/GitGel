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

## 2. Alan adı ve Cloudflare Tunnel (Aşama 2)

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
