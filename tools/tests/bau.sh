#!/bin/bash
# Testbuild bauen: tools/tests/web (nicht im Repo).
# Private Abfrageschema-Kopien (nie committen!) über LW_PRIVAT=<Ordner> mit abfrageschema.json und abfrageschema_drogen.json
set -e
T="$(cd "$(dirname "$0")" && pwd)"
node "$T/build.mjs" "$T/web" >/dev/null
if [ -n "$LW_PRIVAT" ]; then
  cp "$LW_PRIVAT/abfrageschema.json" "$T/web/abf_test.json"
  cp "$LW_PRIVAT/abfrageschema_drogen.json" "$T/web/abf_drogen.json"
else
  echo "Hinweis: LW_PRIVAT nicht gesetzt – Tests mit dem AMPDS-Schema schlagen fehl." >&2
fi
echo gebaut
