"""
Crea un Excel de PUESTOS de ejemplo (puestos_ejemplo.xlsx) con las columnas previstas
para el acto: centro, duracion, turno, nombre profesional acepta, dni profesional acepta,
estado. Sirve para probar la aplicación hoy mientras llega el listado real de puestos.

Uso:  python crear_ejemplo.py
"""

from openpyxl import Workbook

CENTROS = ["HVN (Virgen de las Nieves)", "HSC (San Cecilio)", "DAGR METRO (Distrito Granada)",
           "H. Motril", "DAGR SUR"]
DURACIONES = ["3 meses", "6 meses", "1 mes", "Eventual", "Interinidad"]
TURNOS = ["Mañana", "Tarde", "Noche", "Rotatorio"]


def main():
    wb = Workbook()
    ws = wb.active
    ws.title = "Puestos"
    ws.append(["centro", "duracion", "turno",
               "nombre profesional acepta", "dni profesional acepta", "estado"])

    n = 0
    for centro in CENTROS:
        for i, dur in enumerate(DURACIONES):
            turno = TURNOS[(i + len(centro)) % len(TURNOS)]
            ws.append([centro, dur, turno, None, None, None])
            n += 1

    wb.save("puestos_ejemplo.xlsx")
    print(f"Creado puestos_ejemplo.xlsx con {n} puestos.")


if __name__ == "__main__":
    main()
