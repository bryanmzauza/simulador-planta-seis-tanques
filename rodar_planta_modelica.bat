@echo off
setlocal
title Planta de Seis Tanques - Simulacao Modelica

cd /d "%~dp0"

echo ==============================================
echo Planta de Seis Tanques
echo Modo: SIMULACAO MODELICA (FMU + PID_ISA/PI)
echo ==============================================
echo.

rem ---- Python com PyFMI: ambiente conda "seistanques" (ver README) ----
set "PY="
if exist "%USERPROFILE%\miniforge3\envs\seistanques\python.exe" set "PY=%USERPROFILE%\miniforge3\envs\seistanques\python.exe"
if not defined PY if exist "%USERPROFILE%\miniconda3\envs\seistanques\python.exe" set "PY=%USERPROFILE%\miniconda3\envs\seistanques\python.exe"
if not defined PY if exist "%USERPROFILE%\anaconda3\envs\seistanques\python.exe" set "PY=%USERPROFILE%\anaconda3\envs\seistanques\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\miniforge3\envs\seistanques\python.exe" set "PY=%LOCALAPPDATA%\miniforge3\envs\seistanques\python.exe"
if not defined PY if defined SIX_TANK_PYTHON set "PY=%SIX_TANK_PYTHON%"
if not defined PY (
    echo ERRO: ambiente Python "seistanques" nao encontrado.
    echo Crie com:  conda create -n seistanques -c conda-forge python=3.12 pyfmi websockets pyserial pyzmq
    echo            conda run -n seistanques pip install OMPython
    echo Ou defina SIX_TANK_PYTHON com o caminho de um python.exe que tenha PyFMI.
    pause
    exit /b 1
)

"%PY%" -c "import pyfmi" >nul 2>nul
if errorlevel 1 (
    echo ERRO: PyFMI nao esta instalado em "%PY%".
    pause
    exit /b 1
)

rem ---- FMUs: gera se ainda nao existirem (precisa do OpenModelica) ----
if not exist "modelica\build\SeisTanques_v13_SixTanks.fmu" goto build_fmu
if not exist "modelica\build\SeisTanques_Controle_Banco.fmu" goto build_fmu
goto fmu_ok

:build_fmu
echo Gerando as FMUs com o OpenModelica (so na primeira vez)...
"%PY%" python\build_fmu.py
if errorlevel 1 (
    echo.
    echo ERRO ao gerar as FMUs. Confira se o OpenModelica esta instalado.
    pause
    exit /b 1
)

:fmu_ok
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

rem ---- Backend: nao sobe um segundo backend na mesma porta ----
netstat -ano | findstr /R /C:":8765 .*LISTENING" >nul
if not errorlevel 1 (
    echo ERRO: a porta 8765 ja esta em uso por outro backend da planta.
    echo Feche a janela "Seis Tanques - Backend" anterior ^(ou o processo python^) e execute de novo.
    pause
    exit /b 1
)

echo Iniciando backend Python em MODELICA...
start "Seis Tanques - Backend MODELICA" cmd /k "cd /d ""%~dp0"" && set SIX_TANK_MODE=MODELICA&& ""%PY%"" python\server.py"

rem ---- Frontend: reaproveita o Vite se ele ja estiver na 5173 ----
netstat -ano | findstr /R /C:"127.0.0.1:5173 .*LISTENING" >nul
if not errorlevel 1 (
    echo Vite ja esta rodando em http://127.0.0.1:5173, reaproveitando.
) else (
    echo Iniciando Vite...
    start "Seis Tanques - Frontend" cmd /k "cd /d ""%~dp0"" && npm run dev -- --strictPort"
)

echo.
echo Aguardando os servidores...
timeout /t 3 /nobreak >nul

start "" "http://127.0.0.1:5173"

echo.
echo Frontend:  http://127.0.0.1:5173
echo Backend:   ws://localhost:8765
echo.
echo A HMI conecta sozinha. Escolha o cenario na barra superior e clique em Rodar.
echo Esta janela pode ser fechada.
timeout /t 2 /nobreak >nul
endlocal
