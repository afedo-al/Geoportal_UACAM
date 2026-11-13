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
