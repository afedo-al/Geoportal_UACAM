import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createReviewDemo } from '../src/lib/review-demo.js';

test('la revisión demo exige aprobar antes de publicar y conserva el historial', () => {
  const demo = createReviewDemo();
  const id = demo.list('en_revision').cargas[0].id;
  assert.throws(() => demo.transition(id, 'publicada'));
  demo.transition(id, 'aprobada');
  const published = demo.transition(id, 'publicada');
  assert.equal(published.estado, 'publicada');
  assert.ok(published.publicada);
  assert.deepEqual(published.historial.slice(-2).map(h => h.accion), ['carga_aprobada', 'capa_publicada']);
  assert.equal(demo.list().totales.en_revision, 2);
  assert.equal(demo.list().totales.publicada, 1);
});

test('devolver y archivar requieren motivo; reiniciar restaura las capas de QGIS', () => {
  const demo = createReviewDemo();
  const id = demo.list('en_revision').cargas[0].id;
  assert.throws(() => demo.transition(id, 'requiere_correccion', ' '));
  assert.throws(() => demo.transition(id, 'archivada'));
  const returned = demo.transition(id, 'requiere_correccion', 'Falta la fuente');
  assert.equal(returned.nota, 'Falta la fuente');
  assert.equal(returned.historial.at(-1).detalle.nota, 'Falta la fuente');
  demo.transition(id, 'en_revision');
  demo.reset();
  assert.equal(demo.list().cargas.length, 3);
  assert.equal(demo.list().totales.en_revision, 3);
  assert.equal(demo.detail(id).nota, '');
  assert.equal(demo.detail(id).historial.length, 1);
});

test('las vistas previas usan los tres GeoJSON reales y conservan sus atributos', async () => {
  const demo = createReviewDemo({ loadGeoJSON: async file => JSON.parse(await readFile(new URL(`../public/data/${file}`, import.meta.url), 'utf8')) });
  const expected = { qgisMunicipios: [11, 'MUNICIPIO'], qgisEntidades: [32, 'NOM_ENT'], qgisClimas: [1182, 'CLIMA_TIPO'] };
  for (const item of demo.list().cargas) {
    const data = await demo.geometry(item.id);
    assert.equal(data.features.length, expected[item.id][0]);
    assert.ok(data.features.every(f => ['Polygon', 'MultiPolygon'].includes(f.geometry.type)));
    assert.ok(data.features.every(f => expected[item.id][1] in f.properties));
    assert.ok(item.archivos.some(f => f.nombre.endsWith('.shp') && f.tam > 900000));
    assert.ok(item.archivos.every(f => /^[a-f0-9]{64}$/.test(f.sha256)));
  }
  assert.equal(demo.detail('qgisMunicipios').estudio.sLic, 'No documentada');
  assert.match(demo.detail('qgisClimas').estudio.sLic, /CC BY-NC/);
});

test('una geometría fallida se puede reintentar y se carga solo una vez al conseguirla', async () => {
  let attempts = 0;
  const data = JSON.parse(await readFile(new URL('../public/data/municipios_qroo_2015.geojson', import.meta.url), 'utf8'));
  const demo = createReviewDemo({ loadGeoJSON: async () => { if (++attempts === 1) throw new Error('Sin conexión'); return data; } });
  await assert.rejects(demo.geometry('qgisMunicipios'), /Sin conexión/);
  assert.equal(await demo.geometry('qgisMunicipios'), data);
  await demo.geometry('qgisMunicipios');
  assert.equal(attempts, 2);
});
