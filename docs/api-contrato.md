# Contrato de la API (lo que la interfaz espera del servidor)

Fase 5 del plan. El servidor todavía no existe; este documento fija lo que `web/src/` ya usa, para que el
backend se construya contra el mismo contrato. **El navegador nunca es la barrera: el servidor repite
todas las validaciones y comprueba el rol en cada petición.**

Base: `VITE_API_BASE` (mismo origen o HTTPS). Cabeceras: `X-Requested-With: GeoportalCEDESU` y `X-CSRFToken`.

## Reglas que el servidor debe hacer cumplir

| Regla | Detalle |
|---|---|
| Rol | Solo `admin` aprueba, publica, archiva y elimina. Cada petición comprueba el rol. |
| Ficha | Obligatorios: `sTitle`, `sTheme`, `sDate`, `sResp`, `sLic`, `sAccess` (`lib/study-fields.js`). Valores de lista cerrada: `THEMES`, `LICENSES`, `ACCESS`. Rechazar con 422 y la lista de campos. |
| Acceso | Valor por omisión `Interna`. Una capa `Interna` **no** se sirve en `/capas` a quien no tenga sesión. |
| Origen de los datos | El servidor no rellena responsable, licencia ni procedencia. Solo guarda lo que llega. |
| Archivos | Validación de contenido, tamaño y estructura (ver `docs/seguridad.md`), antivirus y conversión con GDAL. |
| Bitácora | Cada cambio de estado queda registrado (quién, cuándo, nota). La eliminación definitiva borra datos y archivos, **pero conserva** la entrada de bitácora de esa acción. |

## Cargas

`POST /cargas/` (multipart): `archivos`, `capa`, `clave`, `sha256`, `estudio` (JSON), `crs`, `mapeo`, y
`modo` (`actualizar` | `nueva`) cuando el nombre coincide con una capa publicada.

- `clave` es el identificador estable de la capa (`lib/layer-key.js`). Las versiones de una misma capa la comparten.
- `modo = actualizar`: la nueva versión reemplaza a la publicada de la misma `clave`; al publicar, la anterior pasa a `archivada`.
- `modo = nueva`: el servidor genera una clave única (`clave-2`, …) y no archiva nada.
- Respuesta: `{ id, estado, estadoTexto, revision, layerKey, version }`.

`GET /cargas?estado=` → `{ cargas: [...], totales: { estado: n } }`.
`GET /cargas/:id` → registro con `estudio`, `revision`, `archivos`, `historial`, `layerKey`, `version`, `reemplazaId`.
`GET /cargas/:id/geojson` → vista previa (simplificada).
`POST /cargas/:id/estado` `{ estado, nota }` → transiciones permitidas:

```
en_revision → aprobada | requiere_correccion | archivada
aprobada → publicada | requiere_correccion | archivada
requiere_correccion → en_revision | archivada
publicada → archivada
archivada → en_revision
```

`nota` obligatoria al devolver o archivar. Al pasar a `publicada` se archiva la versión anterior de la misma `layerKey`.
`DELETE /cargas/:id` → solo si `estado = archivada` (409 en otro caso).

## Capas publicadas

`GET /capas` → `{ capas: [{ id, nombre, entidades, publicada, actualizada, estudio, crs, bbox, formato, layerKey, version, versiones: [{ id, version, estado, estadoTexto, fecha }] }] }`.
`GET /capas/:id.geojson` → geometría completa.

## Puntos de campo

`GET /puntos`, `POST /puntos`, `PUT /puntos/:id`, `DELETE /puntos/:id`, `POST /puntos/lote` `{ puntos: [...] }`.
Campos del punto: `id, name, lat, lon, altitude (m, -500..9000, opcional), property, author, type, description, date, time, photo`.
Importación de Excel: columnas `Name, X, Y, Autor`; X e Y en grados WGS 84 o en metros UTM 15N/16N (el cliente convierte y envía `lat`/`lon`).

## Pendiente del lado del cliente al conectar el servidor

- `lib/review-demo.js` es solo el flujo local de desarrollo: al haber API no se usa. Conviene excluirlo del build de producción cuando se conecte el servidor.
- Las fichas editadas de las capas de referencia se guardan en el navegador; con servidor pasan a persistirse allí.
