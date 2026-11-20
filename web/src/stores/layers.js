/* Capas: registro, visibilidad, selección, ficha de metadatos y capas de la sesión */
import { reactive, markRaw, nextTick } from 'vue';
import GeoJSON from 'ol/format/GeoJSON.js';
import { transformExtent } from 'ol/proj.js';
import { DATASETS, CONTACTO_CEDESU } from '../lib/datasets.js';
import { store, downloadBlob } from '../lib/format.js';
import { mapHooks, createVectorLayer, vectorStyle, addLayer, removeLayer, flyToExtent, bboxToExtent } from './map.js';
import { ui, showToast, startTask, setDock, confirmAction } from './ui.js';
import { session, onSessionStart, onSessionEnd } from './session.js';
import { api, apiHref, hasApi } from '../lib/api.js';
import { onStudyChange, onStudyDeleted, metaFromStudy, studyEntry } from './studies.js';
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
const STYLE_KEY = 'cedesuLayerStyles';
const STYLE_FIELDS = ['color', 'fillColor', 'weight', 'opacity', 'fillOpacity', 'pointRadius', 'mode', 'field', 'classes', 'classification'];
const DENSITY_RAMPS = ['#eff6e8', '#c7e9c0', '#7fcdbb', '#41b6c4', '#225ea8'];
const defaultStyle = { color: '#214c7e', fillColor: '#214c7e', weight: 1.5, opacity: 0.95, fillOpacity: 0.22, pointRadius: 5, mode: 'single', field: '', classes: 5, classification: 'equal' };
const savedStyles = store.get(STYLE_KEY, {});
const cleanStyle = value => {
  const out = {};
  STYLE_FIELDS.forEach(k => {
    if (value && Object.prototype.hasOwnProperty.call(value, k)) out[k] = value[k];
  });
  return { ...defaultStyle, ...out, classes: Math.max(3, Math.min(5, Number(out.classes) || 5)), classification: out.classification === 'quantile' ? 'quantile' : 'equal' };
};
const persistStyle = (id, style) => {
  const all = store.get(STYLE_KEY, {});
  store.set(STYLE_KEY, { ...(all && typeof all === 'object' ? all : {}), [id]: style });
};
const statsCache = new Map();
function numericStats(e, field) {
  const key = `${e.id}:${field}`;
  const cached = statsCache.get(key);
  if (cached?.geojson === e.geojson) return cached.stats;
  const values = (e.geojson?.features || []).map(f => Number(f.properties?.[field])).filter(Number.isFinite).sort((a, b) => a - b);
  const stats = values.length ? { values, min: values[0], max: values[values.length - 1] } : null;
  statsCache.set(key, { geojson: e.geojson, stats });
  return stats;
}
function classIndex(stats, value, classes, classification) {
  if (!stats || !Number.isFinite(value)) return -1;
  if (stats.min === stats.max) return classes - 1;
  if (classification === 'quantile') {
    for (let i = 0; i < classes; i++) {
      const upper = stats.values[Math.min(stats.values.length - 1, Math.ceil(((i + 1) / classes) * stats.values.length) - 1)];
      if (value <= upper) return i;
    }
    return classes - 1;
  }
  return Math.max(0, Math.min(classes - 1, Math.floor(((value - stats.min) / (stats.max - stats.min)) * classes)));
}
function layerStyle(e, props) {
  const base = e.def?.style ? e.def.style(props) : { ...defaultStyle };
  const custom = e.styleConfig;
  if (!custom) return vectorStyle(base);
  let fillColor = custom.fillColor;
  if (custom.mode === 'density' && custom.field) {
    const stats = numericStats(e, custom.field);
    const value = Number(props?.[custom.field]);
    const index = classIndex(stats, value, custom.classes, custom.classification);
    if (index >= 0) fillColor = DENSITY_RAMPS[Math.min(DENSITY_RAMPS.length - 1, index)];
  }
  return vectorStyle({
    ...base, color: custom.color, fillColor, weight: Number(custom.weight),
    opacity: Number(custom.opacity), fillOpacity: Number(custom.fillOpacity)
  }, custom.color);
}
export const styleFields = e => {
  const first = e?.geojson?.features?.[0]?.properties || {};
  return Object.keys(first).filter(k => (e.geojson.features || []).some(f => Number.isFinite(Number(f.properties?.[k]))));
};
export const styleConfigOf = e => e?.styleConfig || defaultStyle;

/* Los estudios del lote que aún no son capa del mapa («lote:c1») se resuelven con el mismo formato de ficha */
export const entryById = id => layers.entries.find(e => e.id === id) || studyEntry(id);
export const metaOf = id => entryById(id)?.metaRecord;

