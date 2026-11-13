# Geoportal CEDESU · UACAM

El Geoportal CEDESU es una plataforma web institucional para centralizar, organizar, revisar, consultar y publicar de forma controlada la información geográfica generada por el Centro de Estudios para el Desarrollo Sustentable de la Universidad Autónoma de Campeche (UACAM).

El proyecto atiende la dispersión de mapas, coordenadas, fotografías y hojas de cálculo entre distintas computadoras, carpetas y formatos. Ofrece un mapa interactivo, catálogo de estudios, revisión de archivos geoespaciales, vista previa de capas y captura de puntos de campo desde el navegador.

La aplicación web está construida con **Vue 3**, **Vite** y **OpenLayers**. La interfaz actual funciona con datos de prueba y está preparada para conectarse con el servicio institucional de publicación.

## Alcance del proyecto

- Consulta de capas geográficas, búsqueda, identificación y medición en el mapa.
- Catálogo de estudios con metadatos de autoría, fechas, descripción, licencia y acceso.
- Carga y revisión inicial de GeoJSON, Shapefile, KML/KMZ, GPX, GeoPackage, GeoTIFF, CSV y Excel.
- Vista previa de archivos y configuración de simbología antes de su publicación.
- Registro, validación, importación y exportación de puntos de campo.
- Flujo de acceso restringido para carga, edición, revisión y publicación.

El servidor productivo, la persistencia, los usuarios reales, la segunda validación de archivos y la bitácora de publicación corresponden a la siguiente etapa del proyecto.

## Estado del proyecto

- Frontend funcional para consulta cartográfica, catálogo, carga, captura GPS y revisión.
- Visualización y análisis geográfico con OpenLayers.
- Validación de archivos geoespaciales en el navegador.
- Pruebas automatizadas para coordenadas, formatos, seguridad y metadatos.
- Build de producción optimizado con compresión Brotli y gzip.
- CI configurado para ejecutar pruebas y build en cada cambio.
- Backend/API productivo pendiente de implementación y conexión.

## Requisitos

- Node.js `>= 20.19.0`
- npm incluido con Node.js

## Instalación y desarrollo

```bash
cd web
npm ci
npm run dev
```

La aplicación estará disponible en `http://127.0.0.1:5174`.

## Comandos principales

Ejecutar desde `web/`:

```bash
npm run dev       # servidor de desarrollo
npm test          # pruebas unitarias
npm run build     # build de producción
npm run preview   # servir el build localmente
npm run verify    # pruebas y build
npm run start     # build y preview
```

## Configuración de la API

Para conectar el frontend con una API durante el desarrollo:

```bash
GEOPORTAL_API=http://127.0.0.1:8000 npm run dev
```

Para producción, la ruta base se define al compilar:

```bash
VITE_API_BASE=/api npm run build
```

El proxy inverso y las cabeceras de seguridad de producción están documentados en [deploy/nginx-seguridad.conf](deploy/nginx-seguridad.conf).

## Estructura

```text
.
├── .github/workflows/   # Integración continua
├── deploy/              # Configuración de publicación
├── docs/                # Documentación técnica y pruebas
└── web/
    ├── public/          # Recursos y datos geográficos públicos
    ├── src/
    │   ├── components/  # Componentes reutilizables
    │   ├── lib/         # Validación, coordenadas, API y utilidades
    │   ├── stores/      # Estado compartido
    │   └── views/       # Pantallas de la aplicación
    └── tests/           # Pruebas automatizadas
```

## Calidad y CI

La verificación estándar es:

```bash
cd web
npm run verify
```

La integración continua se ejecuta mediante [`.github/workflows/ci.yml`](.github/workflows/ci.yml) en pushes y pull requests hacia `main`.

## Despliegue

El resultado de `npm run build` se genera en `web/dist`. Este directorio puede publicarse detrás de nginx u otro servidor web estático. Para el entorno productivo se recomienda:

- TLS obligatorio.
- Servir únicamente `web/dist`.
- Mantener la API detrás de un proxy inverso.
- No publicar documentos, respaldos ni archivos temporales.
- Configurar las cabeceras de seguridad incluidas en `deploy/nginx-seguridad.conf`.

## Documentación relacionada

- [Documentación del frontend](web/README.md)
- [Configuración de nginx](deploy/nginx-seguridad.conf)
- [Pruebas de revisión QGIS](docs/pruebas-revision-qgis.md)
- [Propuesta y objetivos del proyecto](docs/propuesta_geoportal.md)
- [Controles de seguridad](docs/seguridad.md)

## Licencia y uso

Este repositorio no contiene actualmente un archivo de licencia de software. Por lo tanto, los permisos de copia, modificación, distribución y uso del código quedan pendientes de una definición formal por parte de la UACAM/CEDESU.

Los datos geográficos, logotipos, documentos y demás contenidos institucionales pueden estar sujetos a condiciones de uso distintas a las del código fuente. No deben redistribuirse sin autorización de sus titulares.

## Contacto institucional

**Centro de Estudios para el Desarrollo Sustentable (CEDESU)**  
**Universidad Autónoma de Campeche (UACAM)**

Para solicitar información, reportar un problema o gestionar permisos de uso, contactar al CEDESU a través de los canales institucionales oficiales de la UACAM. El correo y la persona responsable del proyecto deben incorporarse aquí cuando sean confirmados por la institución.
