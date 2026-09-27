@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo L'Atelier 3D n'est pas encore installé : double-cliquez d'abord sur installer.bat.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" app.py %*
if errorlevel 1 pause