/* ---------------- registro de los datos de prueba ---------------- */
export function registerDatasets() {
  if (layers.entries.length) return;
  DATASETS.forEach(def => {
    layers.entries.push({
      id: def.id, kind: 'dataset', group: 'pruebas', name: def.name, visible: def.visible, loading: false, error: null,
      sym: def.sym, def: markRaw(def), metaRecord: { ...def.meta }, geojson: null, count: 0, edited: false, hidden: false,
      styleConfig: savedStyles?.[def.id] ? cleanStyle(savedStyles[def.id]) : null, olLayer: markRaw(createVectorLayer({ id: def.id, zIndex: def.zIndex, visible: def.visible, style: () => null }))
    });
    const e = layers.entries[layers.entries.length - 1];
    e.olLayer.setStyle(f => layerStyle(e, f.getProperties()));
  });
  /* Cambios que un administrador hizo antes en este navegador */
  const edits = store.get(EDITS_KEY, {});
  const hidden = store.get(HIDDEN_KEY, []);
  layers.entries.filter(e => e.kind === 'dataset').forEach(e => {
    if (edits && typeof edits === 'object' && edits[e.id] && typeof edits[e.id] === 'object') applyEdit(e, edits[e.id]);
    if (Array.isArray(hidden) && hidden.includes(e.id)) hideEntry(e);
  });
}

/* ---------------- capas publicadas por el servicio de publicación ----------------
   Las aprobadas y publicadas en la pantalla Revisión. Las de acceso «Interna» solo llegan con sesión,
   así que la lista se vuelve a pedir al iniciar o cerrar sesión. */
const PUB_COLORS = ['#1f6f8b', '#b5523b', '#5a7d2a', '#7a4f9a', '#a8741a', '#2f5d9b'];
let pubSeq = 0;

const PUB_FORMATS = { shp: 'Shapefile', zip: 'Shapefile en ZIP', kmz: 'KMZ', geojson: 'GeoJSON', kml: 'KML', gpx: 'GPX', csv: 'CSV', xlsx: 'Excel' };

function publishedMeta(c) {
  const s = c.estudio || {};
  return {
    id: `CEDESU-${c.id.slice(0, 8).toUpperCase()}`, cat: 'Capa publicada', estatus: 'Publicada', tipo: 'Vector',
    temas: s.sTheme || '—', resumen: s.sDesc || 'Sin descripción.', pub: s.sDate || '', act: (c.actualizada || '').slice(0, 10),
    escala: '—', res: '—', crs: c.crs || '—', bbox: c.bbox, formato: PUB_FORMATS[c.formato] || c.formato || '—', tam: '—', lic: s.sLic || '—',
    palabras: String(s.sKeywords || '').split(',').map(x => x.trim()).filter(Boolean),
    resp: s.sResp || '—', fuente: s.sSource || s.sResp || '—', linaje: s.sLineage || '—',
    access: `${s.sAccess || 'Sin clasificar'} · publicada el ${(c.publicada || '').slice(0, 10)}`, attrs: [],
    version: c.version || 1, versiones: c.versiones || []
  };
}

function publishedEntry(c) {
  const color = PUB_COLORS[pubSeq++ % PUB_COLORS.length];
  const def = {
    id: `pub:${c.id}`, remote: true, name: c.nombre, url: apiHref(`capas/${c.id}.geojson`), visible: false, zIndex: 420 + pubSeq,
    sym: { t: 'poly', c: color, f: `${color}33` }, label: null,
    style: () => ({ color, weight: 1.4, opacity: 0.95, fillColor: color, fillOpacity: 0.22 }),
    tip: p => { const k = Object.keys(p).find(x => x !== 'geometry' && /nom|name|municipio|clave|tipo|id/i.test(x)) || Object.keys(p).find(x => x !== 'geometry'); return k ? `${k}: ${p[k]}` : c.nombre; },
    meta: publishedMeta(c)
  };
  const e = {
    id: def.id, kind: 'dataset', remote: true, group: 'publicadas', name: def.name, visible: false, loading: false, error: null,
    sym: def.sym, def: markRaw(def), metaRecord: { ...def.meta }, geojson: null, count: c.entidades || 0, edited: false, hidden: false,
    styleConfig: c.simbologia || savedStyles?.[def.id] ? cleanStyle(c.simbologia || savedStyles[def.id]) : null, olLayer: markRaw(createVectorLayer({ id: def.id, zIndex: def.zIndex, visible: false, style: () => null }))
  };
  e.olLayer.setStyle(f => layerStyle(e, f.getProperties()));
  return e;
}

