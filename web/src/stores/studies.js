/* Estudios del lote: cada capa cargada tiene su propio estudio (metadatos al estilo ISO 19115).
   Se rellena solo con lo que declara el archivo; lo demás queda vacío para que lo complete una
   persona. Es un almacén pequeño y sin dependencias pesadas: el catálogo y el mapa lo leen sin
   cargar el código de la carga de archivos. Los estudios solo existen en esta sesión del navegador. */
import { reactive } from 'vue';
import { confirmAction, showToast } from './ui.js';
import { THEMES, LICENSES, ACCESS, STUDY_FIELDS, STUDY_REQ, FIELD_LABELS, originOf } from '../lib/study-fields.js';

export { THEMES, LICENSES, ACCESS, STUDY_FIELDS, STUDY_REQ, FIELD_LABELS };

/* Campos que se pueden copiar a las demás capas del lote (nunca sobrescriben lo que ya tienen) */
export const SHAREABLE = ['sResp', 'sLic', 'sAccess'];

/* studies.editing: capa cuyo estudio se está editando (abre el diálogo). */
export const studies = reactive({ list: [], editing: null, focus: null });

const listeners = new Set();
export const onStudyChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = rec => listeners.forEach(fn => fn(rec));

export const studyById = id => studies.list.find(s => s.id === id);
export const missingFields = rec => STUDY_REQ.filter(k => !String(rec?.[k] || '').trim());
export const studyComplete = rec => !!rec && !missingFields(rec).length;

const blank = () => Object.fromEntries(STUDY_FIELDS.map(k => [k, '']));

/* Un estudio por capa. El título arranca con el nombre del archivo y se marca como tal. */
export function addStudy(id, layerName) {
  const rec = reactive({
    id, metaId: `SESION-${Date.now().toString(36).toUpperCase()}-${id.toUpperCase()}`, layerName,
    ...blank(), sTitle: layerName,
    auto: { sTitle: 'nombre del archivo' },   // campo → de dónde salió el valor
    edited: [],                                // campos que una persona cambió: no se vuelven a sobrescribir
    origins: [],                               // archivos de metadatos leídos
    extras: [],                                // datos declarados que no tienen campo propio: [etiqueta, texto]
    scale: '', facts: {}, listed: false
  });
  studies.list.push(rec);
  return rec;
}

export function removeStudy(id) {
  const i = studies.list.findIndex(s => s.id === id);
  if (i >= 0) studies.list.splice(i, 1);
  if (studies.editing === id) studies.editing = null;
}
export function clearStudies() { studies.list.splice(0); studies.editing = null; studies.focus = null; }

/* Si el título sigue siendo el nombre del archivo, acompaña los cambios de nombre de la capa */
export function renameStudyLayer(id, name) {
  const rec = studyById(id);
  if (!rec || rec.layerName === name) return;
  rec.layerName = name;
  if (rec.auto.sTitle === 'nombre del archivo' && !rec.edited.includes('sTitle')) { rec.sTitle = name; emit(rec); }
}

/* Antes de releer los archivos de una capa se olvida lo que se rellenó solo (salvo lo copiado de otra capa
   y lo que editó una persona): así, si se quita o reemplaza el .xml, no quedan datos de un archivo que ya no está. */
export function resetAuto(rec) {
  if (!rec) return;
  for (const [k, from] of Object.entries(rec.auto)) {
    if (rec.edited.includes(k) || from.startsWith('copiado')) continue;
    rec[k] = k === 'sTitle' ? rec.layerName : '';
    if (k === 'sTitle') rec.auto.sTitle = 'nombre del archivo'; else delete rec.auto[k];
  }
  rec.origins.splice(0);
  rec.extras.splice(0);
  rec.scale = '';
  emit(rec);
}

/* Aplica lo leído de un archivo: solo campos que una persona no haya tocado.
   info = { source, fields: {sX: texto}, suggested: [campos inferidos], keywords, extras, scale } */
export function applyInfo(rec, info) {
  if (!rec || !info) return [];
  const filled = [];
  for (const k of STUDY_FIELDS) {
    const v = String(info.fields?.[k] || '').trim();
    if (!v || rec.edited.includes(k)) continue;
    rec[k] = v;
    rec.auto[k] = info.suggested?.includes(k) ? 'sugerido por palabras clave' : `metadatos de ${info.source}`;
    filled.push(k);
  }
  if (info.scale) rec.scale = info.scale;
  if (info.source && !rec.origins.includes(info.source)) rec.origins.push(info.source);
  for (const [label, text] of info.extras || []) {
    const row = rec.extras.find(x => x[0] === label);
    if (row) row[1] = text; else rec.extras.push([label, text]);
  }
  if (filled.length) emit(rec);
  return filled;
}

