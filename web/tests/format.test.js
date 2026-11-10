import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safePhotoURL, fmtSize, norm } from '../src/lib/format.js';
import { FileCheck } from '../src/lib/filecheck.js';

test('safePhotoURL solo deja pasar https e imágenes PNG, JPEG o WebP embebidas', () => {
  assert.equal(safePhotoURL('https://example.org/a.jpg'), 'https://example.org/a.jpg');
  assert.equal(safePhotoURL('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(safePhotoURL('http://example.org/a.jpg'), '');
  assert.equal(safePhotoURL('javascript:alert(1)'), '');
  assert.equal(safePhotoURL('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(safePhotoURL('https://x.org/a.jpg" onerror="x'), '');
  assert.equal(safePhotoURL(null), '');
});

test('fmtSize redondea a KB o MB', () => {
  assert.equal(fmtSize(10), '1 KB');
  assert.equal(fmtSize(2048), '2 KB');
  assert.equal(fmtSize(17.8 * 1048576), '17.8 MB');
});

test('norm ignora acentos y mayúsculas al buscar', () => {
  assert.equal(norm('Köppen-García'), 'koppen-garcia');
  assert.equal(norm(undefined), '');
});

test('safeCell neutraliza fórmulas al exportar CSV sin tocar números negativos', () => {
  assert.equal(FileCheck.safeCell('=HYPERLINK("x")'), `'=HYPERLINK("x")`);
  assert.equal(FileCheck.safeCell('@SUM(A1)'), `'@SUM(A1)`);
  assert.equal(FileCheck.safeCell('-90.52283'), '-90.52283');
  assert.equal(FileCheck.safeCell('+52'), '+52');
  assert.equal(FileCheck.safeCell('Muestra norte'), 'Muestra norte');
});

test('signature reconoce el contenido real, no la extensión', () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer;
  const pdf = new TextEncoder().encode('%PDF-1.7').buffer;
  assert.equal(FileCheck.signature(zip), 'zip');
  assert.equal(FileCheck.signature(pdf), 'pdf');
});
