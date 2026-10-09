@echo off
setlocal
title Simulador de Seis Tanques - Planta Real MOCK

cd /d "%~dp0"

echo ==============================================
echo Planta de Seis Tanques
echo Modo: PLANTA REAL - MOCK
echo ==============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo ERRO: Python nao foi encontrado.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo ERRO: npm nao foi encontrado.
    echo Instale o Node.js e abra novamente este arquivo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Dependencias Node nao encontradas.
    echo Executando npm install...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERRO ao instalar dependencias.
        pause
        exit /b 1
    )
)

echo Iniciando backend Python em MOCK...
start "Seis Tanques - Backend MOCK" cmd /k "cd /d ""%~dp0"" && set SIX_TANK_MODE=MOCK&& python python\server.py"

echo Iniciando Vite...
start "Seis Tanques - Frontend" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo.
echo Aguardando os servidores...
timeout /t 3 /nobreak >nul

start "" "http://127.0.0.1:5173"

echo.
echo Frontend:
echo http://127.0.0.1:5173
echo.
echo Backend WebSocket:
echo ws://localhost:8765
echo.
echo Na interface:
echo 1. selecione "Planta real"
echo 2. clique em "Conectar"
echo.
echo O backend esta simulando a planta, sem Arduino.
echo Esta janela pode ser fechada.
timeout /t 2 /nobreak >nul
endlocal
