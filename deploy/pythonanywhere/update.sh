#!/usr/bin/env bash
# Pull the latest server code and reload the site. In a PythonAnywhere Bash console:
#   bash ~/F1-Race-Strategy/deploy/pythonanywhere/update.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

git pull --ff-only
"$HOME/.virtualenvs/f1/bin/pip" install -q -r server/requirements.txt
# Touching the WSGI file reloads the web app (a free account has exactly one).
touch /var/www/*_wsgi.py
echo "Updated and reloaded."
