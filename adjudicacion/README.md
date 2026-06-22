# Aplicación de adjudicación de contratos

Herramienta para el **acto de selección/adjudicación**: un único operador va asignando
los contratos ofertados a los candidatos según los van eligiendo, mientras una pantalla
de proyección muestra en tiempo real lo que queda **por ofertar** y lo ya **adjudicado**.

Como la maneja **una sola persona desde un ordenador**, se evitan los conflictos del Excel
compartido (que dos personas asignen el mismo contrato a la vez).

## Qué hace

Cada vez que alguien acepta un contrato ("el **177**, fulanito, coge 2 meses en Distrito"),
el operador lo registra una sola vez y queda reflejado **en los dos archivos a la vez**:

- **Listado de puestos** (`seleccion.xlsx`): escribe el nombre en la columna *seleccionado*
  y el *estado*. En cuanto el estado es **Aceptado**, ese puesto **desaparece de "por
  ofertar"** en la pantalla (y baja el contador del centro: "Distrito — quedan 3").
- **Listado de candidatos**: marca a esa persona en sus columnas *Oferta Estado / Oferta
  Aceptada / Oferta Datos*, dejando constancia de que ya tiene contrato aceptado.

El **Nº de candidato** es su posición en el listado definitivo (1, 2, 3…), que es lo que se
canta en el acto. Se busca por número, nombre o DNI.

Otras características:
- **Pantalla de proyección** aparte, solo lectura, que se refresca sola cada 3 segundos.
- **Reasignar** o **liberar** un contrato (vuelve a "por ofertar" y se limpia al candidato).
- **Seguridad de datos**: antes de cada cambio guarda una copia en `backups/` y escribe de
  forma atómica (no se corrompe). Conserva las fórmulas y el formato del Excel. Si un Excel
  está abierto en otro programa, avisa y no pierde el cambio.

## Opción A — Ejecutable de Windows (sin instalar nada)

La forma más cómoda. Tras subir el código, GitHub genera automáticamente el ejecutable:

1. Descarga **`Adjudicacion.exe`** desde la Release del repositorio
   (etiqueta `adjudicacion-latest`) o desde la pestaña **Actions** → artefacto
   *Adjudicacion-windows*.
2. Pon el `.exe` en una carpeta, junto a tus dos Excel (candidatos y selección).
3. **Doble clic**. Se abre el navegador con el panel del operador.
4. La primera vez, en ⚙️ **Configuración**, indica los dos Excel y pulsa *Guardar*.

> El `.exe` guarda su `config.json` y las copias de seguridad en su misma carpeta.

## Opción B — Con Python

Requiere **Python 3.9+** instalado.

- **Windows**: doble clic en `run.bat`.
- **Linux/macOS**: `./run.sh` (o `bash run.sh`).

La primera vez crea el entorno e instala dependencias. Después abre el panel en el
navegador. Arranque manual: `pip install -r requirements.txt` y `python app.py`.

## Las dos pantallas

- Panel del operador: <http://localhost:5000/>
- Pantalla de proyección (segundo monitor): <http://localhost:5000/pantalla>

## Uso durante el acto

1. Cuando alguien acepta ("el 177 coge Distrito 2 meses"): busca el contrato (filtros por
   centro/estado o el buscador), pulsa **Asignar**, escribe el **número o nombre** del
   candidato, deja el estado en *Aceptado* y confirma. Se actualizan los dos Excel y la
   pantalla al instante.
2. Estados: **Aceptado, Contactado, No contesta, Renuncia, Pendiente**. Solo *Aceptado*
   retira el puesto de "por ofertar"; el resto lo mantienen disponible/en gestión.
3. Para deshacer, pulsa la **✕** (Liberar): el contrato vuelve a "por ofertar" y se limpia
   la marca del candidato.

> Mantén los Excel **cerrados en Excel** mientras la aplicación está en marcha (si están
> abiertos, el programa no puede guardar y te avisará).

## Probar antes del acto

```bash
python crear_ejemplo.py    # genera puestos_ejemplo.xlsx con la estructura real
```

Luego, en Configuración, usa tu listado real de candidatos y `puestos_ejemplo.xlsx` como
puestos, y practica las asignaciones.

## Estructura de los Excel (detectada automáticamente)

- **Candidatos**: Nombre, Apellidos, DNI + Letra DNI, Teléfono, (puntos para mostrar), y
  *Oferta Estado / Oferta Aceptada / Oferta Datos* (donde se escribe).
- **Puestos**: centro, fecha inicio, fecha fin, duracion, turno, *seleccionado* (donde se
  escribe el nombre), estado, anotacion. Se añaden columnas auxiliares *Nº candidato*,
  *DNI candidato* y *Hora*.

En ⚙️ Configuración puedes corregir a mano cualquier columna mal detectada antes de empezar.

## Archivos

| Archivo | Para qué |
|---|---|
| `app.py` | Servidor web (Flask) y API |
| `excel_store.py` | Lectura/escritura de los dos Excel (con copias de seguridad) |
| `templates/`, `static/` | Panel, pantalla de proyección y configuración |
| `crear_ejemplo.py` | Genera un Excel de puestos de ejemplo |
| `run.bat` / `run.sh` | Arranque con Python |
| `config.json` | Se crea al configurar (rutas y columnas). No se sube al repositorio |
| `backups/` | Copias de seguridad automáticas |
