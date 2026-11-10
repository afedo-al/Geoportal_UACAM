# Seguridad del Geoportal CEDESU

Este documento resume los controles de la interfaz (`web/`, Vue 3 y OpenLayers) y lo que falta para producción, empezando por el servicio de publicación, que aún no existe. La validación en el navegador es una primera barrera: **nunca sustituye la validación del servidor**, porque un atacante puede saltarse el JavaScript y enviar archivos directamente a la API.

## 1. Carga de archivos (`web/src/lib/filecheck.js`, `ingest-core.js`, `ingest.worker.js` y `web/src/stores/upload.js`)

La lectura y la validación se hacen en un **Web Worker** (`ingest.worker.js`), fuera del hilo de la interfaz, así un Shapefile grande no congela la página. El Shapefile de climas de CONABIO (17.8 MB, 1.1 millones de vértices) se valida en unos 2.7 s sin bloquear la interfaz. La validación usa siempre la geometría completa; a la página solo llega una versión simplificada para dibujar la vista previa (como máximo unos 150 000 vértices), y los archivos originales se envían al servidor sin cambios. Si el navegador no admite Workers, el mismo núcleo (`ingest-core.js`) corre en la página. KML y GPX se leen en la página porque los Workers no tienen `DOMParser`, y Excel también; SheetJS se instala desde el paquete oficial y se carga solo cuando se lee un Excel.

Cada archivo se identifica por su **contenido real**, no por su extensión:

| Control | Qué detecta |
|---|---|
| Firma de contenido | Ejecutables (MZ, ELF, Mach-O), scripts (`#!`), HTML o SVG con código, PDF, RAR, 7z, GZIP, imágenes y bases SQLite renombrados como formato geográfico |
| Shapefile `.shp` | Código 9994, versión 1000, tamaño declarado igual al real, tipo de geometría válido, extensión numérica coherente, registros consecutivos que no salen del archivo y un solo tipo de geometría |
| Índice `.shx` | Firma, tamaño, mismo tipo de geometría que el `.shp` y cada desplazamiento apuntando al registro correcto (detecta componentes de conjuntos distintos) |
| Tabla `.dbf` | Byte de versión dBASE, cabecera con terminador, tipos de campo válidos, longitud de registro igual a la suma de campos, archivo no truncado, mismo número de filas que geometrías |
| `.prj` / `.cpg` | WKT de texto con corchetes balanceados y tamaño acotado; `.cpg` corto y de texto |
| GeoPackage | Identificador de aplicación `GPKG` en la cabecera SQLite (otra base SQLite se rechaza) |
| GeoTIFF | Cabecera TIFF y etiquetas de georreferenciación (un TIFF común se rechaza) |
| Excel | `.xlsx` debe ser Office Open XML con `xl/workbook.xml`; se rechazan macros (`vbaProject.bin`), objetos incrustados y ActiveX; `.xls` antiguo no se admite |
| ZIP / KMZ | Rutas con `..` o absolutas, cifrado, nombres duplicados o con caracteres de control, ejecutables y archivos comprimidos anidados, más de 300 entradas, proporción de compresión excesiva y descompresión acotada al tamaño declarado (bombas ZIP) |
| KML / GPX | Se rechazan `DOCTYPE`, entidades (XXE) y hojas de estilo externas; el elemento raíz debe ser `<kml>` o `<gpx>`; no se admiten elementos `<script>` |
| GeoJSON | UTF-8 estricto, tipos de entidad y geometría válidos, posiciones de 2 a 4 números |
| CSV / XLSX | Datos binarios en un CSV; celdas que parecen fórmulas (`=`, `+`, `-`, `@`) se marcan y se neutralizan al exportar |
| Nombres | Caracteres de control, rutas, archivos ocultos, nombres de más de 180 caracteres, doble extensión con extensión ejecutable (`datos.php.geojson`) y caracteres de dirección de texto que disfrazan extensiones |
| Integridad | Huella SHA-256 de cada archivo; se bloquean duplicados dentro del lote y la huella se envía al servidor |
| Metadatos del estudio | Cada capa tiene su propio estudio, que se rellena con lo que declara el archivo (FGDC, ESRI, ISO 19139, KML, GPX, GeoJSON o propiedades de Excel; `web/src/lib/studyinfo.js`). El XML se lee solo si pesa 2 MB o menos y sin DOCTYPE, entidades ni hoja de estilo (se quitan antes los comentarios); se ignoran los textos de plantilla sin llenar (`REQUIRED: …`), «No conocido» y las fechas `00000000`; las rutas del equipo del autor que guarda ArcGIS no se importan; todo se muestra como texto, nunca como HTML. Tema, licencia y acceso solo se rellenan si el valor coincide con una opción permitida. |
| Límites | 60 capas por lote, 400 MB por lote y 60 MB por archivo leído en el navegador |

