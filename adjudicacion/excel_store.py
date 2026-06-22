"""
Gestión de los Excel para el acto de adjudicación.

Hay DOS fuentes (pueden ser dos archivos distintos o dos hojas del mismo libro):

  1. CANDIDATOS (solo lectura): el "listado definitivo" de inscritos, ya ordenado.
     Como no trae columna de número, el Nº de cada candidato = su posición en la lista
     (1, 2, 3, ...). Eso es lo que se canta en el acto ("Juan 173", "Marisa 83").
     Se lee con valores cacheados (data_only) porque tiene fórmulas de puntos, y NUNCA
     se escribe.

  2. PUESTOS / CONTRATOS (lectura + escritura): la relación de puestos a ofertar, con
     columnas tipo: centro, duracion, turno, nombre profesional acepta,
     dni profesional acepta, estado. Aquí se escribe quién acepta cada puesto.

La escritura del archivo de puestos es segura: copia de seguridad previa, escritura a
temporal y reemplazo atómico, todo bajo un único bloqueo (un solo operador/proceso).
"""

import os
import json
import shutil
import tempfile
import threading
import unicodedata
from datetime import datetime

from openpyxl import load_workbook

ESTADOS = ["Aceptado", "Contactado", "No contesta", "Renuncia", "Pendiente"]
ESTADO_INICIAL = "Pendiente"

# Columnas auxiliares que se añaden al archivo de puestos si no existen ya.
COL_NUM_CAND = "Nº candidato"
COL_HORA = "Hora"

# Cuántas filas vacías seguidas marcan el final de los datos (el Excel reporta
# 1.048.576 filas aunque solo haya unas pocas con datos).
_RACHA_VACIAS = 80


def _normaliza(texto):
    """Minúsculas sin acentos ni espacios sobrantes, para comparar y buscar."""
    if texto is None:
        return ""
    txt = unicodedata.normalize("NFKD", str(texto))
    txt = "".join(c for c in txt if not unicodedata.combining(c))
    return " ".join(txt.split()).lower()


def _adivina(cabeceras, palabras_clave):
    """Primera cabecera cuyo texto normalizado contiene alguna palabra clave."""
    for cab in cabeceras:
        norm = _normaliza(cab)
        for clave in palabras_clave:
            if clave in norm:
                return cab
    return None


def _valor(fila, idx):
    """Valor limpio de una celda; '' si no existe. Enteros sin '.0'."""
    if idx is None or fila is None or idx >= len(fila):
        return ""
    v = fila[idx]
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, datetime):
        return v.strftime("%d/%m/%Y")
    return v.strip() if isinstance(v, str) else str(v)


def _cabeceras(ws):
    for fila in ws.iter_rows(min_row=1, max_row=1, values_only=True):
        return [c if c is not None else "" for c in fila]
    return []


def _idx(cabeceras, nombre):
    """Índice 0-based de una columna por su cabecera (comparación normalizada)."""
    if not nombre:
        return None
    objetivo = _normaliza(nombre)
    for i, cab in enumerate(cabeceras):
        if _normaliza(cab) == objetivo:
            return i
    return None


def _filas_datos(ws):
    """Genera (numero_fila, tupla_valores) saltando filas vacías; corta tras una racha."""
    vacias = 0
    for nfila, fila in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if fila is None or all(v is None or str(v).strip() == "" for v in fila):
            vacias += 1
            if vacias >= _RACHA_VACIAS:
                break
            continue
        vacias = 0
        yield nfila, fila


