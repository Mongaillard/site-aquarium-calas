#!/usr/bin/env bash
# Installation de l'Atelier 3D (macOS et Linux).
set -euo pipefail
cd "$(dirname "$0")"

echec() {
  echo
  echo "L'installation n'a pas pu aller jusqu'au bout."
  echo "Lisez le message d'erreur affiché juste au-dessus, souvent en anglais : il en donne la cause."
  echo "Causes fréquentes : connexion Internet coupée, disque plein, antivirus qui bloque des fichiers."
  echo "Corrigez le problème, puis relancez ./installer.sh"
}
trap echec ERR

# Le dossier doit avoir été entièrement décompressé.
if [ ! -f app.py ] || [ ! -f requirements.txt ]; then
  echo "Les fichiers de l'Atelier 3D sont introuvables à côté de installer.sh."
  echo "Décompressez d'abord toute l'archive, puis lancez ./installer.sh depuis le dossier obtenu."
  exit 1
fi

# Mac à processeur Intel : PyTorch n'y existe plus dans une version compatible.
if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "x86_64" ]; then
  if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = "1" ]; then
    echo "Ce terminal fonctionne en mode Intel (Rosetta)."
    echo "Ouvrez le Terminal sans l'option « Ouvrir avec Rosetta », puis relancez ./installer.sh"
  else
    echo "Les Mac à processeur Intel ne sont pas pris en charge par l'Atelier 3D."
    echo "Il faut un Mac à puce Apple (M1 ou plus récent)."
  fi
  exit 1
fi

# Python 3.11 à 3.13, 64 bits (sur Mac : version pour puce Apple). En cas de refus, le test en donne la raison.
VERIF='import platform, sys
v = platform.python_version()
if sys.implementation.name != "cpython":
    sys.exit("%s %s : il faut le Python officiel, CPython" % (sys.implementation.name, v))
if not (3, 11) <= sys.version_info[:2] <= (3, 13):
    sys.exit("version %s : il faut Python 3.11, 3.12 ou 3.13" % v)
if sys.maxsize <= 2**32:
    sys.exit("version %s en 32 bits : il faut une version 64 bits" % v)
if sys.platform == "darwin" and platform.machine() != "arm64":
    sys.exit("version %s pour processeur Intel : il faut la version pour puce Apple" % v)'

PY=""
for candidat in python3.12 python3.11 python3.13 python3; do
  command -v "$candidat" >/dev/null 2>&1 || continue
  if raison=$("$candidat" -c "$VERIF" 2>&1); then
    PY="$candidat"
    break
  fi
  echo "Python ignoré ($candidat) : ${raison:-ne démarre pas}"
done
if [ -z "$PY" ]; then
  echo
  echo "Aucun Python compatible n'a été trouvé."
  echo "L'Atelier 3D a besoin de Python 3.11, 3.12 ou 3.13, en version 64 bits."
  echo "Attention : Python 3.14 n'est pas encore compatible."
  if [ "$(uname -s)" = "Darwin" ]; then
    echo "Installez Python 3.13 depuis https://www.python.org/downloads/release/python-31315/"
    echo "(fichier « macOS installer », en bas de la page), puis relancez ./installer.sh"
  else
    echo "Installez Python 3.11, 3.12 ou 3.13 avec le gestionnaire de paquets de votre distribution"
    echo "(sous Debian ou Ubuntu, avec le paquet venv correspondant, par exemple python3.12-venv),"
    echo "puis relancez ./installer.sh"
  fi
  exit 1
fi
echo "Python trouvé : $PY"

# Environnement isolé dans .venv, recréé s'il est incomplet (pip absent) ou fait avec un Python qui ne convient pas.
if ! { [ -x .venv/bin/python ] &&
       .venv/bin/python -c "$VERIF" >/dev/null 2>&1 &&
       .venv/bin/python -m pip --version >/dev/null 2>&1; }; then
  echo "Préparation de l'environnement Python dans le dossier .venv..."
  if ! "$PY" -m venv --clear .venv; then
    echo
    echo "Impossible de créer l'environnement Python (dossier .venv)."
    if [ "$(uname -s)" = "Linux" ]; then
      echo "Sous Debian ou Ubuntu, installez d'abord le paquet ${PY}-venv :"
      echo "  sudo apt install ${PY}-venv"
      echo "puis relancez ./installer.sh"
    fi
    exit 1
  fi
fi
# le témoin d'installation réussie n'est réécrit qu'à la fin de cette installation
rm -f .venv/atelier-installe.txt
.venv/bin/python -m pip install --upgrade pip

# --no-cache-dir : pip ne garde pas de copie du gros fichier PyTorch téléchargé.
if [ "$(uname -s)" = "Darwin" ]; then
  .venv/bin/python -m pip install --no-cache-dir torch
elif command -v nvidia-smi >/dev/null 2>&1; then
  echo "Carte graphique NVIDIA détectée : installation de PyTorch avec CUDA."
  .venv/bin/python -m pip install --no-cache-dir torch
else
  echo "Pas de carte graphique NVIDIA : installation de PyTorch pour processeur."
  .venv/bin/python -m pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
fi

.venv/bin/python -m pip install -r requirements.txt

# Marque de fin : lancer.sh refuse de démarrer sans elle.
echo "Installation de l'Atelier 3D terminée le $(date) avec $PY." > .venv/atelier-installe.txt

echo
echo "Installation terminée. Lancez ./lancer.sh pour ouvrir l'Atelier 3D."
echo "Au premier lancement, le modèle IA (environ 2 Go) sera téléchargé."
