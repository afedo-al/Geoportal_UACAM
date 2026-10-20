/* KML y GPX → entidades GeoJSON. Se ejecuta en la página (los Web Workers no tienen DOMParser). */
const all = (root, sel) => Array.from(root.querySelectorAll(sel));
const coordsOf = el => (el?.textContent || '').trim().split(/\s+/).filter(Boolean).map(t => t.split(',').map(Number)).map(c => [c[0], c[1]]);

export function xmlFeatures(doc, kind) {
  const feats = [];
  if (kind === 'kml') {
    all(doc, 'Placemark').forEach(pm => {
      const props = { nombre: pm.querySelector('name')?.textContent?.trim() || '' };
      const d = pm.querySelector('description')?.textContent?.trim(); if (d) props.descripcion = d;
      all(pm, 'ExtendedData Data').forEach(dd => { props[dd.getAttribute('name')] = dd.querySelector('value')?.textContent ?? ''; });
      all(pm, 'ExtendedData SimpleData').forEach(dd => { props[dd.getAttribute('name')] = dd.textContent; });
      const geoms = [];
      all(pm, 'Point coordinates').forEach(el => geoms.push({ type: 'Point', coordinates: coordsOf(el)[0] }));
      all(pm, 'LineString coordinates').forEach(el => geoms.push({ type: 'LineString', coordinates: coordsOf(el) }));
      all(pm, 'Polygon').forEach(pg => geoms.push({ type: 'Polygon', coordinates: [coordsOf(pg.querySelector('outerBoundaryIs coordinates')), ...all(pg, 'innerBoundaryIs coordinates').map(coordsOf)] }));
      feats.push({ type: 'Feature', properties: props, geometry: geoms.length === 1 ? geoms[0] : geoms.length ? { type: 'GeometryCollection', geometries: geoms } : null });
    });
  } else {
    all(doc, 'wpt').forEach(w => feats.push({ type: 'Feature', properties: { nombre: w.querySelector('name')?.textContent || '', elevacion: w.querySelector('ele')?.textContent || '', fecha: w.querySelector('time')?.textContent || '' }, geometry: { type: 'Point', coordinates: [+w.getAttribute('lon'), +w.getAttribute('lat')] } }));
    all(doc, 'trk').forEach(t => all(t, 'trkseg').forEach(sg => feats.push({ type: 'Feature', properties: { nombre: t.querySelector('name')?.textContent || 'Trayecto' }, geometry: { type: 'LineString', coordinates: all(sg, 'trkpt').map(pt => [+pt.getAttribute('lon'), +pt.getAttribute('lat')]) } })));
    all(doc, 'rte').forEach(r => feats.push({ type: 'Feature', properties: { nombre: r.querySelector('name')?.textContent || 'Ruta' }, geometry: { type: 'LineString', coordinates: all(r, 'rtept').map(pt => [+pt.getAttribute('lon'), +pt.getAttribute('lat')]) } }));
  }
  return feats;
}
