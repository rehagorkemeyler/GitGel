#!/usr/bin/env bash
# One-time server setup for GitGel on Oracle Cloud (Ubuntu 24.04, ARM64).
# Run as root:  sudo bash setup-server.sh "<deploy public key>"
# Safe to re-run.
set -euo pipefail

DEPLOY_PUBKEY="${1:-}"
REPO_URL="https://github.com/rehagorkemeyler/GitGel.git"
APP_DIR="/opt/gitgel"
APP_USER="ubuntu"

echo "==> System updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -yq -o Dpkg::Options::="--force-confold" upgrade
apt-get install -yq git curl ca-certificates unattended-upgrades

echo "==> Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

echo "==> Firewall: keep only SSH (22) open"
# Oracle's Ubuntu image manages the firewall with iptables rules that already
# allow only 22; enabling ufw breaks them, so we only verify.
if iptables -S INPUT | grep -q -- "--dport 22"; then echo "iptables: port 22 rule present"; fi
iptables -S INPUT | grep -E "dport (80|443)" && echo "WARNING: 80/443 open in iptables" || true

echo "==> Swap (4 GB)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "$APP_USER"
systemctl enable --now docker

echo "==> Repository in $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod +x "$APP_DIR/infra/deploy.sh"

if [ -n "$DEPLOY_PUBKEY" ]; then
  echo "==> Deploy key (can only run infra/deploy.sh)"
  AK="/home/$APP_USER/.ssh/authorized_keys"
  LINE="command=\"$APP_DIR/infra/deploy.sh\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $DEPLOY_PUBKEY"
  grep -qF "$DEPLOY_PUBKEY" "$AK" || echo "$LINE" >> "$AK"
fi

echo "==> Done"
docker --version
swapon --show
echo "GITGEL SETUP OK"
