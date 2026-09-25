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

3. GitHub'a üç gizli değer ekle. Tarayıcıda https://github.com/rehagorkemeyler/GitGel/settings/secrets/actions/new sayfasını aç. Her biri için "Name" alanına adı yaz, "Secret" alanına komutun panoya kopyaladığı değeri yapıştır (Cmd+V), "Add secret"e bas:

   | Name | Değeri panoya kopyalayan komut |
   |---|---|
   | `DEPLOY_HOST` | `ssh -G gitgel \| awk '/^hostname /{print $2}' \| tr -d '\n' \| pbcopy` |
   | `DEPLOY_KEY` | `pbcopy < ~/.ssh/gitgel_deploy` |
   | `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -t ed25519 $(ssh -G gitgel \| awk '/^hostname /{print $2}') 2>/dev/null \| pbcopy` |

4. Dağıtımı dene: https://github.com/rehagorkemeyler/GitGel/actions/workflows/deploy-server.yml sayfasında "Run workflow" > "Run workflow". 1 dakika içinde yeşil tik görmelisin; içinde `deployed <commit>` satırı olur.

5. Sohbete şunların çıktısını yapıştır:

   ```
   ssh gitgel "free -h; df -h /; nproc; docker ps; sudo iptables -S INPUT | head -20"
   ```
