# Geoportal CEDESU · interfaz en Vue y OpenLayers

Interfaz del geoportal con la tecnología definida en el DRS-001 (ADR-001): **Vue 3** para la interfaz y **OpenLayers** para el mapa, construida con **Vite**. Sustituye al prototipo estático con Leaflet, que se retiró.

## Uso

Requiere Node.js 20.19 o superior.

```bash
cd web
npm install
npm run dev        # desarrollo en http://127.0.0.1:5174
npm run build      # versión de producción en web/dist
npm run preview    # sirve web/dist en http://127.0.0.1:5175 con las cabeceras de seguridad
```

`web/dist` es un sitio estático: se publica en cualquier servidor web (por ejemplo, nginx con `deploy/nginx-seguridad.conf`). **No funciona con doble clic** sobre `index.html`: los navegadores no cargan módulos JavaScript desde `file://`; usa `npm run dev` o `npm run preview`.

Para conectar el servidor de publicación cuando exista, se define su dirección al compilar:

```bash
VITE_API_BASE=/api npm run build
```

Sin ella, la pantalla de carga indica que el servidor no está configurado y nada se publica.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/views/` | Pantallas: mapa, catálogo, carga de datos y captura GPS |
| `src/components/` | Barra superior, buscador, paneles, diálogos, avisos, menús y vista previa |
| `src/stores/` | Estado compartido: interfaz, sesión, mapa (OpenLayers), capas, carga y GPS |
| `src/lib/` | Validación de archivos, lectura en el Web Worker, conversión de coordenadas y datos de prueba |
| `src/styles/main.css` | Sistema de diseño (el mismo del prototipo, con las reglas de OpenLayers) |
| `public/data/` | Conjuntos de prueba en GeoJSON |

## Qué cambió respecto al prototipo retirado

- El mapa usa OpenLayers en lugar de Leaflet; el aspecto y las funciones son los mismos.
- La lógica de validación (`filecheck.js`, `ingest-core.js`) es la misma, convertida a módulos ES; el Web Worker lo empaqueta Vite.
- SheetJS se instala con npm y se carga solo cuando se lee un Excel.
- Las rutas usan `#/` (por ejemplo, `#/catalogo`); carga y GPS exigen sesión.
- Medir sobre una capa ya no se interrumpe: mientras la regla o el área están activas, los clics añaden vértices en lugar de consultar la entidad.
- La política de seguridad del contenido (CSP) se inyecta solo en el build; el servidor de desarrollo la omite para la recarga en caliente.
