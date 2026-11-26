@echo off
title Card Workshop
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed to run the Card Workshop. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node tools\workshop\server.mjs
echo.
echo The Card Workshop has stopped.
pause