/* Las peticiones se encadenan: iniciar sesión mientras se pide la lista no duplica capas */
let pubQueue = Promise.resolve();
export const loadPublished = () => (pubQueue = pubQueue.then(syncPublished, syncPublished));

async function syncPublished() {
  let list;
  if (hasApi()) {
    try { list = (await api('/capas', { quiet401: true })).capas || []; }
    catch { return; }   // sin servidor: el mapa sigue con los datos de prueba
  } else {
    try {
      const { reviewDemo } = await import('../lib/review-demo.js');
      list = (reviewDemo.publishedList() || []).map(c => ({
        id: c.id,
        nombre: c.titulo,
        entidades: c.entidades,
        publicada: c.publicada,
        estudio: c.estudio,
        crs: c.crs,
        bbox: c.bbox,
        layerKey: c.layerKey,
        version: c.version,
        versiones: reviewDemo.versions(c.layerKey)
      }));
    } catch { list = []; }
  }
  const keep = new Set(list.map(c => `pub:${c.id}`));
  layers.entries.filter(e => e.remote && !keep.has(e.id)).forEach(e => {
    removeLayer(e.olLayer);
    featuresOf.delete(e.id);
    if (layers.selected === e.id) { layers.selected = null; layers.feature = null; }
    layers.entries.splice(layers.entries.indexOf(e), 1);
  });
  list.forEach(c => {
    if (layers.entries.some(e => e.id === `pub:${c.id}`)) return;
    const e = publishedEntry(c);
    layers.entries.push(e);
    addLayer(e.olLayer);   // si el mapa aún no existe, initMap la añade con las demás
  });
}
onSessionStart(() => loadPublished());
onSessionEnd(() => loadPublished());

/* ---------------- fichas de los conjuntos de prueba: edición local (solo administración) ----------------
   No hay servidor de publicación: lo editado se guarda en este navegador y nunca cambia el archivo de datos.
   Ocultar un conjunto lo quita del catálogo, del mapa y del buscador; se puede restaurar. */
const EDITS_KEY = 'cedesuDatasetEdits';
const HIDDEN_KEY = 'cedesuHiddenDatasets';
const META_OF_FIELD = [['sTheme', 'temas'], ['sDate', 'pub'], ['sResp', 'resp'], ['sSource', 'fuente'], ['sLic', 'lic'], ['sAccess', 'access'], ['sDesc', 'resumen'], ['sLineage', 'linaje']];
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, ' ').trim().slice(0, n);

function applyEdit(e, edit) {
  const title = clip(edit.sTitle, 200);
  if (title) e.name = title;
  META_OF_FIELD.forEach(([f, m]) => { if (typeof edit[f] === 'string') e.metaRecord[m] = clip(edit[f], 2000); });
  if (typeof edit.sDate === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(e.metaRecord.pub)) e.metaRecord.pub = '';
  if (typeof edit.sKeywords === 'string') e.metaRecord.palabras = edit.sKeywords.split(',').map(s => clip(s, 80)).filter(Boolean);
  e.edited = true;
}
function hideEntry(e) {
  e.hidden = true;
  e.visible = false;
  e.olLayer.setVisible(false);
  if (layers.selected === e.id) { layers.selected = null; layers.feature = null; }
}
const persistHidden = () => store.set(HIDDEN_KEY, layers.entries.filter(e => e.hidden).map(e => e.id));

/* Valores de la ficha en el formato del formulario de estudio */
export function datasetForm(id) {
  const e = entryById(id);
  if (!e || e.kind !== 'dataset') return null;
  const m = e.metaRecord;
  return {
    sTitle: e.name, sTheme: m.temas || '', sDate: /^\d{4}-\d{2}-\d{2}$/.test(m.pub || '') ? m.pub : '', sResp: m.resp || '', sSource: m.fuente || '',
    sLic: m.lic || '', sAccess: m.access || '', sDesc: m.resumen || '', sLineage: m.linaje || '', sKeywords: (m.palabras || []).join(', ')
  };
}

export function saveDatasetMeta(id, values) {
  const e = entryById(id);
  if (!session.admin || !e || e.kind !== 'dataset' || e.remote) return false;
  const edit = Object.fromEntries(['sTitle', ...META_OF_FIELD.map(x => x[0]), 'sKeywords'].map(k => [k, clip(values[k], k === 'sTitle' ? 200 : 2000)]));
  applyEdit(e, edit);
  const all = store.get(EDITS_KEY, {});
  store.set(EDITS_KEY, { ...(all && typeof all === 'object' ? all : {}), [id]: edit });
  return true;
}

