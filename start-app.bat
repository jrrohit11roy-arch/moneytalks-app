@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not available.
  echo Install Node.js from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
if exist ".env" goto start
if "%ADMIN_PASSWORD%"=="" (
  set /p ADMIN_PASSWORD=Enter admin password for this local run: 
)
:start
echo Starting MoneyTalks...
echo.
echo Keep this window open while using the website.
echo Open this link in your browser:
echo http://localhost:3000
echo.
node server.js
pause
