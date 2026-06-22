"""
Crea un Excel de PUESTOS de ejemplo (puestos_ejemplo.xlsx) con la estructura real del
acto: centro, fecha inicio, fecha fin, duracion, turno, seleccinado, estado, anotacion.
Sirve para practicar con la aplicación.

Uso:  python crear_ejemplo.py
"""

from datetime import datetime
from openpyxl import Workbook

# Varios contratos por centro, para que se vea el "quedan N" en la pantalla.
PLAN = [
    ("Distrito", 4),
    ("HUVN", 3),
    ("Baza", 2),
    ("HUSC (San Cecilio)", 3),
    ("H. Motril", 2),
]
TURNOS = ["Diurno", "Noche", "Rotatorio"]


def main():
    wb = Workbook()
    ws = wb.active
    ws.title = "seleccion"
    ws.append(["centro", "fecha inicio", "fecha fin", "duracion", "turno",
               "seleccinado", "estado", "anotacion"])

    ini = datetime(2026, 7, 1)
    fin = datetime(2026, 8, 30)
    n = 0
    for centro, cuantos in PLAN:
        for k in range(cuantos):
            ws.append([centro, ini, fin, 60, TURNOS[k % len(TURNOS)], None, None, None])
            n += 1

    wb.save("puestos_ejemplo.xlsx")
    print(f"Creado puestos_ejemplo.xlsx con {n} puestos.")


if __name__ == "__main__":
    main()
