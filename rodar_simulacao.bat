@echo off
setlocal
title Simulador de Seis Tanques - Simulacao

cd /d "%~dp0"

echo ==============================================
echo Planta de Seis Tanques
echo Modo: SIMULACAO
echo ==============================================
echo.

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

echo Iniciando Vite...
start "Seis Tanques - Frontend" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo.
echo Aguardando o servidor web...
timeout /t 3 /nobreak >nul

start "" "http://127.0.0.1:5173"

echo.
echo Frontend iniciado em:
echo http://127.0.0.1:5173
echo.
echo Use o modo "Simulacao" na interface.
echo Esta janela pode ser fechada.
timeout /t 2 /nobreak >nul
endlocal
