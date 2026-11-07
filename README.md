# Generador de exámenes Moodle

Aplicación web estática que importa un cuaderno de prácticas en HTML (con el formato de `practicas.html`), genera un banco de preguntas y permite construir un examen para exportarlo como **XML de preguntas de Moodle**.

Todo el procesamiento ocurre en el navegador: no hay servidor, no se suben archivos y no se envía ningún dato a Internet.

## Funciones

- **Importación de la fuente HTML**: detecta prácticas, criterios de evaluación, lecturas de arranque, preguntas de comprensión, objetivos, materiales, pasos, puntos de control, errores comunes, rúbricas, entregables y anexos.
- **Banco de preguntas automático**: a partir de la fuente se generan **preguntas de ensayo** relacionadas con cada práctica y sus pasos:
  - comprensión lectora;
  - objetivo de la práctica;
  - criterios de evaluación;
  - procedimiento completo y cada paso individual;
  - puntos de control;
  - materiales, errores comunes y entregables.
- **Configuración del examen**: título, categoría de Moodle, curso, resultado de aprendizaje, descripción, número de preguntas, puntuación por defecto, criterios de evaluación que deben cubrirse, tipos de pregunta habilitados y orden aleatorio de respuestas.
- **Selección equilibrada**: reparte las preguntas entre prácticas y tipos, respetando los criterios seleccionados, e informa si no hay suficientes preguntas para el número solicitado.
- **CRUD de preguntas**: crear, editar, duplicar, eliminar, buscar y filtrar. Cada pregunta tiene título, enunciado, retroalimentación, criterios, práctica de origen y puntuación.
- **Tipos de pregunta soportados**: opción múltiple (`multichoice`), verdadero/falso (`truefalse`), respuesta corta (`shortanswer`), ensayo (`essay`) y emparejamiento (`matching`). El banco generado automáticamente contiene únicamente preguntas de ensayo; los demás tipos pueden crearse o editarse manualmente.
- **Las preguntas generadas** se relacionan siempre con las prácticas y sus pasos del cuaderno importado, por lo que el examen resultante es de tipo ensayo.
- **Importación/exportación JSON** de todo el proyecto: fuente analizada, configuración, banco y selección.
- **Exportación XML** compatible con la importación de preguntas de Moodle, con categoría, vista previa, copia y descarga.
- **Exportación ODT**: rellena `plantilla_examen.odt` con los datos del examen (ciclo, módulo, RA, criterios) y las preguntas seleccionadas, incluyendo un apartado «Consideraciones» y la lista de criterios; descarga el documento listo para imprimir o editar.
- **Datos curriculares desde `ciclos_db.json`**: selecciona ciclo formativo, módulo profesional y resultado de aprendizaje (RA); los criterios de evaluación se cargan automáticamente desde la base de datos.
- **Detección automática del módulo y RA**: al importar un cuaderno, la aplicación intenta localizar el ciclo, el módulo y el RA por el código y los nombres del documento.
- **Tema oscuro por defecto**, con conmutador a tema claro; la preferencia se guarda en el navegador.
- **Guardado automático** en `localStorage` del navegador.

## Cómo usarla

No requiere instalación ni compilación. Puedes abrir `index.html` directamente en el navegador; para evitar restricciones de algunos navegadores con `file://`, también puedes servir la carpeta localmente:

```bash
cd /ruta/a/la/carpeta
python3 -m http.server 8000
```

Después abre <http://localhost:8000> en el navegador.

### Flujo de trabajo

1. **Fuente**: arrastra un archivo HTML con el formato de `practicas.html`, selecciónalo o pulsa «Cargar `practicas.html` de ejemplo».
2. **Examen**: revisa la información detectada, elige el ciclo, el módulo y el RA (o cámbialos), ajusta el número de preguntas, los criterios y los tipos de pregunta; pulsa «Generar selección de preguntas».
3. **Preguntas**: revisa y ajusta el banco. Puedes marcar o desmarcar preguntas de la selección, crear nuevas, editar, duplicar o eliminar.
4. **Exportar**: descarga el XML para importarlo en Moodle, el ODT relleno a partir de `plantilla_examen.odt` o guarda el JSON para continuar más tarde.

### Datos curriculares: `ciclos_db.json`

La aplicación carga **`ciclos_db.json`** desde la misma carpeta que `index.html`. El archivo contiene los ciclos, módulos, resultados de aprendizaje y criterios de evaluación; no se modifica ni se envía a ningún servidor.

