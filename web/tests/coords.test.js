import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordError, inWorkArea, LAT, LON } from '../src/lib/coords.js';

test('acepta coordenadas válidas dentro del área de trabajo, con punto o coma decimal', () => {
  assert.equal(coordError('19.84530', 'lat'), '');
  assert.equal(coordError('-90.52283', 'lon'), '');
  assert.equal(coordError('19,8453', 'lat'), '');
  assert.equal(coordError(19.8, 'lat'), '');
});

test('pide el valor cuando falta', () => {
  assert.match(coordError('', 'lat'), /Escribe la latitud/);
  assert.match(coordError('   ', 'lon'), /Escribe la longitud/);
  assert.match(coordError(null, 'lat'), /Escribe la latitud/);
});

test('rechaza texto que no es número', () => {
  assert.match(coordError('19°50′', 'lat'), /grados decimales/);
  assert.match(coordError('abc', 'lon'), /grados decimales/);
});

test('distingue el rango del globo del área de trabajo', () => {
  assert.match(coordError('91', 'lat'), /entre -90 y 90/);
  assert.match(coordError('-181', 'lon'), /entre -180 y 180/);
  assert.match(coordError('40.4', 'lat'), /Fuera del área de trabajo/);
  assert.match(coordError('-3.7', 'lon'), /Fuera del área de trabajo/);
});

test('los límites del área de trabajo son inclusivos', () => {
  assert.equal(coordError(String(LAT[0]), 'lat'), '');
  assert.equal(coordError(String(LAT[1]), 'lat'), '');
  assert.equal(coordError(String(LON[0]), 'lon'), '');
  assert.equal(coordError(String(LON[1]), 'lon'), '');
  assert.equal(inWorkArea(LAT[0], LON[1]), true);
  assert.equal(inWorkArea(13.99, -90), false);
  assert.equal(inWorkArea(NaN, -90), false);
});
