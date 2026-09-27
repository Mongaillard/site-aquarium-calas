#!/usr/bin/env bash
# Ouvre l'Atelier 3D dans le navigateur (macOS et Linux).
cd "$(dirname "$0")"
# La marque de fin n'existe que si installer.sh est allé jusqu'au bout.
if [ ! -x .venv/bin/python ] || [ ! -f .venv/atelier-installe.txt ]; then
  echo "L'Atelier 3D n'est pas encore installé, ou son installation n'est pas allée jusqu'au bout."
  echo "Lancez d'abord ./installer.sh et attendez le message « Installation terminée »."
  exit 1
fi
exec .venv/bin/python app.py "$@"
