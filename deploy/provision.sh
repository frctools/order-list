#!/usr/bin/env bash
#
# First-run setup for the droplet. Safe to re-run: every step checks for its
# own result first, so this doubles as the "is the box still configured right?"
# script.
#
#   ssh root@droplet 'bash -s' < deploy/provision.sh

set -euo pipefail

APP_USER="${APP_USER:-parts}"
APP_DIR="${APP_DIR:-/srv/parts}"
SWAP_SIZE="${SWAP_SIZE:-2G}"

log() { echo; echo "=== $* ==="; }

export DEBIAN_FRONTEND=noninteractive

log "Updating the base system"
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q ca-certificates curl gnupg git ufw fail2ban unattended-upgrades unzip build-essential python3

log "Swap"
# A 2 GB box with Postgres and two Node processes has no headroom for a spike.
# Swap turns "the OOM killer picked a process" into "it got slow for a moment".
if swapon --show | grep -q '/swapfile'; then
  echo "swapfile already active"
else
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Prefer keeping the app resident over swapping it out early.
sysctl -qw vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

log "Firewall"
# Postgres, the app and vendord all bind to localhost, so only Caddy and SSH
# need to be reachable. Set the rules before enabling, or enabling drops us.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose

log "Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
systemctl enable --now unattended-upgrades
systemctl enable --now fail2ban

log "Docker"
if command -v docker >/dev/null; then
  echo "docker already installed: $(docker --version)"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

log "Caddy"
if command -v caddy >/dev/null; then
  echo "caddy already installed: $(caddy version)"
else
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

log "Node.js (runs the PM2 daemon)"
if command -v node >/dev/null; then
  echo "node already installed: $(node --version)"
else
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi

log "Bun (runs the app and the package scripts)"
# Installed system-wide rather than into a home directory, so PM2 — which does
# not read the app user's shell profile — can find the interpreter by name.
if [ -x /usr/local/bin/bun ]; then
  echo "bun already installed: $(/usr/local/bin/bun --version)"
else
  export BUN_INSTALL=/usr/local
  curl -fsSL https://bun.sh/install | bash
fi

log "PM2"
if command -v pm2 >/dev/null; then
  echo "pm2 already installed: $(pm2 --version)"
else
  npm install -g pm2
fi

log "Application user"
# The app faces the internet; it should not be root when it does.
if id -u "$APP_USER" >/dev/null 2>&1; then
  echo "$APP_USER already exists"
else
  adduser --system --group --shell /bin/bash --home "/home/$APP_USER" "$APP_USER"
fi
usermod -aG docker "$APP_USER"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# So the deploying operator can reach the app account with the same key.
mkdir -p "/home/$APP_USER/.ssh"
if [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys "/home/$APP_USER/.ssh/authorized_keys"
fi
chown -R "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh"
chmod 700 "/home/$APP_USER/.ssh"
chmod 600 "/home/$APP_USER/.ssh/authorized_keys" 2>/dev/null || true

mkdir -p /var/log/caddy
chown -R caddy:caddy /var/log/caddy

log "Done"
echo "user:    $APP_USER"
echo "appdir:  $APP_DIR"
echo "node:    $(node --version)"
echo "bun:     $(/usr/local/bin/bun --version)"
echo "docker:  $(docker --version)"
echo "caddy:   $(caddy version | head -1)"
echo "pm2:     $(pm2 --version)"
