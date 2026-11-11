@echo off
setlocal
cd /d "%~dp0"
title Comet to Chrome - migrate everything

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install it from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

echo Comet to Chrome - full automatic migration
echo.
node "%~dp0migrate.js" all
set RESULT=%ERRORLEVEL%
echo.
if not "%RESULT%"=="0" (
  echo Something went wrong ^(exit code %RESULT%^). See the output above.
) else (
  echo Done. Open Chrome.
)
echo.
pause
exit /b %RESULT%
