# DeltaMap-CEDESU · interfaz en Vue y OpenLayers

Interfaz del geoportal con la tecnología definida en el DRS-001 (ADR-001): **Vue 3** para la interfaz y **OpenLayers** para el mapa, construida con **Vite**. Sustituye al prototipo estático con Leaflet, que se retiró.

## Uso

Requiere Node.js 20.19 o superior.

```bash
cd web
npm install
npm run dev        # desarrollo en http://127.0.0.1:5174
npm run build      # versión de producción en web/dist
npm run preview    # sirve web/dist en http://127.0.0.1:5175 con las cabeceras de seguridad
npm run start      # compila y sirve en un solo paso: la versión real para medir el rendimiento (usa el puerto 5175)
npm test           # pruebas unitarias (node --test, sin dependencias): coordenadas, formato y validadores
npm run verify     # ejecuta las pruebas y el build de producción
```

`npm run dev` comprime sus respuestas, pero entrega el código sin minificar y en unos 110 archivos sueltos: sirve para programar, no para medir. Lighthouse en `dev` da ~90 en escritorio y ~65 en móvil; la versión real (`npm run start`) da 100 y ~90.

**Mapa base sin límites administrativos.** Además de Calles, Satélite y Topográfico hay un fondo «Claro» de CARTO (sin clave; sus límites son tenues pero no se pueden quitar). Para un fondo sin límites, crea un estilo en MapTiler Map Designer, desactiva los límites administrativos y compila con `VITE_MAPTILER_KEY` y `VITE_MAP_STYLE_ID`: aparece la opción «Sin límites». La clave viaja en el navegador, así que restríngela a los orígenes autorizados en MapTiler. La política CSP (`vite.config.js` y `deploy/nginx-seguridad.conf`) ya permite `api.maptiler.com` y `*.basemaps.cartocdn.com`.

**Servicio de publicación.** El acceso de administración y los puntos GPS compartidos ya los atiende el servicio de `backend/` (ver [backend/README.md](../backend/README.md)); el envío de cargas, la pantalla Revisión y las capas publicadas siguen pendientes en el servidor. La interfaz ya habla su API: se conecta compilando con `VITE_API_BASE=/api` y, en desarrollo, definiendo `GEOPORTAL_API` con la dirección del servidor para que Vite le redirija `/api`. La edición de simbología usa `PUT /api/capas/<id>/estilo` con un cuerpo `{ "simbologia": { ... } }`; mientras ese endpoint no exista, el estilo se conserva localmente y la interfaz muestra el error. Sin servidor, el mapa, el catálogo, la carga y la validación funcionan con los datos de prueba. En `npm run dev` hay una cuenta de demostración que se valida en el navegador (`src/lib/demo-account.js`: usuario `cedesu.admin` o `cedesu@admin.uacam.mx`) para recorrer las pantallas de administración; no protege nada y no se incluye en el build de producción salvo que se compile con `VITE_DEMO_LOCAL=1`. El build de producción no contiene ninguna contraseña.

La pantalla **Revisión** incluye en desarrollo un flujo local de demostración con cargas de ejemplo. Permite recorrer aprobación, devolución para corrección, reapertura, publicación y archivo; los cambios solo viven en la pestaña y no sustituyen la API ni publican datos reales.

`web/dist` es un sitio estático: se publica en cualquier servidor web (por ejemplo, nginx con `deploy/nginx-seguridad.conf`). **No funciona con doble clic** sobre `index.html`: los navegadores no cargan módulos JavaScript desde `file://`; usa `npm run dev` o `npm run preview`.

Para el build de producción se define la dirección del servicio al compilar:

```bash
VITE_API_BASE=/api npm run build
```

Sin ella, el sitio funciona como consulta estática: no hay acceso de administración y la pantalla de carga indica que el servidor no está configurado.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/views/` | Pantallas: mapa, catálogo, carga de datos, captura GPS y revisión de cargas |
| `src/components/` | Barra superior, buscador, paneles, diálogos, avisos, menús y vista previa |
| `src/stores/` | Estado compartido: interfaz, sesión, mapa (OpenLayers), capas, carga y GPS |
| `src/lib/` | Cliente de la API (`api.js`), validación de archivos (también la usa el servidor), lectura en el Web Worker, conversión de coordenadas y datos de prueba |
| `src/styles/main.css` | Sistema de diseño (el mismo del prototipo, con las reglas de OpenLayers) |
| `public/data/` | Conjuntos de prueba en GeoJSON |

## Qué cambió respecto al prototipo retirado

- El mapa usa OpenLayers en lugar de Leaflet; el aspecto y las funciones son los mismos.
- La lógica de validación (`filecheck.js`, `ingest-core.js`) es la misma, convertida a módulos ES; el Web Worker lo empaqueta Vite.
- SheetJS se instala con npm y se carga solo cuando se lee un Excel.
- Las rutas usan `#/` (por ejemplo, `#/catalogo`); carga y GPS exigen sesión.
- Medir sobre una capa ya no se interrumpe: mientras la regla o el área están activas, los clics añaden vértices en lugar de consultar la entidad.
- La política de seguridad del contenido (CSP) se inyecta solo en el build; el servidor de desarrollo la omite para la recarga en caliente.
