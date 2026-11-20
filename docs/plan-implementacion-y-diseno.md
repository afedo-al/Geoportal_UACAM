# Plan de implementación y diseño — DeltaMap-CEDESU

Estado revisado: rama `main`, commit `e57c930`. 23 de 23 pruebas pasan y el build funciona.
Este plan reúne la revisión de los cambios recientes (Inicio, GPS, nombre, capas, fichas
automáticas, flujo Carga → Revisión → Publicación) y propone cómo dejarlos bien diseñados.

---

## 1. Resultado de la revisión

### 1.1 Lo que está bien y se conserva
- Ruta `/bienvenida` con carga diferida y redirección solo en la primera visita.
- Altitud y predio en Captura GPS, validados y exportados; conversión WGS 84 / UTM 15N / UTM 16N.
- Flujo de estados de revisión (`en_revision → aprobada → publicada → archivada`) con transiciones
  cerradas, motivo obligatorio al devolver o archivar y bitácora por cambio.
- Archivado automático de la versión anterior al publicar, y eliminación solo de capas archivadas.
- Se eliminó el texto «Datos de prueba» de las pantallas.

### 1.2 Problemas, de mayor a menor gravedad

| # | Problema | Dónde | Por qué importa |
|---|---|---|---|
| A1 | **La ficha se inventa sola y ya no hay control.** `autoGenerateStudy` rellena responsable, fuente, fecha, licencia, acceso, linaje y palabras clave con valores por defecto. `studyComplete` siempre da verdadero y el bloqueo «Falta completar un estudio» ya nunca actúa. | `stores/upload.js:357`, `sendLayers` | Se publican metadatos que nadie escribió ni revisó: autoría falsa, fecha = día de la carga, tema supuesto «División territorial». |
| A2 | **Acceso `Pública` por defecto junto a licencia «Uso restringido (solo CEDESU)».** Se contradicen, y el valor por omisión más permisivo es el equivocado. | `upload.js` | Riesgo de exponer datos internos. El valor por omisión debe ser `Interna`. |
| A3 | **El linaje afirma pasos que no ocurrieron** («reproyección y normalización cartográfica»). Y todo se rotula «perfil ISO 19115» sin cumplir el perfil. | `upload.js`, `StudyDialog.vue` | Información técnica falsa en una ficha institucional. |
| A4 | **Etiquetas de origen mal asignadas.** `tag()` solo reconoce `metadatos`, `sugerido` y `copiado`; todo lo demás se muestra como «nombre del archivo». Los valores nuevos («asignado automáticamente», «fecha de carga»…) salen mal rotulados. | `StudyDialog.vue` | La persona no puede distinguir lo declarado de lo supuesto. |
| A5 | **Aviso «Ficha generada» duplicado.** Se agrega en `harvestStudy` y en `confirmMapping`. | `upload.js` | Ruido en los resultados de validación. |
| B1 | **Se quitaron los avisos de demostración, pero sigue siendo demostración.** En desarrollo, «Publicar» solo escribe en memoria de la pestaña y se pierde al recargar. En Revisión ya no se dice. | `ReviewView.vue`, `review-demo.js` | La persona cree que publicó. |
| B2 | **Modos inconsistentes.** `loadList` decide con `!hasApi()` y `select` con `DEMO_LOCAL && !hasApi()`. Si falta uno de los dos, llama a una API que no existe. | `ReviewView.vue:49` | Errores confusos fuera de desarrollo. |
| B3 | **`reset()` vuelve a sembrar las tres capas de ejemplo**, contra la decisión de «sin datos precargados». | `review-demo.js` | Comportamiento contradictorio. |
| B4 | **El reemplazo de capas se decide por título normalizado.** Dos capas distintas con el mismo nombre se archivan entre sí, y un renombrado rompe la relación. La normalización está copiada 4 veces. | `review-demo.js`, `upload.js` | Pérdida silenciosa de una versión publicada. |
| C1 | **Capas de ejemplo (QGIS) presentadas como oficiales.** Se quitó el aviso y el grupo ahora se llama «Capas base», pero siguen siendo datos de prueba y «base» se confunde con mapa base. | `datasets.js`, `LayerPanel.vue` | El catálogo parece información publicada del CEDESU. |
| C2 | **Mapa vacío al abrir**, sin orientación. | `datasets.js` (`visible:false`) | Primera impresión pobre; falta un estado vacío que guíe. |
| C3 | **Nombre inconsistente.** Quedan «Geoportal CEDESU» en `WelcomeDialog.vue`, cabeceras HTTP, `main.css`, exportación XML, cita y `README`. CEDESU se expande de dos maneras («de Desarrollo Sustentable» / «para el Desarrollo Sustentable»). | varios | Marca y citas incoherentes. |
| C4 | Pendientes del primer informe: colores fijos en Inicio y GPS, `WelcomeDialog.vue` sin uso, coma decimal que oculta las conversiones, `@input` de altitud que valida latitud y longitud antes de tiempo, sin pruebas de `altitudeError`. | `WelcomeView.vue`, `GpsView.vue`, `tests/` | Calidad y consistencia visual. |

