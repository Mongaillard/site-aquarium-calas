#!/usr/bin/env bash
# Ouvre l'Atelier 3D dans le navigateur (macOS et Linux).
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "L'Atelier 3D n'est pas encore installé : lancez d'abord ./installer.sh"
  exit 1
fi
exec .venv/bin/python app.py "$@"
