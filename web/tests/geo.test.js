import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCoord, formatCoord, toUTM, fromUTM, niceScale, fmtLen, fmtArea, geodesicArea } from '../src/lib/geo.js';

test('parseCoord: decimales con coma, punto, hemisferios y grados', () => {
  assert.deepEqual(parseCoord('19.84, -90.53'), { lat: 19.84, lon: -90.53 });
  assert.deepEqual(parseCoord('19,84 -90,53'), { lat: 19.84, lon: -90.53 });
  assert.deepEqual(parseCoord('19.84 N 90.53 O'), { lat: 19.84, lon: -90.53 });
  assert.deepEqual(parseCoord('19.84° N, 90.53° W'), { lat: 19.84, lon: -90.53 });
  assert.equal(parseCoord('Campeche'), null);
  assert.equal(parseCoord('95, -90'), null);      // latitud imposible
});

test('formatCoord muestra WGS 84 con hemisferio y UTM en metros', () => {
  assert.equal(formatCoord(19.8453, -90.52283, 'wgs84'), '19.84530° N  90.52283° O');
  assert.match(formatCoord(19.8453, -90.52283, 'utm15'), /^E [\d,]+ {2}N [\d,]+$/);
});

test('toUTM: el meridiano central de la zona tiene Este 500 000 y es simétrico', () => {
  const cm = toUTM(20, -93, 15);
  assert.ok(Math.abs(cm.x - 500000) < 1e-6);
  const w = toUTM(20, -94, 15), e = toUTM(20, -92, 15);
  assert.ok(Math.abs((w.x + e.x) - 1000000) < 1e-3);
  assert.ok(Math.abs(w.y - e.y) < 1e-3);
  assert.equal(toUTM(0, -93, 15).y, 0);
});

test('fromUTM: convierte de regreso a grados decimales en 15N y 16N', () => {
  for (const [lat, lon, zone] of [[19.8453, -90.52283, 15], [20.1, -88.7, 16]]) {
    const utm = toUTM(lat, lon, zone);
    const result = fromUTM(utm.x, utm.y, zone);
    assert.ok(Math.abs(result.lat - lat) < 1e-5);
    assert.ok(Math.abs(result.lon - lon) < 1e-5);
  }
});

test('escala, longitudes y áreas legibles', () => {
  assert.equal(niceScale(3_312_345), '1 : 3,300,000');
  assert.equal(fmtLen(850), '850 m');
  assert.equal(fmtLen(12_345), '12.35 km');
  assert.match(fmtArea(2_500_000), /km²$/);
  assert.match(fmtArea(25_000), /ha$/);
});

test('geodesicArea: un grado cuadrado cerca del ecuador mide unos 12 300 km²', () => {
  const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  const km2 = geodesicArea(ring) / 1e6;
  assert.ok(km2 > 12_000 && km2 < 12_500, `obtenido ${km2}`);
});
