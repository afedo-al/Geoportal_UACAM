# Geoportal CEDESU · UACAM

Geoportal institucional para la consulta, visualización y revisión de información geográfica del CEDESU y la Universidad Autónoma de Campeche.

La aplicación web está construida con **Vue 3**, **Vite** y **OpenLayers**. Actualmente funciona como una interfaz cartográfica estática con datos de prueba y una capa de integración preparada para conectarse con la API institucional.

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
