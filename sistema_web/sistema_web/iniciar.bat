@echo off
cd /d "%~dp0"
if not defined RVN_DADOS set "RVN_DADOS=%LOCALAPPDATA%\RVNecessidades"
if not exist venv\Scripts\python.exe (
  echo Rode primeiro o instalar.bat.
  pause
  exit /b 1
)
venv\Scripts\python -c "import flask, waitress, openpyxl, defusedxml" >nul 2>nul
if errorlevel 1 (
  echo Instalando os componentes desta versao. Precisa de internet so desta vez...
  venv\Scripts\python -m pip install --quiet -r requirements.txt
  if errorlevel 1 (
    echo Falha na instalacao dos componentes. Confira a internet e tente de novo.
    pause
    exit /b 1
  )
)
echo RV Necessidades: feche esta janela para desligar o sistema.
venv\Scripts\python -m rvn servir --host 127.0.0.1 --porta 8080
pause
