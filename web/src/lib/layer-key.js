/* Identificador estable de una capa: su nombre sin acentos, en minúsculas y con guiones.
   Las versiones de una misma capa comparten esta clave; así «Climas (CONABIO)» y «climas conabio»
   son la misma capa, y dos capas distintas nunca se archivan por error. Sin dependencias del navegador. */
export const layerKey = name => String(name ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\.(geojson|json|shp|zip|kml|kmz|gpx|csv|xlsx?|gpkg|tiff?)$/, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'capa';
