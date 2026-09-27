@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo.
echo  === Installation de l'Atelier 3D ===
echo.

rem --- 0. Vérifier que le dossier a bien été décompressé ---
if not exist "app.py" goto :pas_decompresse
if not exist "requirements.txt" goto :pas_decompresse

rem --- 1. Trouver Python 3.13, 3.12 ou 3.11, version Windows 64 bits win-amd64 ---
rem Code de sortie du test : 0 = convient, 1 = mauvaise version, 2 = pas la version 64 bits Intel/AMD.
set "VERIF=import sys, sysconfig; ok_v = sys.implementation.name == 'cpython' and (3, 11) <= sys.version_info[:2] <= (3, 13); ok_p = sysconfig.get_platform() == 'win-amd64'; sys.exit(0 if ok_v and ok_p else 2 if ok_v else 1)"
echo Recherche de Python... ^(cela peut prendre une minute^)
set "PY="
call :essayer py -3.13-64
if not defined PY call :essayer py -3.13
if not defined PY call :essayer py -3.12-64
if not defined PY call :essayer py -3.12
if not defined PY call :essayer py -3.11-64
if not defined PY call :essayer py -3.11
if not defined PY call :essayer python
if not defined PY goto :sans_python
echo Python trouvé : %PY%

rem --- 2. Environnement isolé dans le dossier .venv ---
rem Il est recréé s'il est incomplet, pip absent, ou fait avec un Python qui ne convient pas.
set "VPY=.venv\Scripts\python.exe"
if not exist "%VPY%" goto :creer_venv
"%VPY%" -c "%VERIF%" <nul >nul 2>&1
if errorlevel 1 goto :creer_venv
"%VPY%" -m pip --version <nul >nul 2>&1
if not errorlevel 1 goto :venv_pret
:creer_venv
echo Préparation de l'environnement Python dans le dossier .venv...
%PY% -m venv --clear .venv
if errorlevel 1 goto :erreur
:venv_pret
rem le témoin d'installation réussie n'est réécrit qu'à la fin de cette installation
if exist ".venv\atelier-installe.txt" del ".venv\atelier-installe.txt"
"%VPY%" -m pip install --upgrade pip
if errorlevel 1 goto :erreur

rem --- 3. PyTorch : version carte graphique NVIDIA si possible, sinon processeur ---
rem --no-cache-dir : pip ne garde pas de copie du gros fichier téléchargé.
where nvidia-smi >nul 2>&1
if errorlevel 1 goto :torch_processeur
echo Carte graphique NVIDIA détectée : installation de PyTorch avec CUDA.
echo Le téléchargement est gros, environ 2,6 Go : il peut être long.
"%VPY%" -m pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu126
if errorlevel 1 goto :erreur
goto :torch_pret
:torch_processeur
echo Pas de carte graphique NVIDIA : installation de PyTorch pour processeur.
"%VPY%" -m pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto :erreur
:torch_pret

rem --- 4. Autres bibliothèques ---
"%VPY%" -m pip install -r requirements.txt
if errorlevel 1 goto :erreur

rem --- 5. Marque de fin : lancer.bat refuse de démarrer sans elle ---
> ".venv\atelier-installe.txt" echo Installation de l'Atelier 3D terminée le %DATE% à %TIME% avec %PY%.
if not exist ".venv\atelier-installe.txt" goto :erreur

rem --- 6. Composant Microsoft Visual C++ utilisé par PyTorch : simple avertissement ---
if exist "%SystemRoot%\System32\msvcp140.dll" goto :fin
echo.
echo  ATTENTION : il manque sur cet ordinateur un composant de Microsoft,
echo  « Visual C++ Redistributable », dont l'Atelier 3D a besoin pour fonctionner.
echo  Téléchargez-le à cette adresse, puis double-cliquez sur le fichier obtenu pour l'installer :
echo    https://aka.ms/vs/17/release/vc_redist.x64.exe
:fin

echo.
echo  Installation terminée.
echo  Double-cliquez sur lancer.bat pour ouvrir l'Atelier 3D.
echo  Au premier lancement, le modèle IA (environ 2 Go) sera téléchargé.
echo.
pause
exit /b 0

rem --- Essaie une commande Python et la retient dans PY si elle convient ---
:essayer
%* -c "import sys" <nul >nul 2>&1
if errorlevel 1 exit /b 0
%* -c "%VERIF%" <nul >nul 2>&1
if errorlevel 2 goto :refus_plateforme
if errorlevel 1 goto :refus_version
set "PY=%*"
exit /b 0

:refus_version
call :decrire_python %*
echo    Il faut Python 3.11, 3.12 ou 3.13, celui de python.org.
exit /b 0

:refus_plateforme
call :decrire_python %*
echo    Il faut la version Windows 64 bits pour processeur Intel ou AMD, notée win-amd64 :
echo    sur python.org, c'est le fichier « Windows installer ^(64-bit^) ».
echo    Elle fonctionne aussi sur les PC à processeur ARM sous Windows 11.
exit /b 0

:decrire_python
echo.
echo  Python trouvé mais pas utilisable : %*
%* -c "import platform, sysconfig; print('   version', platform.python_version() + ', plateforme', sysconfig.get_platform())" <nul 2>nul
exit /b 0

:pas_decompresse
echo  Les fichiers de l'Atelier 3D sont introuvables à côté de installer.bat :
echo  le dossier n'a sans doute pas été décompressé.
echo  Faites un clic droit sur le fichier ZIP, choisissez « Extraire tout... »,
echo  puis ouvrez le dossier obtenu et double-cliquez sur installer.bat.
echo.
pause
exit /b 1

:sans_python
echo.
echo  Aucun Python compatible n'a été trouvé sur cet ordinateur.
echo  L'Atelier 3D a besoin de Python 3.11, 3.12 ou 3.13, en version Windows 64 bits.
echo  Attention : Python 3.14, proposé par défaut sur python.org, n'est pas encore compatible.
echo.
echo  Pour installer Python 3.13 :
echo   1. Ouvrez la page https://www.python.org/downloads/release/python-31315/
echo   2. Tout en bas de la page, cliquez sur « Windows installer ^(64-bit^) ».
echo   3. Lancez le fichier téléchargé, cochez la case « Add python.exe to PATH »,
echo      puis cliquez sur « Install Now ».
echo   4. Relancez installer.bat.
echo.
echo  Si vous utilisez le gestionnaire « Python install manager », vous pouvez aussi
echo  taper la commande  py install 3.13-64  dans l'invite de commandes, puis relancer installer.bat.
echo.
pause
exit /b 1

:erreur
echo.
echo  L'installation n'a pas pu aller jusqu'au bout.
echo  Lisez le message d'erreur affiché juste au-dessus, souvent en anglais : il en donne la cause.
echo  Causes fréquentes : connexion Internet coupée, disque plein, antivirus qui bloque des fichiers.
echo  Corrigez le problème, puis relancez installer.bat.
echo  Si le problème persiste, copiez les messages ci-dessus pour obtenir de l'aide.
echo.
pause
exit /b 1
