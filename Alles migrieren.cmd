@echo off
setlocal
cd /d "%~dp0"
title Comet nach Chrome - alles migrieren

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Bitte installieren: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo Comet nach Chrome - vollautomatische Migration
echo.
node "%~dp0migrate.js" all
set RESULT=%ERRORLEVEL%
echo.
if not "%RESULT%"=="0" (
  echo Fehler aufgetreten ^(Code %RESULT%^). Siehe Ausgabe oben.
) else (
  echo Fertig. Chrome einmal neu starten.
)
echo.
pause
exit /b %RESULT%