export function resetDatasetMeta(id) {
  const e = entryById(id);
  if (!session.admin || !e?.def) return;
  e.name = e.def.name;
  e.metaRecord = { ...e.def.meta, attrs: e.metaRecord.attrs };
  e.edited = false;
  const all = store.get(EDITS_KEY, {});
  if (all && typeof all === 'object') { delete all[id]; store.set(EDITS_KEY, all); }
}

export async function hideDataset(id) {
  const e = entryById(id);
  if (!session.admin || !e || e.kind !== 'dataset' || e.remote) return false;
  const ok = await confirmAction({
    title: `Eliminar «${e.name}» del catálogo`,
    text: 'Se quitará del catálogo, del mapa y del buscador en este navegador. Es un conjunto de prueba: el archivo de datos no se borra y puedes restaurarlo desde el catálogo.',
    ok: 'Eliminar del catálogo', danger: true
  });
  if (!ok) return false;
  hideEntry(e);
  persistHidden();
  showToast('info', 'Conjunto eliminado del catálogo', `«${e.name}». Puedes restaurarlo desde el catálogo.`);
  return true;
}

export function restoreDatasets() {
  if (!session.admin) return;
  const back = layers.entries.filter(e => e.hidden);
  back.forEach(e => { e.hidden = false; toggleLayer(e.id, !!e.def?.visible); });
  persistHidden();
  if (back.length) showToast('success', back.length === 1 ? 'Conjunto restaurado' : `${back.length} conjuntos restaurados`, back.map(e => e.name).join(', '));
}

