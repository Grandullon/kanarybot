#!/usr/bin/env bash
# Arranque de la aplicación de adjudicación en Linux/macOS.
set -e
cd "$(dirname "$0")"

if [ ! -x ".venv/bin/python" ]; then
  echo "Creando entorno virtual..."
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
echo "Instalando dependencias..."
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt

echo
echo "============================================================"
echo " Aplicación de adjudicación en marcha."
echo " Panel del operador:   http://localhost:5000/"
echo " Pantalla proyección:  http://localhost:5000/pantalla"
echo " Para parar: Ctrl+C"
echo "============================================================"
echo
python app.py
