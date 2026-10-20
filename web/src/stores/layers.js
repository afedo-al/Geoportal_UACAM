/* Capas: registro, visibilidad, selección, ficha de metadatos y capas de la sesión */
import { reactive, markRaw, nextTick } from 'vue';
import GeoJSON from 'ol/format/GeoJSON.js';
import { transformExtent } from 'ol/proj.js';
import { DATASETS, CONTACTO_CEDESU } from '../lib/datasets.js';
import { store, downloadBlob } from '../lib/format.js';
import { mapHooks, createVectorLayer, vectorStyle, addLayer, removeLayer, flyToExtent, bboxToExtent } from './map.js';
import { ui, showToast, startTask, setDock } from './ui.js';
import { router } from '../router.js';

export const layers = reactive({
  entries: [],
  selected: null,
  feature: null,       // entidad seleccionada: { layer, index, total, props, geomType }
  tab: 'info',         // pestaña activa del panel de propiedades
  collapsed: store.get('collapsedGroups', []),
  filter: ''
});

const featureIndex = new WeakMap();   // entidad de OpenLayers → posición en el GeoJSON original
const featuresOf = new Map();         // id de capa → entidades de OpenLayers, en el orden del GeoJSON
const pending = new Map();            // id de capa → promesa de descarga

export const entryById = id => layers.entries.find(e => e.id === id);
export const metaOf = id => entryById(id)?.metaRecord;

/* ---------------- registro de los datos de prueba ---------------- */
export function registerDatasets() {
  if (layers.entries.length) return;
  DATASETS.forEach(def => {
    layers.entries.push({
      id: def.id, kind: 'dataset', group: 'pruebas', name: def.name, visible: def.visible, loading: false, error: null,
      sym: def.sym, def: markRaw(def), metaRecord: { ...def.meta }, geojson: null, count: 0,
      olLayer: markRaw(createVectorLayer({ id: def.id, zIndex: def.zIndex, visible: def.visible, style: f => vectorStyle(def.style(f.getProperties())) }))
    });
  });
}

export const studyList = () => DATASETS.map(d => ({
  id: d.id, title: d.name, theme: d.meta.temas.split(' · ')[0], date: (d.meta.pub || '').slice(0, 7),
  desc: d.meta.resumen, facts: [d.meta.formato, d.meta.res].filter(Boolean)
}));