---

## 2. Principios de diseño

1. **Nada se inventa en silencio.** Cada valor de la ficha tiene un origen visible: *Del archivo*,
   *Sugerido*, *Por defecto* o *Escrito por ti*. Lo no confirmado se ve distinto.
2. **Rapidez sin perder el control.** Autocompletar sí, pero la persona confirma antes de enviar.
3. **El valor por omisión es el más seguro:** acceso `Interna`, sin licencia supuesta, sin autoría supuesta.
4. **Decir siempre el modo.** Demostración local, servidor conectado y producción se distinguen con una
   franja discreta, no con textos largos.
5. **Identidad estable de las capas.** Las versiones se relacionan por un identificador de capa, no por el título.
6. **Un solo sistema visual.** Todo con los tokens de `main.css`; cero colores fijos nuevos.

---

## 3. Diseño de la ficha (estudio)

> No pude ver la imagen de referencia que mencionas en tu mensaje. Este diseño parte de los campos
> existentes. Si me la reenvías, lo ajusto a ese estilo.

### 3.1 Estructura en una página (no solo en pestañas)

```
┌──────────────────────────────────────────────────────────────┐
│ Título de la capa                          [Ver en el mapa]  │
│ [Publicada] [Pública] [CC BY 4.0] · v2 · actualizada 12 mar  │
│ Completitud ▓▓▓▓▓▓░░ 5/6 obligatorios                        │
├───────────────────────────────┬──────────────────────────────┤
│ RESUMEN                       │ MINIMAPA + extensión (bbox)  │
│ descripción (máx. 4 líneas)   │ CRS · formato · tamaño · n   │
│ palabras clave (chips)        │                              │
├───────────────────────────────┴──────────────────────────────┤
│ ┌ Identificación ┐ ┌ Responsable y contacto ┐ ┌ Licencia ┐   │
│ └ tema, fecha ───┘ └ responsable, fuente ───┘ └ y acceso ┘   │
│ ┌ Calidad y linaje ─────────┐ ┌ Distribución ──────────────┐  │
│ └ procedencia, validaciones ┘ └ formato, tamaño, enlace ───┘  │
│ ┌ Atributos (tabla con búsqueda) ─────────────────────────┐   │
│ ┌ Versiones e historial (línea de tiempo) ────────────────┐   │
└──────────────────────────────────────────────────────────────┘
```

- **Tarjetas por tema**, en rejilla de 2–3 columnas (1 en móvil), cada una con título, icono y filas
  etiqueta/valor (`KeyValues`). Reemplaza las 5 pestañas, que ocultan información.
- **Encabezado fijo** con estado, acceso, licencia y completitud; las acciones (Ver en el mapa,
  Copiar cita, Exportar XML) siempre a la vista.
- **Indicador de origen por campo** (chip pequeño): `Del archivo`, `Sugerido`, `Por defecto`,
  `Editado`. Los `Por defecto` y `Sugerido` se resaltan con el tono `--warn-bg` hasta que se confirman.
- **Campos faltantes** marcados con «Pendiente» en `--warn`, no con guiones.
- **Línea de tiempo de versiones** que muestra qué versión sustituyó a cuál y cuándo
  (alimentada por la bitácora de Revisión).
- Misma ficha para tres usos: consulta pública (solo lectura), edición (`StudyDialog`) y Revisión
  (junto a la vista previa).

### 3.2 Formulario de edición
- Agrupar campos igual que las tarjetas: *Identificación*, *Responsable*, *Licencia y acceso*,
  *Calidad y linaje*.
- Mostrar el origen de cada valor con el componente de chip (corregido, ver A4).
- Botón **«Confirmar valores sugeridos»** que marca como revisados los autocompletados.

### 3.3 Visual
- Tokens existentes: `--surface`, `--line`, `--text-2`, `--navy-700`, `--gold-500`, `--ok`, `--warn`.
- Tipografía: Inter para texto, IBM Plex Mono para CRS, coordenadas y hashes.
- Mínimo 16 px de gutter en móvil; contraste AA; cada tarjeta es un `<section>` con encabezado.

---

## 4. Plan de implementación por fases

### Fase 0 — Correcciones de honestidad (primero, 1 día)
Objetivo: que lo ya construido no engañe.
1. `upload.js`: **no autorrellenar** responsable, fuente, licencia ni linaje. Dejar vacíos o marcados
   `Por defecto`; **acceso por omisión `Interna`**.
2. Restaurar la exigencia de campos obligatorios en `sendLayers` pero con una acción clara:
   «Completar y enviar» que abre la ficha ya con lo sugerido para confirmar en un clic.