class ExcelStore:
    """Acceso a los Excel de candidatos (lectura) y puestos (lectura/escritura)."""

    def __init__(self, config):
        self.config = config
        self.lock = threading.Lock()
        self.ultimo_error = None
        self._cache_candidatos = None  # el listado no cambia durante el acto

    # ------------------------------------------------------------------ #
    #  Auto-detección de columnas (para la pantalla /config)
    # ------------------------------------------------------------------ #

    @staticmethod
    def info_excel(ruta):
        """Devuelve {hojas, cabeceras_por_hoja} de un archivo Excel."""
        wb = load_workbook(ruta, read_only=True, data_only=True)
        info = {"hojas": wb.sheetnames, "cabeceras": {}}
        for h in wb.sheetnames:
            info["cabeceras"][h] = _cabeceras(wb[h])
        wb.close()
        return info

    @staticmethod
    def autodetectar_candidatos(ruta, hoja=None):
        wb = load_workbook(ruta, read_only=True, data_only=True)
        hoja = hoja or wb.sheetnames[0]
        cab = _cabeceras(wb[hoja])
        wb.close()
        return {
            "ruta": ruta,
            "hoja": hoja,
            "col_nombre": _adivina(cab, ["nombre"]) or "",
            "col_apellidos": _adivina(cab, ["apellido"]) or "",
            "col_dni": _adivina(cab, ["dni", "nif", "documento"]) or "",
            "col_letra": _adivina(cab, ["letra"]) or "",
            "col_telefono": _adivina(cab, ["tlf", "telefono", "movil"]) or "",
            "col_puntos": _adivina(cab, ["total puntos", "baremo", "puntos"]) or "",
            "cabeceras": cab,
        }

    @staticmethod
    def autodetectar_puestos(ruta, hoja=None):
        wb = load_workbook(ruta, read_only=True, data_only=True)
        hoja = hoja or wb.sheetnames[0]
        cab = _cabeceras(wb[hoja])
        wb.close()
        return {
            "ruta": ruta,
            "hoja": hoja,
            "col_centro": _adivina(cab, ["centro", "hospital", "distrito", "destino"]) or "",
            "col_duracion": _adivina(cab, ["duracion", "meses", "tiempo", "periodo"]) or "",
            "col_turno": _adivina(cab, ["turno", "jornada"]) or "",
            "col_descripcion": _adivina(cab, ["descrip", "puesto", "categoria", "plaza"]) or "",
            "col_nombre_acepta": _adivina(cab, ["nombre profesional", "profesional acepta", "asignado", "nombre acepta"]) or "",
            "col_dni_acepta": _adivina(cab, ["dni profesional", "dni acepta", "dni asignado"]) or "",
            "col_estado": _adivina(cab, ["estado"]) or "",
            "cabeceras": cab,
        }

    # ------------------------------------------------------------------ #
    #  Lectura de candidatos (solo lectura, con caché)
    # ------------------------------------------------------------------ #

    def candidatos(self):
        if self._cache_candidatos is not None:
            return self._cache_candidatos

        c = self.config["candidatos"]
        wb = load_workbook(c["ruta"], read_only=True, data_only=True)
        try:
            ws = wb[c["hoja"]]
            cab = _cabeceras(ws)
            i_nom = _idx(cab, c.get("col_nombre"))
            i_ape = _idx(cab, c.get("col_apellidos"))
            i_dni = _idx(cab, c.get("col_dni"))
            i_let = _idx(cab, c.get("col_letra"))
            i_tlf = _idx(cab, c.get("col_telefono"))
            i_pts = _idx(cab, c.get("col_puntos"))

            lista = []
            numero = 0
            for _, fila in _filas_datos(ws):
                numero += 1
                nombre = _valor(fila, i_nom)
                apellidos = _valor(fila, i_ape)
                lista.append({
                    "numero": numero,  # posición en el listado definitivo
                    "nombre": (nombre + " " + apellidos).strip(),
                    "dni": self._dni_completo(_valor(fila, i_dni), _valor(fila, i_let)),
                    "telefono": _valor(fila, i_tlf),
                    "puntos": _valor(fila, i_pts),
                })
        finally:
            wb.close()

        self._cache_candidatos = lista
        return lista

    @staticmethod
    def _dni_completo(numero, letra):
        numero = (numero or "").replace(" ", "")
        letra = (letra or "").strip()
        return (numero + letra).strip()

    def candidato_por_numero(self, numero):
        try:
            numero = int(numero)
        except (TypeError, ValueError):
            return None
        for cand in self.candidatos():
            if cand["numero"] == numero:
                return cand
        return None

    def buscar_candidatos(self, consulta, limite=15):
        """Busca por número (exacto/prefijo), nombre o DNI, ordenando por relevancia.

        Prioridad: nº exacto > nº que empieza por > nombre > DNI. Así, al cantar
        "el 173", el candidato nº 173 aparece el primero aunque haya DNIs con un 173.
        """
        q = _normaliza(consulta)
        if not q:
            return []
        puntuados = []
        for cand in self.candidatos():
            num = str(cand["numero"])
            if q == num:
                score = 0
            elif num.startswith(q):
                score = 1
            elif q in _normaliza(cand["nombre"]):
                score = 2
            elif q in _normaliza(cand["dni"]):
                score = 3
            else:
                continue
            puntuados.append((score, cand["numero"], cand))
        puntuados.sort(key=lambda x: (x[0], x[1]))
        return [c for _, _, c in puntuados[:limite]]

    # ------------------------------------------------------------------ #
    #  Lectura de puestos (fuente de la verdad; se relee del disco)
    # ------------------------------------------------------------------ #

    def puestos(self):
        p = self.config["puestos"]
        wb = load_workbook(p["ruta"], data_only=True)
        try:
            ws = wb[p["hoja"]]
            cab = _cabeceras(ws)
            i_centro = _idx(cab, p.get("col_centro"))
            i_dur = _idx(cab, p.get("col_duracion"))
            i_turno = _idx(cab, p.get("col_turno"))
            i_desc = _idx(cab, p.get("col_descripcion"))
            i_nom = _idx(cab, p.get("col_nombre_acepta"))
            i_dni = _idx(cab, p.get("col_dni_acepta"))
            i_est = _idx(cab, p.get("col_estado"))
            i_numc = _idx(cab, COL_NUM_CAND)

            lista = []
            for nfila, fila in _filas_datos(ws):
                asignado = _valor(fila, i_nom)
                lista.append({
                    "id": nfila,
                    "centro": _valor(fila, i_centro),
                    "duracion": _valor(fila, i_dur),
                    "turno": _valor(fila, i_turno),
                    "descripcion": _valor(fila, i_desc),
                    "asignado_a": asignado,
                    "dni_asignado": _valor(fila, i_dni),
                    "num_candidato": _valor(fila, i_numc),
                    "estado": _valor(fila, i_est) or ESTADO_INICIAL,
                })
        finally:
            wb.close()
        return lista

    def estado(self):
        """Estado completo para la API (panel y pantalla)."""
        puestos = self.puestos()
        asignados = sum(1 for x in puestos if x["asignado_a"])
        return {
            "puestos": puestos,
            "estados": self.config.get("estados", ESTADOS),
            "resumen": {
                "total": len(puestos),
                "asignados": asignados,
                "pendientes": len(puestos) - asignados,
            },
            "actualizado": datetime.now().strftime("%H:%M:%S"),
            "ultimo_error": self.ultimo_error,
        }

    # ------------------------------------------------------------------ #
    #  Escritura sobre el archivo de puestos
    # ------------------------------------------------------------------ #

    def asignar(self, puesto_id, numero_candidato, estado=None):
        cand = self.candidato_por_numero(numero_candidato)
        if cand is None:
            self.ultimo_error = f"No existe el candidato nº {numero_candidato}."
            return False
        estado = estado or "Aceptado"
        with self.lock:
            return self._modificar(puesto_id, lambda c: self._escribir_asignacion(c, cand, estado))

    def cambiar_estado(self, puesto_id, estado):
        with self.lock:
            return self._modificar(puesto_id, lambda c: self._set(c, c["i_est"], estado))

    def liberar(self, puesto_id):
        with self.lock:
            return self._modificar(puesto_id, self._limpiar)

    def _modificar(self, puesto_id, accion):
        p = self.config["puestos"]
        ruta = p["ruta"]
        self._backup(ruta)
        wb = load_workbook(ruta)  # sin data_only: conserva fórmulas de otras columnas
        try:
            ws = wb[p["hoja"]]
            cab = list(_cabeceras(ws))
            # Asegura columnas auxiliares (Nº candidato y Hora) al final si no existen.
            for extra in (COL_NUM_CAND, COL_HORA):
                if _idx(cab, extra) is None:
                    ws.cell(row=1, column=len(cab) + 1).value = extra
                    cab.append(extra)

            ctx = {
                "ws": ws,
                "fila": int(puesto_id),
                "i_nom": _idx(cab, p.get("col_nombre_acepta")),
                "i_dni": _idx(cab, p.get("col_dni_acepta")),
                "i_est": _idx(cab, p.get("col_estado")),
                "i_numc": _idx(cab, COL_NUM_CAND),
                "i_hora": _idx(cab, COL_HORA),
            }
            accion(ctx)
            self._guardar_atomico(wb, ruta)
            self.ultimo_error = None
            return True
        except PermissionError:
            self.ultimo_error = (
                "No se pudo guardar: el archivo de puestos está abierto en Excel. "
                "Ciérralo y vuelve a intentarlo."
            )
            return False
        finally:
            wb.close()

    @staticmethod
    def _set(ctx, idx0, valor):
        """Escribe en la celda de la fila actual dada la columna 0-based."""
        if idx0 is not None:
            ctx["ws"].cell(row=ctx["fila"], column=idx0 + 1).value = valor

    def _escribir_asignacion(self, ctx, cand, estado):
        self._set(ctx, ctx["i_nom"], cand["nombre"])
        self._set(ctx, ctx["i_dni"], cand["dni"])
        self._set(ctx, ctx["i_est"], estado)
        self._set(ctx, ctx["i_numc"], cand["numero"])
        self._set(ctx, ctx["i_hora"], datetime.now().strftime("%H:%M"))

    def _limpiar(self, ctx):
        self._set(ctx, ctx["i_nom"], None)
        self._set(ctx, ctx["i_dni"], None)
        self._set(ctx, ctx["i_est"], ESTADO_INICIAL)
        self._set(ctx, ctx["i_numc"], None)
        self._set(ctx, ctx["i_hora"], None)

    # ------------------------------------------------------------------ #
    #  Seguridad de escritura
    # ------------------------------------------------------------------ #

    @staticmethod
    def _backup(ruta):
        carpeta = os.path.join(os.path.dirname(os.path.abspath(ruta)), "backups")
        os.makedirs(carpeta, exist_ok=True)
        sello = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        try:
            shutil.copy2(ruta, os.path.join(carpeta, f"{sello}_{os.path.basename(ruta)}"))
        except OSError:
            pass  # una copia fallida no debe impedir trabajar

    @staticmethod
    def _guardar_atomico(wb, ruta):
        carpeta = os.path.dirname(os.path.abspath(ruta))
        fd, tmp = tempfile.mkstemp(suffix=".xlsx", dir=carpeta)
        os.close(fd)
        wb.save(tmp)
        os.replace(tmp, ruta)


# ---------------------------------------------------------------------- #
#  Persistencia de la configuración
# ---------------------------------------------------------------------- #

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def cargar_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def guardar_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