/* Estudios de los conjuntos de prueba, con lo que haya editado un administrador en este navegador */
/* Los estudios publicados van primero; después, los conjuntos de prueba */
export const studyList = () => layers.entries.filter(e => e.kind === 'dataset' && !e.hidden).sort((a, b) => !!b.remote - !!a.remote).map(e => {
  const m = e.metaRecord;
  return {
    id: e.id, title: e.name, theme: (m.temas || 'Sin tema').split(' · ')[0], date: (m.pub || '').slice(0, 7), desc: m.resumen, edited: e.edited, published: !!e.remote,
    facts: e.remote ? [m.formato, e.count ? `${e.count.toLocaleString('es-MX')} entidades` : '', m.lic].filter(x => x && x !== '—') : [m.formato, m.res].filter(Boolean)
  };
});

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
      let gj;
      if (e.remote && !hasApi()) {
        const { reviewDemo } = await import('../lib/review-demo.js');
        gj = await reviewDemo.geometry(id.replace(/^pub:/, ''));
        if (!gj) throw new Error('No se encontró la geometría en el flujo de publicación.');
      } else {
        const r = await fetch(e.def.url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        gj = await r.json();
      }
      fillSource(id, e.olLayer, gj);
      e.geojson = markRaw(gj);
      e.count = gj.features.length;
      e.olLayer.setStyle(f => layerStyle(e, f.getProperties()));
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
export const loadVisibleDatasets = () => layers.entries.filter(e => e.kind === 'dataset' && e.visible && !e.hidden).forEach(e => loadDataset(e.id));

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

export async function saveLayerStyle(id, values) {
  const e = entryById(id);
  if (!e) return false;
  const config = cleanStyle(values);
  e.styleConfig = config;
  e.sym = config.mode === 'density'
    ? { t: 'ramp', ramp: DENSITY_RAMPS }
    : { ...(e.sym || {}), c: config.color, f: `${config.fillColor}55` };
  persistStyle(id, config);
  e.olLayer.setStyle(f => layerStyle(e, f.getProperties()));
  if (e.remote && hasApi()) {
    try {
      await api(`/capas/${encodeURIComponent(id.slice(4))}/estilo`, { method: 'PUT', json: { simbologia: config } });
    } catch (err) {
      showToast('error', 'Estilo guardado solo localmente', err.message);
      return false;
    }
  }
  showToast('success', 'Simbología actualizada', e.remote ? 'El estilo quedó guardado para la capa publicada.' : 'Se conservará en este navegador.');
  return true;
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
  if (typeof id === 'string' && id.startsWith('lote:')) {
    const shown = layers.entries.find(x => x.studyId === id.slice(5));
    if (!shown) { showToast('info', 'Esta capa aún no está en el mapa', 'Ábrela en Carga de datos y pulsa «Ver en el mapa».'); return; }
    id = shown.id;
  }
  router.push('/');
  const e = entryById(id);
  if (e && !e.visible) toggleLayer(id, true);
  selectLayer(id);
  if (!ui.mobile) setDock('right', true);
  nextTick(() => requestAnimationFrame(() => zoomToLayer(id)));
}

export function showLayerInfo(id) {
  if (!entryById(id)) return;
  if (!String(id).startsWith('lote:')) selectLayer(id);
  ui.metaId = id;
}

/* ---------------- capas de sesión (vista previa local, no publicada) ---------------- */
let sessionCounter = 0;
const PALETTE = ['#d4a64c', '#214c7e', '#b04a2f', '#2d6a4f', '#6b4fa0'];

export function addSessionLayer(name, geojson, metaRecord, studyId = null) {
  const id = `sesion-${++sessionCounter}`;
  const color = PALETTE[(sessionCounter - 1) % PALETTE.length];
  const types = new Set(geojson.features.map(f => f.geometry?.type));
  const t = [...types].some(g => /Polygon/.test(g)) ? 'poly' : [...types].some(g => /Line/.test(g)) ? 'line' : 'point';
  const styleConfig = cleanStyle({ color, fillColor: color, weight: 2, fillOpacity: 0.22 });
  const layer = createVectorLayer({ id, zIndex: SESSION_Z + sessionCounter, style: () => null });
  fillSource(id, layer, geojson);
  addLayer(layer);
  const ext = transformExtent(layer.getSource().getExtent(), 'EPSG:3857', 'EPSG:4326'); // [oeste, sur, este, norte]
  metaRecord.bbox = [ext[1], ext[3], ext[0], ext[2]];
  layers.entries.push({
    id, kind: 'session', group: 'sesion', name, visible: true, loading: false, error: null,
    sym: { t, c: color, f: `${color}38` }, metaRecord, studyId, geojson: markRaw(geojson), count: geojson.features.length, styleConfig, olLayer: markRaw(layer)
  });
  const e = layers.entries[layers.entries.length - 1];
  layer.setStyle(f => layerStyle(e, f.getProperties()));
  const k = layers.collapsed.indexOf('sesion');
  if (k >= 0) layers.collapsed.splice(k, 1);
  restackSession();
  return id;
}

/* Si se reemplaza el archivo de una capa que ya está en el mapa, se dibujan los datos nuevos */
export function refreshSessionData(studyId, geojson) {
  layers.entries.filter(e => e.studyId === studyId).forEach(e => {
    const src = e.olLayer.getSource();
    src.clear();
    featuresOf.delete(e.id);
    fillSource(e.id, e.olLayer, geojson);
    e.geojson = markRaw(geojson);
    e.count = geojson.features.length;
    if (src.getFeatures().length) {
      const ext = transformExtent(src.getExtent(), 'EPSG:3857', 'EPSG:4326');
      e.metaRecord = { ...e.metaRecord, bbox: [ext[1], ext[3], ext[0], ext[2]] };
    }
    if (layers.feature?.layer === e.id) layers.feature = null;
  });
}

export function removeSessionLayer(id, { silent = false } = {}) {
  const e = entryById(id);
  if (!e || e.kind !== 'session') return;
  removeLayer(e.olLayer);
  featuresOf.delete(id);
  layers.entries.splice(layers.entries.indexOf(e), 1);
  if (layers.selected === id) { layers.selected = null; layers.feature = null; }
  if (!silent) showToast('info', 'Capa de sesión quitada', e.name);
}

/* Si se edita el estudio de una capa que ya está en el mapa, su ficha se actualiza (la extensión sale de la geometría) */
onStudyChange(rec => {
  layers.entries.filter(e => e.studyId === rec.id).forEach(e => { e.metaRecord = { ...metaFromStudy(rec), bbox: e.metaRecord.bbox }; });
});

onStudyDeleted(id => layers.entries.filter(e => e.studyId === id).forEach(e => removeSessionLayer(e.id, { silent: true })));

/* ---------------- ficha: exportación y cita ---------------- */
const xml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function exportMeta(id) {
  const m = metaOf(id), e = entryById(id);
  if (!m || !e) return;
  const doc = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Ficha generada por DeltaMap-CEDESU. -->
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
  ${m.bbox ? `<extension sur="${m.bbox[0]}" norte="${m.bbox[1]}" oeste="${m.bbox[2]}" este="${m.bbox[3]}"/>` : '<extension calculada="no"/>'}
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
  const text = `${m.resp} (${String(m.pub).slice(0, 4)}). ${e.name} [${m.tipo}]. Escala ${m.escala}. ${CONTACTO_CEDESU.org}. DeltaMap-CEDESU. ID ${m.id}.`;
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