3. Corregir `tag()` con un tipo de origen explícito (`origin: 'archivo' | 'sugerido' | 'defecto' | 'usuario'`)
   en lugar de deducirlo del texto.
4. Quitar el linaje inventado: solo describir pasos reales (validación del navegador, formato, CRS leído).
5. Un solo aviso «Ficha generada» por capa.
6. Franja de **modo** visible (demostración local / servidor): en Revisión y Carga cuando no hay API.
7. `review-demo.js`: `reset()` respeta `initialLayers`; unificar `demoMode` en un solo helper.

**Aceptación:** subir un archivo sin metadatos y no poder enviarlo sin confirmar responsable,
licencia y acceso; ningún campo aparece como «del archivo» si no lo es.

### Fase 1 — Identidad estable de capas y versiones (1–2 días)
1. Campo `layerKey` (slug estable) asignado al crear la capa; las nuevas versiones lo heredan.
2. En Carga, si el nombre coincide con una capa publicada, **preguntar**: «Actualizar capa existente» o
   «Crear capa nueva». El archivado automático usa `layerKey`, no el título.
3. Extraer una sola función `normalizeName` (hoy copiada cuatro veces) a `lib/format.js` con prueba.
4. Numeración `v1, v2…` y enlace «sustituye a / sustituida por» en la ficha.
5. Pruebas: dos capas distintas con título igual no se archivan; renombrar no rompe el vínculo.

### Fase 2 — Ficha rediseñada (2–3 días)
1. Componente `StudyCard.vue` (tarjeta con filas etiqueta/valor) y `SourceChip.vue` (origen del dato).
2. `StudyView` o `MetaDialog` reorganizados según §3.1; `StudyDialog` agrupado según §3.2.
3. Minimapa con bbox (reutilizar `PreviewMap`), tabla de atributos con filtro.
4. Indicador de completitud y estado «Pendiente».
5. Línea de tiempo de versiones desde la bitácora.
6. Vista móvil: una columna, encabezado compacto, tarjetas plegables.

### Fase 3 — Catálogo, mapa y marca (1–2 días)
1. **Datos de ejemplo:** etiquetar de forma honesta («Ejemplo de referencia» / procedencia CONABIO,
   INEGI) con fuente y fecha reales, o retirarlos del catálogo público cuando haya datos del CEDESU.
   Cambiar «Capas base» por «Capas de referencia» para no confundir con mapa base.
2. **Mapa vacío:** estado vacío con una línea («Activa una capa en el panel para comenzar») y, si
   conviene, activar por omisión una sola capa ligera de contexto (contorno estatal).
3. **Marca:** decidir un solo nombre y una sola expansión de CEDESU; actualizar `WelcomeDialog.vue`
   (o eliminarlo), `main.css`, exportación XML, cita, `README`, `llms.txt`.
4. Inicio: sustituir colores fijos por tokens; mantener solo funciones públicas; sin nuevas secciones.

### Fase 4 — GPS y pruebas (1 día)
1. `threeFormats` con coma decimal; `@input` de altitud valida solo altitud.
2. Marcar la zona UTM que corresponde al punto; la otra, como equivalente.
3. Pruebas de `altitudeError` (límites –500 y 9000, vacío, coma, texto), de conversión y de los
   flujos de versión (Fase 1).
4. Retirar `WelcomeDialog.vue` y su clave `cedesuWelcomeSeenV2` si no se usa.

### Fase 5 — Servidor (siguiente etapa, fuera de este alcance inmediato)
- Validar de nuevo en el servidor: formato, tamaño, esquema de la ficha y **rol en cada petición**.
- Persistir versiones, bitácora y relación `layerKey`; la eliminación definitiva borra datos pero
  conserva la bitácora de la acción.
- Eliminar `review-demo.js` del build de producción.

---

## 5. Orden recomendado y esfuerzo

| Fase | Esfuerzo | Riesgo si se omite |
|---|---|---|
| 0 | 1 día | Alto: metadatos falsos y acceso público por defecto |
| 1 | 1–2 días | Alto: pérdida silenciosa de versiones |
| 2 | 2–3 días | Medio: ficha poco clara |
| 3 | 1–2 días | Medio: marca y datos de ejemplo confusos |
| 4 | 1 día | Bajo |

## 6. Decisiones que necesito de ti
1. **Acceso por omisión:** ¿`Interna` (recomendado) o `Pública`?
2. **Licencia y responsable:** ¿obligatorios y escritos por la persona (recomendado) o con valor
   institucional por defecto confirmado en un clic?
3. **Nombre oficial:** ¿«DeltaMap-CEDESU» en todo el proyecto? ¿Qué expansión de CEDESU se usa?
4. **Datos de ejemplo:** ¿se mantienen como referencia etiquetada o se retiran del catálogo?
5. **Referencia visual de la ficha:** reenvía la imagen para ajustar §3.
