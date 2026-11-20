import test from 'node:test';
import assert from 'node:assert/strict';
import { ID_OK, normalizeIds } from '../src/lib/point-ids.js';

test('los identificadores válidos se conservan y los reservados o vacíos se reemplazan', () => {
  assert.ok(ID_OK.test('EXCEL-3'));
  for (const bad of ['', '__proto__', 'constructor', 'prototype', 'a b', 'x'.repeat(41), '<img>']) assert.equal(ID_OK.test(bad), false, bad);
  const out = normalizeIds([{ id: 'a' }, { id: '' }, { id: '__proto__' }]);
  assert.equal(out[0].id, 'a');
  assert.ok(ID_OK.test(out[1].id) && ID_OK.test(out[2].id));
});

test('los identificadores repetidos o ya ocupados se vuelven únicos', () => {
  const out = normalizeIds([{ id: 'EXCEL-4' }, { id: 'EXCEL-4' }, { id: 'EXCEL-5' }], ['EXCEL-5']);
  const ids = out.map(p => p.id);
  assert.equal(new Set(ids).size, 3);
  assert.equal(ids[0], 'EXCEL-4');
  assert.ok(!['EXCEL-5'].includes(ids[2]));
});
