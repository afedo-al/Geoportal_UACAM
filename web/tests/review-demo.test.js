import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewDemo } from '../src/lib/review-demo.js';

test('la demostración exige aprobar antes de publicar y conserva el historial', () => {
  const demo = createReviewDemo({ loadGeoJSON: async () => ({ type: 'FeatureCollection', features: [] }) });
  const id = demo.list('en_revision').cargas[0].id;

  assert.throws(() => demo.transition(id, 'publicada'));
  demo.transition(id, 'aprobada');
  const published = demo.transition(id, 'publicada');

  assert.equal(published.estado, 'publicada');
  assert.deepEqual(published.historial.slice(-2).map(item => item.accion), ['carga_aprobada', 'capa_publicada']);
});

test('devolver para corrección requiere una nota y permite reabrir la revisión', () => {
  const demo = createReviewDemo({ loadGeoJSON: async () => ({ type: 'FeatureCollection', features: [] }) });
  const id = demo.list('en_revision').cargas[0].id;

  assert.throws(() => demo.transition(id, 'requiere_correccion', ' '));
  const returned = demo.transition(id, 'requiere_correccion', 'Falta la fuente');
  assert.equal(returned.nota, 'Falta la fuente');
  assert.equal(demo.transition(id, 'en_revision').estado, 'en_revision');
});

test('al publicar una capa con el mismo nombre que una previa, la anterior se archiva automáticamente', () => {
  const demo = createReviewDemo({ loadGeoJSON: async () => ({ type: 'FeatureCollection', features: [] }) });
  const list = demo.list('en_revision').cargas;
  const firstId = list[0].id;
  const title = list[0].titulo;

  demo.transition(firstId, 'aprobada');
  demo.transition(firstId, 'publicada');
  assert.equal(demo.detail(firstId).estado, 'publicada');

  // Se añade una nueva versión con el mismo título
  const newVersion = demo.add({ id: 'nueva-version-1', titulo: title, formato: 'geojson' });
  assert.equal(newVersion.reemplazaId, firstId);

  // Se aprueba y publica la nueva versión
  demo.transition('nueva-version-1', 'aprobada');
  demo.transition('nueva-version-1', 'publicada');

  // La nueva está publicada y la anterior quedó archivada automáticamente
  assert.equal(demo.detail('nueva-version-1').estado, 'publicada');
  assert.equal(demo.detail(firstId).estado, 'archivada');
  assert.equal(demo.publishedList().length, 1);
  assert.equal(demo.publishedList()[0].id, 'nueva-version-1');
});

test('solo las capas archivadas pueden eliminarse definitivamente', () => {
  const demo = createReviewDemo({ loadGeoJSON: async () => ({ type: 'FeatureCollection', features: [] }) });
  const id = demo.list('en_revision').cargas[0].id;

  // No se puede eliminar si está en revisión o publicada
  assert.throws(() => demo.delete(id));

  // Se archiva
  demo.transition(id, 'archivada', 'Obsoleta');
  assert.equal(demo.detail(id).estado, 'archivada');

  // Ahora sí se puede eliminar
  const ok = demo.delete(id);
  assert.equal(ok, true);
  assert.throws(() => demo.detail(id));
});

test('dos capas distintas con título parecido no se archivan entre sí; el mismo nombre con otra grafía sí es la misma capa', () => {
  const demo = createReviewDemo({ initialLayers: [], loadGeoJSON: async () => null });
  demo.add({ id: 'a', titulo: 'Climas de México' });
  demo.add({ id: 'b', titulo: 'Climas de Mexico (CONABIO)' });
  ['a', 'b'].forEach(id => { demo.transition(id, 'aprobada'); demo.transition(id, 'publicada'); });
  assert.equal(demo.publishedList().length, 2);
  const v2 = demo.add({ id: 'c', titulo: 'climas de mexico' });
  assert.equal(v2.reemplazaId, 'a');
  assert.equal(v2.version, 2);
  demo.transition('c', 'aprobada'); demo.transition('c', 'publicada');
  assert.equal(demo.detail('a').estado, 'archivada');
  assert.equal(demo.detail('b').estado, 'publicada');
});

test('el modo «nueva» conserva las dos capas con el mismo nombre', () => {
  const demo = createReviewDemo({ initialLayers: [], loadGeoJSON: async () => null });
  demo.add({ id: 'a', titulo: 'Suelos' });
  demo.transition('a', 'aprobada'); demo.transition('a', 'publicada');
  const n = demo.add({ id: 'b', titulo: 'Suelos', modo: 'nueva' });
  assert.equal(n.reemplazaId, null);
  assert.notEqual(n.layerKey, demo.detail('a').layerKey);
  demo.transition('b', 'aprobada'); demo.transition('b', 'publicada');
  assert.equal(demo.publishedList().length, 2);
});

test('reset respeta las capas iniciales y la clave ignora acentos y extensión', async () => {
  const demo = createReviewDemo({ initialLayers: [], loadGeoJSON: async () => null });
  demo.add({ id: 'a', titulo: 'x' });
  demo.reset();
  assert.equal(demo.list().cargas.length, 0);
  const { layerKey } = await import('../src/lib/layer-key.js');
  assert.equal(layerKey('Municipios_Qroo (2015).geojson'), 'municipios-qroo-2015');
});

test('lo cargado queda como «Interna» si no se indica otro acceso', () => {
  const demo = createReviewDemo({ initialLayers: [], loadGeoJSON: async () => null });
  assert.equal(demo.add({ id: 'a', titulo: 'x' }).acceso, 'Interna');
});
