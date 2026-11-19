@echo off
setlocal
cd /d "%~dp0"
if not defined RVN_DADOS set "RVN_DADOS=%LOCALAPPDATA%\RVNecessidades"
echo.
echo === RV Necessidades: instalacao e atualizacao ===
echo.
set PY=py
where py >nul 2>nul || set PY=python
%PY% --version >nul 2>nul
if errorlevel 1 (
  echo Python nao encontrado. Instale o Python 3.11 ou mais novo e marque "Add python.exe to PATH" na instalacao.
  pause
  exit /b 1
)
if not exist venv\Scripts\python.exe (
  echo Criando o ambiente do sistema...
  %PY% -m venv venv
  if errorlevel 1 (
    echo Falha ao criar o ambiente.
    pause
    exit /b 1
  )
)
echo Instalando os componentes. Precisa de internet so nesta etapa...
venv\Scripts\python -m pip install --quiet -r requirements.txt
if errorlevel 1 (
  echo Falha na instalacao dos componentes. Confira a internet e tente de novo.
  pause
  exit /b 1
)
venv\Scripts\python -m rvn tem-admin
if not errorlevel 1 goto jatem
echo.
echo Agora o cadastro do admin. O sistema vai pedir a senha: ela nao aparece enquanto voce digita.
set /p LOGIN=Usuario do admin (sem espacos, ex.: paulo): 
set /p NOME=Nome do admin: 
venv\Scripts\python -m rvn criar-admin --login "%LOGIN%" --nome "%NOME%"
goto fim
:jatem
echo.
echo Ja existe um admin cadastrado. Nada a cadastrar: os componentes foram atualizados.
:fim
echo.
echo Os dados (banco e backups) ficam em: %RVN_DADOS%
echo.
echo Pronto. Para ligar o sistema, de dois cliques em iniciar.bat e abra http://127.0.0.1:8080 no navegador.
pause
