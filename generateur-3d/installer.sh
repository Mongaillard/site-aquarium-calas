#!/usr/bin/env bash
# Installation de l'Atelier 3D (macOS et Linux).
set -euo pipefail
cd "$(dirname "$0")"

PY=""
for candidat in python3.12 python3.11 python3.13 python3; do
  if command -v "$candidat" >/dev/null 2>&1 &&
     "$candidat" -c 'import sys; sys.exit(0 if (3, 11) <= sys.version_info[:2] <= (3, 13) else 1)'; then
    PY="$candidat"
    break
  fi
done
if [ -z "$PY" ]; then
  echo "Python 3.11 à 3.13 est introuvable. Installez Python 3.12 (https://www.python.org/downloads/), puis relancez ./installer.sh"
  exit 1
fi
echo "Python trouvé : $PY"

[ -x .venv/bin/python ] || "$PY" -m venv .venv
.venv/bin/python -m pip install --upgrade pip

if [ "$(uname)" = "Darwin" ]; then
  .venv/bin/python -m pip install torch
elif command -v nvidia-smi >/dev/null 2>&1; then
  echo "Carte graphique NVIDIA détectée : installation de PyTorch avec CUDA."
  .venv/bin/python -m pip install torch
else
  echo "Pas de carte graphique NVIDIA : installation de PyTorch pour processeur."
  .venv/bin/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
fi

.venv/bin/python -m pip install -r requirements.txt

echo
echo "Installation terminée. Lancez ./lancer.sh pour ouvrir l'Atelier 3D."
echo "Au premier lancement, le modèle IA (environ 2 Go) sera téléchargé."
