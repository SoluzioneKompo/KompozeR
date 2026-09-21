@echo off
setlocal
cd /d "%~dp0"

REM Nessun -v: i volumi Mongo restano, dati persistenti tra un avvio e l'altro.
docker compose -f docker-compose.prod.yml down

endlocal
