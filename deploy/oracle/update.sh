#!/usr/bin/env bash
# Pull the latest code and redeploy. The session cache and certificates are kept.
#   bash deploy/oracle/update.sh
set -euo pipefail
cd "$(dirname "$0")"

git pull --ff-only
sudo docker compose up -d --build
sudo docker image prune -f
sudo docker compose ps
