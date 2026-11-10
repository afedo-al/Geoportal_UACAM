import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeFromLayer } from '../src/lib/studyinfo.js';

test('el tema sale del nombre de la capa', () => {
  assert.equal(themeFromLayer('Municipios_QRoo_2015'), 'División territorial');
  assert.equal(themeFromLayer('climas_mexico'), 'Clima');
  assert.equal(themeFromLayer('RiosPrincipales'), 'Hidrología');
  assert.equal(themeFromLayer('manglares_2020'), 'Vegetación');
});

test('si el nombre no lo dice, sale de los campos', () => {
  assert.equal(themeFromLayer('capa1', ['CVEGEO', 'NOM_MUN']), 'División territorial');
  assert.equal(themeFromLayer('puntos', ['id', 'nombre_cientifico']), 'Fauna');
  assert.equal(themeFromLayer('datos', ['TIPO_SUELO']), 'Suelos');
});

test('sin pistas no inventa un tema', () => {
  assert.equal(themeFromLayer('capa_final_v2', ['id', 'nombre']), '');
});
