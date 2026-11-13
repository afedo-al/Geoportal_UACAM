# Verificación de Revisión con mapas de QGIS

Fecha: 12 de noviembre de 2026.

## Datos comprobados

Los tres Shapefile proceden de `C:/Users/moffi/Documents/QGIS`. Se utilizan las versiones GeoJSON simplificadas ya existentes en `web/public/data/`. No se modificaron los originales.

| Archivo | Entidades | Comparación DBF / GeoJSON |
|---|---:|---|
| `11_municipios_2015_v1.shp` | 11 | Campo OID coincide en todos los registros |
| `mexico.shp` | 32 | Campo CVE_ENT coincide en todos los registros |
| `clima1mgw.shp` | 1,182 | Campo CLIMA_TIPO coincide en todos los registros |

El inventario conserva nombres, tamaños y SHA-256 de los originales. Los metadatos no documentados se muestran como tales; los estados de publicación son simulados.

## Pruebas realizadas

- `npm test`: 22 pruebas aprobadas, incluidas geometrías reales, atributos, transiciones, reinicio y recuperación tras un error de carga.
- `npm run build`: compilación correcta.
- Estrés del almacén local: 300 solicitudes concurrentes de geometría, con solo 3 lecturas efectivas gracias a la caché.
- Estrés de estados: 4,000 transiciones válidas; historial final de 4,003 entradas; reinicio correcto a 3 entradas y 3 capas en revisión. Ejecución conjunta con la carga concurrente: 714 ms en este equipo, una medición.
- Navegador: 30 cambios consecutivos entre los tres mapas. Selección final, título y geometría coherentes; un canvas de mapa; sin errores de consola capturados ni carga pendiente al terminar.
- Inspección visual: municipios con densidad de población, límites estatales y climas con leyenda. Revisados escritorio de 1280 px y móvil de 390 px. Ancho del documento móvil: 390 px, sin desbordamiento horizontal.

## Alcance

Estas pruebas verifican la presentación local y sus datos preparados. No miden usuarios simultáneos, capacidad de un backend, precisión topológica de los Shapefile completos ni disponibilidad del servidor externo de mapas base. La cartografía web está simplificada para visualización y conserva los atributos revisados.
