#!/usr/bin/env bash
# One-time setup on a fresh Oracle Cloud Ubuntu VM. Safe to re-run.
#   bash deploy/oracle/setup.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing deploy/oracle/.env - run: cp deploy/oracle/.env.example deploy/oracle/.env  then fill it in." >&2
  exit 1
fi

# The 1 GB micro VM needs swap to get through the image build.
if ! swapon --show | grep -q .; then
  echo "==> Adding 2 GB swap"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
fi

# Oracle's Ubuntu images reject everything but SSH in the VM's own firewall,
# even once the cloud security list allows 80/443. Saved before Docker installs
# so Docker's own rules don't get persisted.
echo "==> Opening ports 80 and 443"
if ! command -v netfilter-persistent > /dev/null; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
fi
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2> /dev/null; then
    sudo iptables -I INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT
  fi
done
if ! command -v docker > /dev/null; then
  sudo netfilter-persistent save
fi

if ! command -v docker > /dev/null; then
  echo "==> Installing Docker"
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
fi

echo "==> Building and starting (the first build takes a few minutes)"
sudo docker compose up -d --build

domain=$(grep '^API_DOMAIN=' .env | cut -d= -f2-)
echo
sudo docker compose ps
echo
echo "Done. In a minute or so, https://$domain/health should return {\"ok\":true}."