function fillSource(id, layer, geojson) {
  const feats = new GeoJSON().readFeatures(geojson, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
  feats.forEach((f, i) => featureIndex.set(f, i));
  featuresOf.set(id, feats);
  layer.getSource().addFeatures(feats);
}

export function loadDataset(id) {
  const e = entryById(id);
  if (!e || e.kind !== 'dataset' || e.geojson) return Promise.resolve();
  if (pending.has(id)) return pending.get(id);
  e.loading = true;
  e.error = null;
  const done = startTask(`Cargando ${e.name}`);
  const p = (async () => {
    try {
      const r = await fetch(e.def.url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const gj = await r.json();
      fillSource(id, e.olLayer, gj);
      e.geojson = markRaw(gj);
      e.count = gj.features.length;
      const fields = Object.entries(gj.features[0]?.properties || {});
      e.metaRecord.attrs = fields.map(([k, v]) => [k, typeof v === 'number' ? (Number.isInteger(v) ? 'Entero' : 'Decimal') : 'Texto', 'Campo del archivo original']);
    } catch (err) {
      e.error = `No se pudo cargar (${err.message})`;
      e.visible = false;
      e.olLayer.setVisible(false);
      showToast('error', `No se cargó «${e.name}»`, `${err.message}. Revisa que exista ${e.def.url}.`);
    } finally {
      done();
      e.loading = false;
      pending.delete(id);
    }
  })();
  pending.set(id, p);
  return p;
}
export const loadVisibleDatasets = () => layers.entries.filter(e => e.kind === 'dataset' && e.visible).forEach(e => loadDataset(e.id));

/* ---------------- visibilidad, orden y selección ---------------- */
export function toggleLayer(id, visible) {
  const e = entryById(id);
  if (!e) return;
  e.visible = visible;
  e.olLayer.setVisible(visible);
  if (visible) loadDataset(id);
}

export function toggleGroup(groupId) {
  const i = layers.collapsed.indexOf(groupId);
  if (i >= 0) layers.collapsed.splice(i, 1); else layers.collapsed.push(groupId);
  store.set('collapsedGroups', [...layers.collapsed]);
}

const SESSION_Z = 400;
function restackSession() {
  layers.entries.filter(e => e.kind === 'session').forEach((e, i) => e.olLayer.setZIndex(SESSION_Z + i));
}

export function moveLayer(id, dir) {
  const e = entryById(id);
  const same = layers.entries.filter(x => x.group === e.group);
  const swap = same[same.indexOf(e) + dir];
  if (!swap) return;
  const a = layers.entries.indexOf(e), b = layers.entries.indexOf(swap);
  [layers.entries[a], layers.entries[b]] = [layers.entries[b], layers.entries[a]];
  restackSession();
}

export function selectLayer(id) {
  layers.selected = id;
  layers.feature = null;
}

/* Tras una acción del usuario, abre el panel de propiedades en la pestaña indicada */
export function showProps(id, tab = 'info') {
  selectLayer(id);
  setDock('right', true);
  layers.tab = tab;
}

export function showFeature(id, feature) {
  const e = entryById(id);
  if (!e) return;
  selectLayer(id);
  const i = featureIndex.get(feature) ?? -1;
  const raw = e.geojson?.features[i];
  layers.feature = {
    layer: id, index: i, total: e.geojson?.features.length || 0,
    props: raw?.properties || {}, geomType: raw?.geometry?.type || feature.getGeometry()?.getType() || '—'
  };
  setDock('right', true);
  layers.tab = 'attrs';
}

export function focusFeature(id, index) {
  router.push('/');
  const f = featuresOf.get(id)?.[index];
  if (!f) return;
  nextTick(() => flyToExtent(f.getGeometry().getExtent(), { maxZoom: 11 }));
  showFeature(id, f);
}

export async function zoomToLayer(id) {
  const e = entryById(id);
  if (!e) return;
  if (e.kind === 'dataset' && !e.geojson) { await loadDataset(id); if (!e.geojson) return; }
  const src = e.olLayer.getSource();
  const ext = src.getFeatures().length ? src.getExtent() : e.metaRecord.bbox ? bboxToExtent(e.metaRecord.bbox) : null;
  if (ext) flyToExtent(ext);
}

export function viewStudyOnMap(id) {
  router.push('/');
  const e = entryById(id);
  if (e && !e.visible) toggleLayer(id, true);
  selectLayer(id);
  if (!ui.mobile) setDock('right', true);
  nextTick(() => requestAnimationFrame(() => zoomToLayer(id)));
}

export function showLayerInfo(id) {
  if (!entryById(id)) return;
  selectLayer(id);
  ui.metaId = id;
}

/* ---------------- capas de sesión (vista previa local, no publicada) ---------------- */
let sessionCounter = 0;
const PALETTE = ['#c8a13a', '#24528f', '#b04a2f', '#2d6a4f', '#6b4fa0'];

export function addSessionLayer(name, geojson, metaRecord) {
  const id = `sesion-${++sessionCounter}`;
  const color = PALETTE[(sessionCounter - 1) % PALETTE.length];
  const types = new Set(geojson.features.map(f => f.geometry?.type));
  const t = [...types].some(g => /Polygon/.test(g)) ? 'poly' : [...types].some(g => /Line/.test(g)) ? 'line' : 'point';
  const style = () => vectorStyle({ color, weight: 2, fillColor: color, fillOpacity: 0.22 }, color);
  const layer = createVectorLayer({ id, zIndex: SESSION_Z + sessionCounter, style });
  fillSource(id, layer, geojson);
  addLayer(layer);
  const ext = transformExtent(layer.getSource().getExtent(), 'EPSG:3857', 'EPSG:4326'); // [oeste, sur, este, norte]
  metaRecord.bbox = [ext[1], ext[3], ext[0], ext[2]];
  layers.entries.push({
    id, kind: 'session', group: 'sesion', name, visible: true, loading: false, error: null,
    sym: { t, c: color, f: `${color}38` }, metaRecord, geojson: markRaw(geojson), count: geojson.features.length, olLayer: markRaw(layer)
  });
  const k = layers.collapsed.indexOf('sesion');
  if (k >= 0) layers.collapsed.splice(k, 1);
  restackSession();
  return id;
}

export function removeSessionLayer(id) {
  const e = entryById(id);
  if (!e || e.kind !== 'session') return;
  removeLayer(e.olLayer);
  featuresOf.delete(id);
  layers.entries.splice(layers.entries.indexOf(e), 1);
  if (layers.selected === id) { layers.selected = null; layers.feature = null; }
  showToast('info', 'Capa de sesión quitada', e.name);
}

/* ---------------- ficha: exportación y cita ---------------- */
const xml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function exportMeta(id) {
  const m = metaOf(id), e = entryById(id);
  if (!m || !e) return;
  const doc = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Ficha generada por el prototipo del Geoportal CEDESU. -->
<metadatos perfil="ISO 19115 (simplificado)">
  <identificador>${xml(m.id)}</identificador>
  <titulo>${xml(e.name)}</titulo>
  <resumen>${xml(m.resumen)}</resumen>
  <tema>${xml(m.temas)}</tema>
  <responsable>${xml(m.resp)}</responsable>
  <fuente>${xml(m.fuente)}</fuente>
  <fechaPublicacion>${xml(m.pub)}</fechaPublicacion>
  <fechaActualizacion>${xml(m.act)}</fechaActualizacion>
  <escala>${xml(m.escala)}</escala>
  <sistemaReferencia>${xml(m.crs)}</sistemaReferencia>
  <extension sur="${m.bbox[0]}" norte="${m.bbox[1]}" oeste="${m.bbox[2]}" este="${m.bbox[3]}"/>
  <formato>${xml(m.formato)}</formato>
  <licencia>${xml(m.lic)}</licencia>
  <linaje>${xml(m.linaje)}</linaje>
  <palabrasClave>${(m.palabras || []).map(p => `<palabra>${xml(p)}</palabra>`).join('')}</palabrasClave>
</metadatos>`;
  downloadBlob(new Blob([doc], { type: 'application/xml' }), `${m.id}.xml`);
  showToast('success', 'Ficha exportada', `${m.id}.xml`);
}

export function copyCitation(id) {
  const m = metaOf(id), e = entryById(id);
  if (!m || !e) return;
  const text = `${m.resp} (${String(m.pub).slice(0, 4)}). ${e.name} [${m.tipo}]. Escala ${m.escala}. ${CONTACTO_CEDESU.org}. Geoportal CEDESU. ID ${m.id}.`;
  if (!navigator.clipboard) return showToast('error', 'No se pudo copiar', 'El navegador no permite acceder al portapapeles.');
  navigator.clipboard.writeText(text)
    .then(() => showToast('success', 'Cita copiada', text))
    .catch(() => showToast('error', 'No se pudo copiar', 'El navegador bloqueó el acceso al portapapeles.'));
}

/* ---------------- enlaces con el mapa ---------------- */
mapHooks.featureClick = (id, f) => showFeature(id, f);
mapHooks.featureTip = (id, f) => {
  const e = entryById(id);
  return e?.def?.tip ? e.def.tip(f.getProperties()) : '';
};

