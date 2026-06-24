"""
Aplicación de adjudicación de contratos (acto de selección).

Un único operador la maneja desde el navegador:
  - Panel del operador:  http://localhost:5000/
  - Pantalla de proyección (solo lectura, autorefresco):  http://localhost:5000/pantalla
  - Configuración (rutas de los Excel y mapeo de columnas):  http://localhost:5000/config

Arranque:  python app.py   (o usa run.bat / run.sh)
"""

import os
import sys
import webbrowser
import threading

from flask import Flask, render_template, request, jsonify, redirect, url_for

import excel_store
from excel_store import ExcelStore


def _recurso(rel):
    """Ruta a templates/static, también cuando corre como .exe de PyInstaller."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, rel)


app = Flask(__name__,
            template_folder=_recurso("templates"),
            static_folder=_recurso("static"))

# Estado global del proceso (un solo operador, un solo proceso).
STORE = None


def _store():
    """Devuelve el ExcelStore actual, recargando la config del disco si hace falta."""
    global STORE
    if STORE is None:
        cfg = excel_store.cargar_config()
        if cfg:
            STORE = ExcelStore(cfg)
    return STORE


def _configurado():
    cfg = excel_store.cargar_config()
    return bool(cfg and cfg.get("candidatos") and cfg.get("puestos"))


# --------------------------------------------------------------------- #
#  Vistas principales
# --------------------------------------------------------------------- #

@app.route("/")
def panel():
    if not _configurado():
        return redirect(url_for("config"))
    return render_template("operador.html")


@app.route("/pantalla")
def pantalla():
    if not _configurado():
        return redirect(url_for("config"))
    return render_template("pantalla.html")


@app.route("/config")
def config():
    cfg = excel_store.cargar_config() or {}
    return render_template("config.html", cfg=cfg)


# --------------------------------------------------------------------- #
#  API de configuración
# --------------------------------------------------------------------- #

@app.route("/api/inspeccionar", methods=["POST"])
def api_inspeccionar():
    """Dada la ruta de un Excel, devuelve sus hojas y cabeceras (para el formulario)."""
    ruta = (request.json or {}).get("ruta", "").strip().strip('"')
    try:
        return jsonify({"ok": True, "info": ExcelStore.info_excel(ruta)})
    except Exception as e:  # noqa: BLE001 - mostramos el error al usuario
        return jsonify({"ok": False, "error": str(e)})


@app.route("/api/autodetectar", methods=["POST"])
def api_autodetectar():
    """Propone el mapeo de columnas de un Excel (candidatos o puestos)."""
    data = request.json or {}
    ruta = data.get("ruta", "").strip().strip('"')
    hoja = data.get("hoja") or None
    tipo = data.get("tipo")
    try:
        if tipo == "candidatos":
            mapa = ExcelStore.autodetectar_candidatos(ruta, hoja)
        else:
            mapa = ExcelStore.autodetectar_puestos(ruta, hoja)
        return jsonify({"ok": True, "mapa": mapa})
    except Exception as e:  # noqa: BLE001
        return jsonify({"ok": False, "error": str(e)})


@app.route("/api/guardar_config", methods=["POST"])
def api_guardar_config():
    global STORE
    cfg = request.json or {}
    cfg.setdefault("estados", excel_store.ESTADOS)
    # Validación mínima: que los Excel se puedan abrir y leer.
    try:
        store = ExcelStore(cfg)
        n_cand = len(store.candidatos())
        n_puestos = len(store.puestos())
    except Exception as e:  # noqa: BLE001
        return jsonify({"ok": False, "error": f"No se pudo leer: {e}"})
    excel_store.guardar_config(cfg)
    STORE = ExcelStore(cfg)  # recarga limpia (vacía la caché de candidatos)
    return jsonify({"ok": True, "candidatos": n_cand, "puestos": n_puestos})


# --------------------------------------------------------------------- #
#  API de datos / acciones
# --------------------------------------------------------------------- #

@app.route("/api/estado")
def api_estado():
    store = _store()
    if store is None:
        return jsonify({"ok": False, "error": "Sin configurar"}), 400
    return jsonify({"ok": True, **store.estado()})


@app.route("/api/candidatos")
def api_candidatos():
    store = _store()
    if store is None:
        return jsonify({"ok": False, "error": "Sin configurar"}), 400
    q = request.args.get("q", "")
    return jsonify({"ok": True, "candidatos": store.buscar_candidatos(q)})


@app.route("/api/asignar", methods=["POST"])
def api_asignar():
    store = _store()
    data = request.json or {}
    ok = store.asignar(data.get("puesto_id"), data.get("numero_candidato"), data.get("estado"))
    return jsonify({"ok": ok, "error": store.ultimo_error})


@app.route("/api/estado_puesto", methods=["POST"])
def api_estado_puesto():
    store = _store()
    data = request.json or {}
    ok = store.cambiar_estado(data.get("puesto_id"), data.get("estado"))
    return jsonify({"ok": ok, "error": store.ultimo_error})


@app.route("/api/liberar", methods=["POST"])
def api_liberar():
    store = _store()
    data = request.json or {}
    ok = store.liberar(data.get("puesto_id"))
    return jsonify({"ok": ok, "error": store.ultimo_error})


@app.route("/api/estado_candidato", methods=["POST"])
def api_estado_candidato():
    store = _store()
    data = request.json or {}
    ok = store.estado_candidato(data.get("numero"), data.get("estado"))
    return jsonify({"ok": ok, "error": store.ultimo_error})


def _abrir_navegador():
    webbrowser.open("http://localhost:5000/")


if __name__ == "__main__":
    # Abre el panel automáticamente al arrancar (cómodo para el operador).
    threading.Timer(1.2, _abrir_navegador).start()
    # threaded=True permite que la pantalla de proyección refresque mientras se asigna.
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
