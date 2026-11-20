/* Capturas de campo → capa. Convierte los puntos de Captura GPS en un GeoJSON (una entidad por punto) para que
   entren al flujo de Carga → Revisión → Publicación como cualquier otra capa. Sin dependencias del navegador. */

/* Nombre de archivo seguro a partir de un texto libre (nombre del Excel importado, por ejemplo) */
export function gpsLayerFileName(base = 'puntos de campo') {
  const clean = String(base).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'puntos de campo';
  return `Capturas GPS · ${clean}.geojson`;
}

/* Un punto por entidad; las coordenadas van como [longitud, latitud] y el resto como atributos */
export function pointsToGeoJSON(points) {
  return {
    type: 'FeatureCollection',
    features: points.filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))).map(p => ({
      type: 'Feature',
      properties: {
        id: p.id || '',
        nombre: p.name || '',
        tipo: p.type || '',
        fecha: p.date || '',
        hora: p.time || '',
        altitud_m: p.altitude ?? null,
        predio: p.property || '',
        autor: p.author || '',
        descripcion: p.description || ''
      },
      geometry: { type: 'Point', coordinates: [Number(p.lon), Number(p.lat)] }
    }))
  };
}