- Si sirves la carpeta con un servidor local o publicas la app en un hosting estático, el archivo se carga automáticamente.
- Si abres `index.html` con `file://` y el navegador bloquea la lectura, aparecerá un aviso con el botón **«Cargar ciclos_db.json»** para seleccionarlo manualmente.
- Al elegir un ciclo, un módulo y un RA, se actualizan el curso, el RA, el texto del RA y los criterios disponibles. También se filtran las preguntas del banco por esos criterios.
- Los criterios se identifican con letras (a, b, c…) asignadas por orden dentro de cada RA.
- El XML exportado incluye el módulo y el RA en la información de la categoría de Moodle.

### Tema

La interfaz se abre en **tema oscuro**. El botón del encabezado alterna entre tema oscuro y claro, y la elección se conserva en `localStorage` con la clave `moodle-exam-builder-theme`.

### Importar el XML en Moodle

1. En el curso, abre el cuestionario y entra en **Banco de preguntas**.
2. Pulsa **Importar** y elige el formato **XML de Moodle**.
3. Sube el archivo `.xml` generado y confirma la importación.
4. Las preguntas aparecerán en la categoría indicada.

## Estructura del proyecto

```
index.html              Interfaz de la aplicación
assets/styles.css       Estilos de la interfaz
js/util.js              Utilidades generales (texto, HTML, descargas, IDs)
js/parser.js            Análisis del cuaderno de prácticas HTML
js/generator.js         Generación del banco y selección del examen
js/curriculum.js        Carga y normalización de ciclos, módulos, RA y criterios
js/moodle-xml.js        Exportador al formato XML de Moodle
js/odt.js               Generador del ODT relleno a partir de plantilla_examen.odt
js/store.js             Persistencia, normalización e importación/exportación JSON
js/app.js               Lógica de la interfaz y eventos
ciclos_db.json          Base de datos de ciclos, módulos, RA y criterios
practicas.html          Cuaderno de prácticas de ejemplo
pregunta_examen.xml     Ejemplo del formato XML de Moodle
examen_ejemplo.html     Documento de ejemplo ajeno al parser
```

El orden de carga de los scripts está definido al final de `index.html`; no se usan módulos ES ni dependencias externas.

### Archivos necesarios al publicar

Para que la aplicación funcione completa en un servidor estático, sube:

```
index.html
assets/
js/
ciclos_db.json
plantilla_examen.odt
```

`practicas.html` solo es necesario si quieres usar el botón de ejemplo. El resto de archivos (`pregunta_examen.xml`, `examen_ejemplo.html`, `README.md`) son de referencia y no se necesitan en producción.

## Formato JSON

El JSON exportado incluye un identificador de formato y una versión:

```json
{
  "format": "moodle-exam-builder",
  "version": 1,
  "state": { "...": "..." }
}
```

La importación valida el formato y normaliza la estructura antes de cargarla. Si ya hay datos, la aplicación pide confirmación antes de reemplazarlos.

## Persistencia

El estado se guarda automáticamente en `localStorage` bajo la clave `moodle-exam-builder-v1`. El botón **Reiniciar** borra los datos guardados en ese navegador. Para mover el trabajo a otro equipo o hacer una copia de seguridad, usa la exportación JSON.

La preferencia de tema se guarda por separado en `moodle-exam-builder-theme` (`dark` o `light`).

## Limitaciones y recomendaciones

- Las preguntas automáticas son un **punto de partida**. Están construidas a partir de fragmentos del cuaderno y conviene revisar su redacción, dificultad y alternativas antes de publicarlas.
- El parser espera la estructura y las convenciones de `practicas.html`. Cambios importantes en el HTML de origen pueden requerir ajustes en `js/parser.js`.
- El banco generado contiene únicamente preguntas de ensayo; si se necesitan otros tipos, deben crearse o editarse manualmente en el banco.
- Cada pregunta generada se asocia a una práctica y, cuando corresponde, a uno de sus pasos, por lo que conviene revisar la redacción y el alcance antes de exportarla.
- Los tipos `shortanswer` y algunas variantes de `matching` pueden crearse o editarse manualmente aunque no se generen de forma automática para todas las prácticas.
- El contenido se exporta como texto/HTML simple: las imágenes o recursos externos del cuaderno no se incluyen en el XML.
- El proyecto no guarda datos en la nube. Si se borran los datos del navegador sin haber exportado el JSON, la información se pierde.

## Validación

El XML generado se ha probado con `xmllint` y la interfaz con Chromium mediante Playwright, incluyendo:

- generación de exámenes con todos los tipos de pregunta;
- exportación y validación del XML;
- exportación, reinicio e importación del JSON;
- búsqueda, filtros y selección de preguntas;
- comprobación de errores de consola y diseño móvil.
