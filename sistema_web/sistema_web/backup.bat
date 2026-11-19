@echo off
cd /d "%~dp0"
if not defined RVN_DADOS set "RVN_DADOS=%LOCALAPPDATA%\RVNecessidades"
if "%~1"=="" (
  venv\Scripts\python -m rvn backup
) else (
  venv\Scripts\python -m rvn backup --pasta "%~1"
)
