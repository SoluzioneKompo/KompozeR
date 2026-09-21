@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
    echo Docker non trovato. Installa Docker Desktop e riavvia KompozeR.
    pause
    exit /b 1
)

docker compose -f docker-compose.prod.yml up -d
if errorlevel 1 (
    echo Avvio KompozeR fallito. Controlla che Docker Desktop sia in esecuzione.
    pause
    exit /b 1
)

echo In attesa che il frontend sia pronto...
:waitloop
timeout /t 2 /nobreak >nul
curl -k -s -o nul -w "%%{http_code}" https://localhost:8443/ > "%TEMP%\kompozer_status.txt" 2>nul
set /p STATUS=<"%TEMP%\kompozer_status.txt"
if not "%STATUS%"=="200" goto waitloop

start "" https://localhost:8443/
endlocal
