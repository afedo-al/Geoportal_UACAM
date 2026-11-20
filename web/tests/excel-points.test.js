import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCoords } from '../src/lib/excel-points.js';
import { toUTM } from '../src/lib/geo.js';

test('X e Y en grados se toman como longitud y latitud', () => {
  const r = resolveCoords([{ Name: 'a', X: -90.52283, Y: 19.8453, Autor: 'x' }]);
  assert.equal(r.system, 'wgs84');
  assert.ok(Math.abs(r.coords[0].lat - 19.8453) < 1e-9 && Math.abs(r.coords[0].lon + 90.52283) < 1e-9);
});
test('acepta coma decimal y encabezados en español', () => {
  const r = resolveCoords([{ nombre: 'a', longitud: '-90,5', latitud: '19,8' }]);
  assert.equal(r.system, 'wgs84');
  assert.ok(r.coords[0]);
});
test('metros UTM que solo caben en una zona se resuelven solos', () => {
  const p = toUTM(19.8, -91, 15);
  const r = resolveCoords([{ X: p.x, Y: p.y }]);
  assert.equal(r.needsZone, false);
  assert.ok(Math.abs(r.coords[0].lon + 91) < 1e-4);
});
test('metros ambiguos piden zona y la zona elegida desempata', () => {
  const p = toUTM(19.8, -92.5, 15);
  const r = resolveCoords([{ X: 550000, Y: p.y }]);
  assert.equal(r.needsZone, true);
  const z = resolveCoords([{ X: 550000, Y: p.y }], 16);
  assert.equal(z.needsZone, false);
  assert.equal(z.system, 'utm16');
});
test('una fila fuera de Campeche queda sin coordenadas', () => {
  const r = resolveCoords([{ X: -90.5, Y: 19.8 }, { X: -100, Y: 40 }]);
  assert.ok(r.coords[0]); assert.equal(r.coords[1], null);
});