/* Guarda lo que editó la persona. shareWith: copia los campos comunes a las capas que aún no los tienen. */
export function saveStudy(id, values, { shareWith = false } = {}) {
  const rec = studyById(id);
  if (!rec) return;
  for (const k of STUDY_FIELDS) {
    const v = String(values[k] ?? '').trim();
    if (v === String(rec[k] || '').trim()) continue;
    rec[k] = v;
    if (!rec.edited.includes(k)) rec.edited.push(k);
    delete rec.auto[k];
  }
  if (shareWith) {
    for (const other of studies.list) {
      if (other.id === id) continue;
      let touched = false;
      for (const k of SHAREABLE) {
        if (rec[k] && !String(other[k] || '').trim()) { other[k] = rec[k]; other.auto[k] = 'copiado de otra capa del lote'; touched = true; }
      }
      if (touched) emit(other);
    }
  }
  emit(rec);
}

/* Lo que se envía al servidor: solo los campos del estudio, como texto */
export const studyPayload = rec => Object.fromEntries(STUDY_FIELDS.map(k => [k, String(rec[k] || '').trim()]));

/* Ficha en el mismo formato que usan los datos de prueba (MetaDialog, panel de propiedades, exportación) */
export function metaFromStudy(rec) {
  const f = rec.facts || {};
  const published = !!rec.sDate;
  return {
    id: rec.metaId, cat: 'Capa del lote', estatus: 'No publicada', tipo: f.tipo || '—', temas: rec.sTheme || '—',
    resumen: rec.sDesc || 'Sin descripción: el archivo no la declara y todavía no se ha escrito una.',
    pub: published ? rec.sDate : '', act: published ? rec.sDate : '', escala: rec.scale || '—', res: '—', crs: f.crs || '—',
    bbox: f.bbox || null, formato: f.formato || '—', tam: f.tam || '—', lic: rec.sLic || '—',
    palabras: String(rec.sKeywords || '').split(',').map(s => s.trim()).filter(Boolean),
    resp: rec.sResp || '—', fuente: rec.sSource || rec.sResp || '—', linaje: rec.sLineage || '—',
    access: `${rec.sAccess || 'Sin clasificar'} · solo esta sesión`, attrs: f.attrs || [],
    req: { total: STUDY_REQ.length, faltan: missingFields(rec) },
    origenes: Object.fromEntries(Object.entries(rec.auto || {}).filter(([k]) => !(rec.edited || []).includes(k)).map(([k, v]) => [k, originOf(v)]))
  };
}

/* Identificador con el que el catálogo y la ficha se refieren a un estudio que aún no es capa del mapa */
export const loteId = id => `lote:${id}`;
export function studyEntry(entryId) {
  if (typeof entryId !== 'string' || !entryId.startsWith('lote:')) return undefined;
  const rec = studyById(entryId.slice(5));
  return rec ? { id: entryId, kind: 'lote', name: rec.sTitle || rec.layerName, metaRecord: metaFromStudy(rec), geojson: null, count: rec.facts?.n || 0 } : undefined;
}

/* Un estudio y su capa son una sola cosa: eliminar el estudio quita la capa del lote, del catálogo y del mapa */
const deleteListeners = new Set();
export const onStudyDeleted = fn => { deleteListeners.add(fn); return () => deleteListeners.delete(fn); };

export async function deleteStudy(id) {
  const rec = studyById(id);
  if (!rec) return false;
  if (rec.busy) { showToast('info', 'La capa se está enviando', 'Espera a que termine el envío para eliminar su estudio.'); return false; }
  const title = rec.sTitle || rec.layerName;
  const ok = await confirmAction({
    title: `Eliminar el estudio «${title}»`,
    text: `Se quitará la capa «${rec.layerName}» del lote y del catálogo, y también del mapa si la agregaste. Los archivos de tu equipo no se modifican. No se puede deshacer.`,
    ok: 'Eliminar estudio', danger: true
  });
  if (!ok || !studyById(id)) return false;
  removeStudy(id);
  deleteListeners.forEach(fn => fn(id));
  showToast('info', 'Estudio eliminado', `«${title}» ya no está en el lote ni en el catálogo.`);
  return true;
}

export function openStudyEditor(id) {
  if (String(id || '').startsWith('dataset:') || studyById(id)) studies.editing = id;
}
export function closeStudyEditor() { studies.editing = null; }
