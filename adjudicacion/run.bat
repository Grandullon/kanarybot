@echo off
REM Arranque de la aplicacion de adjudicacion en Windows.
REM Crea un entorno virtual, instala dependencias y lanza el servidor.
cd /d "%~dp0"

where py >nul 2>nul && (set PY=py) || (set PY=python)

if not exist ".venv\Scripts\python.exe" (
  echo Creando entorno virtual...
  %PY% -m venv .venv
)

call .venv\Scripts\activate.bat
echo Instalando dependencias...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt

echo.
echo ============================================================
echo  Aplicacion de adjudicacion en marcha.
echo  Panel del operador:   http://localhost:5000/
echo  Pantalla proyeccion:  http://localhost:5000/pantalla
echo  Para parar: cierra esta ventana o pulsa Ctrl+C
echo ============================================================
echo.
python app.py
pause
