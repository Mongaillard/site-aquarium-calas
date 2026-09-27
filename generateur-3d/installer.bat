@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo.
echo  === Installation de l'Atelier 3D ===
echo.

rem --- 1. Trouver Python 3.12, 3.11 ou 3.13 ---
set "PY="
for %%V in (3.12 3.11 3.13) do (
  if not defined PY (
    py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V"
  )
)
if not defined PY (
  python -c "import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] <= (3,13) else 1)" >nul 2>&1 && set "PY=python"
)
if not defined PY goto :sans_python
echo Python trouvé : %PY%

rem --- 2. Environnement isolé dans le dossier .venv ---
if not exist ".venv\Scripts\python.exe" (
  echo Création de l'environnement Python...
  %PY% -m venv .venv
  if errorlevel 1 goto :erreur
)
set "VPY=.venv\Scripts\python.exe"
"%VPY%" -m pip install --upgrade pip
if errorlevel 1 goto :erreur

rem --- 3. PyTorch : version carte graphique NVIDIA si possible, sinon processeur ---
where nvidia-smi >nul 2>&1
if errorlevel 1 (
  echo Pas de carte graphique NVIDIA : installation de PyTorch pour processeur.
  "%VPY%" -m pip install torch --index-url https://download.pytorch.org/whl/cpu
) else (
  echo Carte graphique NVIDIA détectée : installation de PyTorch avec CUDA.
  "%VPY%" -m pip install torch --index-url https://download.pytorch.org/whl/cu126
)
if errorlevel 1 goto :erreur

rem --- 4. Autres bibliothèques ---
"%VPY%" -m pip install -r requirements.txt
if errorlevel 1 goto :erreur

echo.
echo  Installation terminée.
echo  Double-cliquez sur lancer.bat pour ouvrir l'Atelier 3D.
echo  Au premier lancement, le modèle IA (environ 2 Go) sera téléchargé.
echo.
pause
exit /b 0

:sans_python
echo Python 3.12 est introuvable sur cet ordinateur.
echo Installez-le depuis https://www.python.org/downloads/
echo en cochant la case "Add python.exe to PATH", puis relancez installer.bat.
echo.
pause
exit /b 1

:erreur
echo.
echo L'installation a échoué. Vérifiez la connexion Internet, puis relancez installer.bat.
echo Si le problème persiste, copiez les messages ci-dessus pour obtenir de l'aide.
echo.
pause
exit /b 1
