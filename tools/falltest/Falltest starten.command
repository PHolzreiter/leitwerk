#!/bin/bash
# LeitWerk-Falltest – Doppelklick im Finder startet ihn im Terminal.
cd "$(dirname "$0")/../.." || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Bitte die LTS-Version von https://nodejs.org installieren und dann nochmal starten."
  read -r -p "Enter zum Schließen …"
  exit 1
fi
if [ ! -d node_modules/playwright ] || [ ! -d node_modules/vite ]; then
  echo "Einmalige Einrichtung (npm install) …"
  npm install || { read -r -p "Enter zum Schließen …"; exit 1; }
fi
npm run --silent falltest -- "$@"
echo
read -r -p "Enter zum Schließen …"
