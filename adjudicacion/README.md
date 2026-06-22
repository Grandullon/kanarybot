# Aplicación de adjudicación de contratos

Herramienta para el **acto de selección/adjudicación**: un único operador va asignando
los puestos ofertados a los candidatos según los van eligiendo, mientras una pantalla de
proyección muestra en tiempo real lo ofertado y lo ya asignado.

Como la maneja **una sola persona desde un ordenador**, se evitan los conflictos del Excel
compartido (que varias personas asignen el mismo puesto a la vez).

## Qué hace

- Lee el **listado de candidatos** (solo lectura). El **Nº de candidato** es su posición en
  el listado (1, 2, 3…), que es lo que se canta en el acto ("Juan 173", "Marisa 83").
- Lee el **listado de puestos** a ofertar (centro, duración, turno…) y lo va **actualizando**:
  al asignar, escribe el nombre y el DNI del candidato en las columnas
  *nombre profesional acepta* / *dni profesional acepta* y el *estado*.
- **Pantalla de proyección** aparte, solo lectura, que se refresca sola cada 3 segundos.
- **Seguridad de datos**: antes de cada cambio guarda una copia en `backups/` y escribe el
  Excel de forma atómica (no se corrompe). Si el Excel está abierto en otro programa, avisa.

## Requisitos

- **Python 3.9 o superior** instalado en el ordenador del operador.
  (Descarga: https://www.python.org/downloads/ — en Windows marca *"Add Python to PATH"*.)

## Cómo arrancar

- **Windows**: doble clic en `run.bat`.
- **Linux/macOS**: `./run.sh` (o `bash run.sh`).

La primera vez crea el entorno e instala dependencias (tarda un poco). Después abre el
navegador en el **panel del operador**. Para la **pantalla de proyección**, abre en el
segundo monitor: <http://localhost:5000/pantalla>.

> Arranque manual alternativo:
> `pip install -r requirements.txt` y luego `python app.py`.

## Configuración (primera vez)

Al arrancar sin configurar, te lleva a **⚙️ Configuración**:

1. Pon la **ruta del Excel de candidatos**, pulsa **Detectar** y revisa las columnas
   (Nombre, Apellidos, DNI, Letra DNI, Teléfono).
2. Pon la **ruta del Excel de puestos**, pulsa **Detectar** y revisa las columnas
   (Centro, Duración, Turno, *nombre profesional acepta*, *dni profesional acepta*, Estado).
3. Pulsa **Guardar y comprobar**. Te dirá cuántos candidatos y puestos ha leído.

> Consejo: copia los dos Excel a esta carpeta y usa rutas sencillas. Mantén el Excel de
> puestos **cerrado en Excel** mientras la aplicación está en marcha (si no, no puede
> guardar). El de candidatos puede estar abierto sin problema.

## Uso durante el acto

1. Cuando alguien acepta un puesto ("Marisa 83 coge 2 meses en distrito"):
   busca el puesto (filtros por centro/estado o el buscador), pulsa **Asignar**, escribe el
   **número o nombre** del candidato, elige el estado (*Aceptado* por defecto) y confirma.
2. Estados disponibles: **Aceptado, Contactado, No contesta, Renuncia, Pendiente**.
   Puedes cambiar el estado de un puesto asignado en su desplegable.
3. Si hay que deshacer una asignación, pulsa la **✕** (Liberar): el puesto vuelve a Pendiente.
4. La pantalla de proyección refleja todo automáticamente.

## Probar antes del acto (sin el Excel real de puestos)

```bash
python crear_ejemplo.py        # genera puestos_ejemplo.xlsx
```

Luego en Configuración usa tu listado real de candidatos y `puestos_ejemplo.xlsx` como
puestos, y practica las asignaciones.

## Archivos

| Archivo | Para qué |
|---|---|
| `app.py` | Servidor web (Flask) y API |
| `excel_store.py` | Lectura/escritura de los Excel (con copias de seguridad) |
| `templates/`, `static/` | Interfaz del panel, la pantalla y la configuración |
| `crear_ejemplo.py` | Genera un Excel de puestos de ejemplo para practicar |
| `run.bat` / `run.sh` | Arranque de un clic |
| `config.json` | Se crea al configurar (rutas y columnas). No se sube al repositorio |
| `backups/` | Copias de seguridad automáticas del Excel de puestos |
