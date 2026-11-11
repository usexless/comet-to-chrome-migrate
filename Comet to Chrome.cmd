@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install it from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0gui.ps1"
exit /b 0
