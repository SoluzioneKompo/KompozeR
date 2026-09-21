@echo off
REM Lanciato da Startup di Windows al login: avvio silenzioso, nessuna finestra browser.
setlocal
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 exit /b 0

docker compose -f docker-compose.prod.yml up -d
endlocal
