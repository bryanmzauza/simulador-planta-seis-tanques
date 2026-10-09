@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
    echo ERRO: Python nao encontrado. Instale Python e habilite PATH.
    pause
    exit /b 1
)
python python\launch_hardware.py
if errorlevel 1 pause
endlocal
