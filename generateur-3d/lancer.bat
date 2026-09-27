@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem La marque de fin n'existe que si installer.bat est allé jusqu'au bout.
if not exist ".venv\Scripts\python.exe" goto :pas_installe
if not exist ".venv\atelier-installe.txt" goto :pas_installe
if exist "%SystemRoot%\System32\msvcp140.dll" goto :lancer
echo  ATTENTION : il manque sur cet ordinateur un composant de Microsoft,
echo  « Visual C++ Redistributable », dont l'Atelier 3D a besoin pour fonctionner.
echo  Installez-le depuis https://aka.ms/vs/17/release/vc_redist.x64.exe
echo.
:lancer
".venv\Scripts\python.exe" app.py %*
if errorlevel 1 pause
exit /b

:pas_installe
echo L'Atelier 3D n'est pas encore installé, ou son installation n'est pas allée jusqu'au bout.
echo Double-cliquez d'abord sur installer.bat et attendez le message « Installation terminée »,
echo puis relancez lancer.bat.
echo.
pause
exit /b 1