## 2. Sitio web

- **Content-Security-Policy**: en el build se inyecta como meta en `index.html` (ver `web/vite.config.js`) y el servidor debe enviarla también como cabecera (ver `deploy/nginx-seguridad.conf`). Solo scripts propios, sin scripts en línea ni dependencias de CDN; `object-src 'none'`; `base-uri` y `form-action` restringidos. El servidor de desarrollo de Vite no la aplica, porque necesita su cliente de recarga en caliente.
- **Dependencias**: Vue, OpenLayers y SheetJS se instalan con npm y se empaquetan con el sitio; no se cargan scripts de terceros en tiempo de ejecución.
- **Clickjacking**: `frame-ancestors 'none'` y `X-Frame-Options: DENY`, más un bloqueo en JavaScript si la página se carga dentro de un marco (`web/src/main.js`).
- **XSS**: Vue escapa todo texto interpolado en las plantillas; las ventanas del mapa se construyen con `textContent`, nunca con HTML. Los datos guardados en el navegador se validan al cargarse (por ejemplo, se descartan URL `javascript:` y SVG en fotografías).
- **Sesión**: la validará el servidor (sección 4). La interfaz solo guarda quién inició sesión para mostrarlo; al cerrar sesión se vacía el lote de carga. Se comprueba que la contraseña no aparece en `web/dist`. Sin API configurada en el build, el acceso queda deshabilitado y el diálogo lo explica.
- **Edición de las fichas de prueba**: solo con sesión. Lo editado en los conjuntos de prueba se guarda en este navegador (`localStorage`) y se valida al leerse: solo campos conocidos, texto recortado y sin caracteres de control. No es una protección real, pero tampoco publica nada: las capas del CEDESU solo cambian de estado en el servidor (Revisión), que comprueba el rol en cada petición.
- **Envío al servidor**: solo al mismo origen o a HTTPS (`VITE_API_BASE`), con cabecera `X-Requested-With`, tiempo máximo y la huella SHA-256 de cada archivo.
- **Fotografías de puntos GPS**: solo PNG, JPEG o WebP comprobados por contenido y de hasta 2 MB, en el navegador y otra vez en el servidor. Se sirven con `Content-Security-Policy: sandbox`.
- **Ubicación del dispositivo (Captura GPS)**: se consulta solo al pulsar «Usar mi ubicación», se escribe en el formulario y no se envía a ningún servidor. Los clics en el visor principal ya no cambian las coordenadas del formulario.

## 3. Servidores locales

```bash
cd web && npm run dev       # interfaz: http://127.0.0.1:5174, sin CSP
cd web && npm run preview   # build de producción: http://127.0.0.1:5175, con CSP y cabeceras de seguridad
```

Los puertos se publican solo en `127.0.0.1`.

## 4. Servicio de publicación (pendiente)

No hay servidor en este repositorio. Según el RPT-003 (secciones 8 y 12) debe ofrecer: cuentas personales con segundo factor, cookies `HttpOnly`/`Secure`/`SameSite`, protección CSRF y límite de intentos; recepción en cuarentena fuera de la raíz web; antivirus y conversión con GDAL en un worker aislado sin red; estados de la carga con publicación atómica y versiones; bitácora que nadie pueda modificar; y comprobación de sesión y rol en cada petición (401/403). La validación del navegador descrita arriba no sustituye a ninguno de estos controles.
