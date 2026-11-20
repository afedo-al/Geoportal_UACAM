import test from 'node:test';
import assert from 'node:assert/strict';
import { pointsToGeoJSON, gpsLayerFileName } from '../src/lib/gps-layer.js';

test('cada punto se vuelve una entidad con [longitud, latitud] y sus atributos', () => {
  const gj = pointsToGeoJSON([{ id: 'a', name: 'Sitio', lat: 19.8, lon: -90.5, altitude: 12, property: 'Predio', author: 'Ana', type: 'Muestra de suelo', date: '2026-01-02', time: '10:30', description: 'x' }]);
  assert.equal(gj.type, 'FeatureCollection');
  assert.deepEqual(gj.features[0].geometry.coordinates, [-90.5, 19.8]);
  assert.equal(gj.features[0].properties.autor, 'Ana');
  assert.equal(gj.features[0].properties.altitud_m, 12);
});

test('los puntos sin coordenadas válidas no entran a la capa', () => {
  const gj = pointsToGeoJSON([{ lat: 'x', lon: 1 }, { lat: 19, lon: -90 }, { lat: null, lon: undefined }]);
  assert.equal(gj.features.length, 1);
});

test('el nombre del archivo es seguro y estable', () => {
  assert.equal(gpsLayerFileName('muestras.xlsx'), 'Capturas GPS · muestras.geojson');
  assert.equal(gpsLayerFileName(''), 'Capturas GPS · puntos de campo.geojson');
  const n = gpsLayerFileName('../../a<b>:c|d?.xlsx');
  assert.ok(!/[\/:*?"<>|]/.test(n.replace('.geojson', '')));
  assert.ok(n.length <= 100);
});
