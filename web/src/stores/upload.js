/* Carga de datos por lotes.
   La lectura y validación reales corren en un Web Worker (lib/ingest.worker.js)
   para no congelar la página; aquí quedan el estado del lote, KML/GPX
   (DOMParser) y Excel (SheetJS, cargado bajo demanda). GeoPackage y GeoTIFF se
   validan en el servidor. Cada capa tiene su propio estudio (stores/studies.js), que se rellena con
   los metadatos que traiga el archivo. Nada se publica sin confirmación del servidor. */
import { reactive, markRaw, nextTick, watch } from 'vue';
import { FileCheck as FC } from '../lib/filecheck.js';
import { IngestCore } from '../lib/ingest-core.js';
import { xmlFeatures } from '../lib/xmlgeo.js';
import { parseMetadataXML, fromKml, fromGpx, fromGeoJSON, fromOffice, themeFromLayer } from '../lib/studyinfo.js';
import { fmtSize } from '../lib/format.js';
import { api, apiUrl, hasApi, sameOrigin, csrfToken } from '../lib/api.js';
import { showToast, startTask, confirmAction, ui } from './ui.js';
import { onSessionEnd } from './session.js';
import { layers, addSessionLayer, selectLayer, zoomToLayer, refreshSessionData } from './layers.js';
import {
  studies, studyById, addStudy, removeStudy, clearStudies, applyInfo, renameStudyLayer, studyComplete, missingFields, studyPayload,
  metaFromStudy, openStudyEditor, onStudyDeleted, resetAuto, FIELD_LABELS
} from './studies.js';
import { router } from '../router.js';
import { reviewDemo } from '../lib/review-demo.js';

const SHP_PARTS = ['shp', 'shx', 'dbf', 'prj', 'cpg', 'qpj', 'sbn', 'sbx', 'xml'];

export const FORMATS = {
  shp: { label: 'Shapefile', icon: 'layers' },
  zip: { label: 'ZIP', icon: 'file' },
  kmz: { label: 'KMZ', icon: 'globe' },
  geojson: { label: 'GeoJSON', icon: 'globe' },
  kml: { label: 'KML', icon: 'globe' },
  gpx: { label: 'GPX', icon: 'map-pin' },
  csv: { label: 'CSV', icon: 'file-spreadsheet' },
  xlsx: { label: 'Excel', icon: 'file-spreadsheet' },
  xls: { label: 'Excel 97-2003', icon: 'file-spreadsheet' },
  gpkg: { label: 'GeoPackage', icon: 'database', server: true },
  geotiff: { label: 'GeoTIFF', icon: 'mountain', server: true }
};
const EXT = { json: 'geojson', geojson: 'geojson', kml: 'kml', kmz: 'kmz', gpx: 'gpx', csv: 'csv', xlsx: 'xlsx', xls: 'xls', zip: 'zip', gpkg: 'gpkg', tif: 'geotiff', tiff: 'geotiff' };

export const STATES = {
  reading: ['Leyendo', 'badge-info'],
  checking: ['Validando', 'badge-info'],
  input: ['Requiere datos', 'badge-warn'],
  ready: ['Lista', 'badge-ok'],
  blocked: ['Con errores', 'badge-err'],
  server: ['Validación en servidor', 'badge-warn'],
  sending: ['Enviando', 'badge-info'],
  sent: ['Recibida', 'badge-ok'],
  failed: ['No enviada', 'badge-err']
};
export const BUSY = ['reading', 'checking', 'sending'];

export const batch = reactive({ items: [], selected: null, dragging: false });


let seq = 0;
let jobSeq = 0;
const byId = id => batch.items.find(x => x.id === id);
export const itemById = byId;

/* Mensajes de un archivo: lista de segmentos [tipo, texto] con tipo 't' (texto), 'b' (negrita) o 'code' */
const msg = (icon, ...parts) => ({ icon, parts });

/* ---------------- Web Worker de lectura ----------------
   Un solo worker atiende el lote. Si el navegador no lo admite o falla al
   iniciar, el mismo núcleo (IngestCore) corre en la página. */
const pool = { worker: null, failed: false, pending: new Map() };

function getWorker() {
  if (pool.failed || typeof Worker === 'undefined') return null;
  if (pool.worker) return pool.worker;
  try {
    const w = new Worker(new URL('../lib/ingest.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
      const job = data && pool.pending.get(data.id);
      if (!job) return;
      if (data.type === 'progress') job.onProgress(data.value);
      else if (data.type === 'stage') job.onStage(data.state);
      else if (data.type === 'result') { pool.pending.delete(data.id); job.resolve(data.result); }
    };
    w.onerror = e => {
      e.preventDefault?.();
      console.warn('El worker de carga falló; se procesa en la página.', e.message);
      pool.failed = true; pool.worker = null; w.terminate();
      const waiting = [...pool.pending.values()];
      pool.pending.clear();
      waiting.forEach(job => job.runLocal());
    };
    pool.worker = w;
    return w;
  } catch (err) {
    console.warn('No se pudo crear el worker de carga; se procesa en la página.', err);
    pool.failed = true;
    return null;
  }
}

function runJob(job, { onProgress = () => {}, onStage = () => {} } = {}) {
  return new Promise(resolve => {
    const runLocal = () => IngestCore.run(job, m => (m.type === 'progress' ? onProgress(m.value) : m.type === 'stage' && onStage(m.state))).then(resolve);
    const w = getWorker();
    if (!w) { runLocal(); return; }
    pool.pending.set(job.id, { resolve, onProgress, onStage, runLocal });
    w.postMessage({ type: 'run', job });
  });
}
function cancelJob(id) {
  if (!id) return;
  pool.pending.delete(id);
  if (pool.worker) pool.worker.postMessage({ type: 'cancel', id }); else IngestCore.cancel(id);
}
function dropRaw(id) {
  if (!id) return;
  if (pool.worker) pool.worker.postMessage({ type: 'drop', id }); else IngestCore.drop(id);
}

/* ---------------- agrupación de archivos en capas ---------------- */
const baseName = name => name.replace(/^.*[\\/]/, '').replace(/\.shp\.xml$/i, '').replace(/\.[^.]+$/, '');
const extOf = name => /\.shp\.xml$/i.test(name) ? 'xml' : (name.split('.').pop() || '').toLowerCase();
export const sizeOf = it => [...Object.values(it.parts), ...Object.values(it.extra || {}), it.sidecar].reduce((sum, f) => sum + (f?.size || 0), 0);

function newItem(o) {
  const it = { id: `c${++seq}`, state: 'reading', progress: 0, checks: [], geojson: null, table: null, crs: null, srcCrs: null, issues: [], missing: [], message: null, layerName: o.name.replace(/[_-]+/g, ' ').trim(), srcFormat: o.format, ...o };
  batch.items.push(it);
  addStudy(it.id, it.layerName);
  return it.id;
}

export function addFiles(fileList) {
  let files = [...fileList];
  if (!files.length) return;
  const room = FC.LIMITS.maxItems - batch.items.length;
  if (room <= 0) { showToast('error', 'El lote está lleno', `Máximo ${FC.LIMITS.maxItems} capas por lote. Envía o vacía el lote antes de agregar más.`); return; }
  const used = batch.items.reduce((s, it) => s + sizeOf(it), 0);
  let budget = FC.LIMITS.maxBatchBytes - used;
  const accepted = [];
  for (const f of files) { if (f.size <= budget) { accepted.push(f); budget -= f.size; } }
  if (accepted.length < files.length) showToast('warn', 'Algunos archivos no se agregaron', `El lote admite hasta ${(FC.LIMITS.maxBatchBytes / 1048576).toFixed(0)} MB en total.`);
  if (accepted.length > room * 8) showToast('warn', 'Algunos archivos no se agregaron', `Caben ${room} ${room === 1 ? 'capa más' : 'capas más'} en el lote; se tomaron los primeros ${room * 8} archivos.`);
  files = accepted.slice(0, room * 8);
  if (!files.length) return;
  const groups = new Map();
  const singles = [];
  const shpBases = new Set([...files.filter(f => extOf(f.name) === 'shp').map(f => baseName(f.name).toLowerCase()), ...batch.items.filter(i => i.format === 'shp').map(i => i.key), ...batch.items.filter(i => i.zipStem).map(i => i.zipStem)]);
  files.forEach(f => {
    const ext = extOf(f.name);
    if (SHP_PARTS.includes(ext) && (ext !== 'xml' || /\.shp\.xml$/i.test(f.name) || shpBases.has(baseName(f.name).toLowerCase()))) {
      const key = baseName(f.name).toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    } else singles.push(f);
  });
  const touched = [];
  const replaced = [];
  const open = it => !['sending', 'sent'].includes(it.state);
  groups.forEach((list, key) => {
    const existing = batch.items.find(it => it.format === 'shp' && it.srcFormat === 'shp' && it.key === key && open(it));
    const zipped = !existing && !list.some(f => extOf(f.name) === 'shp') && batch.items.find(it => it.zipStem === key && open(it));
    if (existing) {
      list.forEach(f => { const ext = extOf(f.name); if (existing.parts[ext]) replaced.push(f.name); existing.parts[ext] = f; });
      touched.push(existing.id);
    } else if (zipped) {
      /* Faltaba un componente de una capa que vino en un ZIP: se añade solo ese archivo */
      list.forEach(f => attachFile(zipped, extOf(f.name), f));
      touched.push(zipped.id);
    } else {
      const parts = {};
      list.forEach(f => { parts[extOf(f.name)] = f; });
      touched.push(newItem({ format: 'shp', key, name: baseName(list[0].name), parts }));
    }
  });
  singles.filter(f => extOf(f.name) !== 'xml').forEach(f => {
    const ext = extOf(f.name);
    const same = EXT[ext] && batch.items.find(it => it.srcFormat === EXT[ext] && it.key === f.name.toLowerCase() && open(it));
    if (same) {
      /* Ya estaba en el lote: se reemplaza el archivo y se vuelve a leer; el estudio y lo editado se conservan */
      same.parts = { main: f };
      same.extra = undefined;
      replaced.push(f.name);
      if (!touched.includes(same.id)) touched.push(same.id);
      return;
    }
    touched.push(newItem({ format: EXT[ext] || null, key: f.name.toLowerCase(), name: baseName(f.name), parts: { main: f } }));
  });
  /* Un .xml suelto con el mismo nombre que una capa (GeoJSON, KML, CSV…) son sus metadatos: se unen a ella */
  singles.filter(f => extOf(f.name) === 'xml').forEach(f => {
    const base = baseName(f.name).toLowerCase();
    const target = batch.items.find(it => it.srcFormat !== 'shp' && open(it) && String(it.name || '').toLowerCase() === base);
    if (!target) { touched.push(newItem({ format: null, key: f.name.toLowerCase(), name: baseName(f.name), parts: { main: f } })); return; }
    attachFile(target, 'xml', f);
    if (!touched.includes(target.id)) applySidecarNow(target);   // la capa ya estaba leída: solo se leen los metadatos
  });
  if (replaced.length) {
    showToast('info', replaced.length === 1 ? 'Se reemplazó un archivo' : `Se reemplazaron ${replaced.length} archivos`,
      `${replaced.slice(0, 4).join(', ')}${replaced.length > 4 ? '…' : ''} ya estaba${replaced.length === 1 ? '' : 'n'} en el lote: se usa la versión nueva y se conserva lo que editaste del estudio.`);
  }
  if (!batch.selected && touched[0]) batch.selected = touched[0];
  touched.forEach(processItem);
}

/* ---------------- archivos de cada capa ---------------- */
const ROLE = {
  shp: 'Geometría', shx: 'Índice de geometrías', dbf: 'Tabla de atributos', prj: 'Sistema de referencia', cpg: 'Codificación de texto',
  qpj: 'Sistema de referencia (QGIS)', sbn: 'Índice espacial', sbx: 'Índice espacial', xml: 'Metadatos del estudio'
};
/* Lista de los archivos de una capa, con el papel de cada uno. slot identifica de dónde quitarlo. */
export function fileList(it) {
  if (!it) return [];
  const out = Object.entries(it.parts).filter(([, f]) => f).map(([k, f]) => ({
    slot: k, name: f.name, size: f.size,
    role: k === 'main' ? `Archivo ${FORMATS[it.srcFormat]?.label || 'principal'}${it.srcFormat === 'zip' ? ' (contiene la capa)' : ''}` : ROLE[k] || `.${k}`
  }));
  Object.entries(it.extra || {}).forEach(([k, f]) => f && out.push({ slot: `extra:${k}`, name: f.name, size: f.size, role: `${ROLE[k] || `.${k}`} · añadido aparte del ZIP` }));
  if (it.sidecar) out.push({ slot: 'sidecar', name: it.sidecar.name, size: it.sidecar.size, role: ROLE.xml });
  return out;
}

/* Quita un archivo de la capa y la vuelve a leer con los que quedan. Si es el archivo principal o el último,
   se quita la capa entera (con confirmación). Los archivos del equipo no se tocan. */
export async function removeFile(id, slot) {
  const it = byId(id);
  if (!it || BUSY.includes(it.state) || it.state === 'sending') return;
  const files = fileList(it);
  const file = files.find(f => f.slot === slot);
  if (!file) return;
  if (slot === 'main' || files.length === 1) {
    const ok = await confirmAction({
      title: `Quitar la capa «${it.layerName}»`,
      text: `«${file.name}» es ${slot === 'main' ? 'el archivo principal' : 'el último archivo'} de la capa: al quitarlo se quitan del lote la capa y su estudio. Los archivos de tu equipo no se modifican.`,
      ok: 'Quitar capa', danger: true
    });
    if (ok) removeItem(id);
    return;
  }
  if (slot.startsWith('extra:')) { const { [slot.slice(6)]: _, ...rest } = it.extra; it.extra = Object.keys(rest).length ? rest : undefined; }
  else if (slot === 'sidecar') it.sidecar = null;
  else delete it.parts[slot];
  showToast('info', `Se quitó «${file.name}»`, `Se volvió a leer «${it.layerName}» con los archivos que quedan.`);
  processItem(id);
}

/* ---------------- procesamiento ---------------- */
const RESULT_FIELDS = ['checks', 'issues', 'state', 'geojson', 'table', 'mapping', 'crs', 'srcCrs', 'hash', 'zipped', 'format', 'layerName', 'needsCrs', 'missing'];

/* Los datos geográficos son grandes: no se vuelven reactivos (solo se reasigna la referencia) */
function rawify(it) {
  if (it.geojson) it.geojson = markRaw(it.geojson);
  if (it.table) it.table = markRaw(it.table);
}

async function processItem(id) {
  let it = byId(id);
  if (!it) return;
  cancelJob(it.job);
  dropRaw(it.rawJob);
  const keepName = it.processed ? it.layerName : null;   // un nombre que la persona ya escribió no se pisa al releer la capa
  Object.assign(it, { state: 'reading', progress: 0, checks: [], issues: [], geojson: null, table: null, mapping: null, message: null, needsCrs: false, hash: null, rawJob: null, missing: [], declaredCrs: null });
  const rec0 = studyById(id);
  if (rec0) { rec0.facts = {}; resetAuto(rec0); }
  const nameChecks = Object.values(it.parts).filter(Boolean).flatMap(f => FC.checkName(f.name).map(c => [c[0], `${c[1]}: ${f.name}`, c[2]]));
  if (nameChecks.some(c => c[0] === 'err')) { it.checks.push(...nameChecks); it.state = 'blocked'; return finishItem(it); }
  if (!it.format) {
    it.checks.push(['err', 'Formato no admitido', `.${extOf(it.parts.main.name)} no está entre los formatos acordados para la carga.`]);
    it.state = 'blocked';
    return finishItem(it);
  }
  const jobId = `${it.id}:${++jobSeq}`;
  it.job = jobId;
  const done = startTask(`Leyendo ${it.layerName}`);
  const srcFormat = it.srcFormat || it.format;   // el formato con que llegó (un ZIP sigue siendo ZIP aunque dentro haya un Shapefile)
  const parts = Object.fromEntries(Object.entries(it.parts).filter(([k, f]) => f && (srcFormat !== 'shp' || ['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(k))));
  const result = await runJob({ id: jobId, kind: 'file', format: srcFormat, parts, extra: it.extra ? { ...it.extra } : undefined, hasApi: hasApi() }, {
    onProgress: v => { if (it.job === jobId) it.progress = v; },
    onStage: st => { if (it.job === jobId) it.state = st; }
  });
  done();
  it = byId(id);
  if (!result || !it || it.job !== jobId) return; // cancelado, reemplazado o quitado
  applyResult(it, result);
  if (keepName) it.layerName = keepName;
  it.processed = true;
  if (result.stem !== undefined) it.zipStem = result.stem;
  if (result.needsCrs) it.rawJob = jobId;
  try {
    if (result.next?.kind === 'xml') processXML(it, result.next.text, result.next.xmlKind);
    else if (result.next?.kind === 'xlsx') await processXlsx(it, result.next.buffer);
  } catch (err) {
    it.checks.push(['err', 'No se pudo interpretar el archivo', err.message]);
    it.state = 'blocked';
  }
  await harvestStudy(it, result);
  finishItem(it);
  if (it.geojson && it.state === 'ready') refreshSessionData(it.id, it.geojson);   // si ya estaba en el mapa, se actualiza
}

/* ---------------- estudio de cada capa: lo que declara el archivo ---------------- */
function noteInfo(it, info) {
  const rec = studyById(it.id);
  if (!rec || !info) return;
  const filled = applyInfo(rec, info);
  it.checks.push(filled.length
    ? ['ok', `Datos del estudio leídos de ${info.source}`, `${filled.map(k => FIELD_LABELS[k]).join(', ')}. Revísalos y completa lo que falte.`]
    : ['info', `${info.source} no declara datos nuevos para el estudio`]);
}

function infoFromXmlText(it, text, name) {
  const res = parseMetadataXML(text, name);
  if (res.error) { it.checks.push(['warn', `Metadatos de «${name}» no leídos`, res.error]); return null; }
  return res.info;
}

/* Archivo de metadatos que acompaña a la capa (.shp.xml, .xml): se lee en la página, nunca se envía a interpretar al servidor */
async function readSidecar(it) {
  const file = it.parts.xml || it.sidecar;
  if (!file) return null;
  if (file.size > 2 * 1024 * 1024) { it.checks.push(['warn', `Metadatos de «${file.name}» no leídos`, 'El archivo supera los 2 MB.']); return null; }
  return infoFromXmlText(it, await file.text(), file.name);
}

async function applySidecarNow(it) {
  const info = await readSidecar(it);
  if (info) { noteInfo(it, info); showToast('success', 'Metadatos añadidos', `Se aplicaron al estudio de «${it.layerName}».`); }
}

async function harvestStudy(it, result) {
  const found = [];
  if (result?.top) found.push(fromGeoJSON(result.top, it.layerName, it.parts.main?.name));
  if (result?.sidecar) found.push(infoFromXmlText(it, result.sidecar.text, result.sidecar.name));
  found.push(await readSidecar(it));
  found.filter(Boolean).forEach(info => noteInfo(it, info));
  inferTheme(it);
  autoGenerateStudy(it);
}

/* Generación automática de la ficha de estudio institucional (perfil ISO 19115) */
function autoGenerateStudy(it) {
  const rec = studyById(it.id);
  if (!rec) return;
  const now = new Date().toISOString().slice(0, 10);

  if (!rec.sTitle || rec.auto.sTitle === 'nombre del archivo') {
    const cleanName = it.layerName.replace(/[_-]+/g, ' ').trim();
    rec.sTitle = cleanName ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1) : 'Estudio cartográfico';
  }

  if (!rec.sTheme) {
    const fields = it.geojson ? [...new Set(it.geojson.features.slice(0, 200).flatMap(f => Object.keys(f.properties || {})))] : (it.table?.headers || []);
    rec.sTheme = themeFromLayer(it.layerName, fields) || 'División territorial';
    rec.auto.sTheme = 'asignado automáticamente';
  }

  if (!rec.sDate) {
    rec.sDate = now;
    rec.auto.sDate = 'fecha de carga';
  }

  if (!rec.sResp) {
    rec.sResp = 'CEDESU · Universidad Autónoma de Campeche';
    rec.auto.sResp = 'institución responsable';
  }

  if (!rec.sSource) {
    rec.sSource = 'Centro de Estudios de Desarrollo Sustentable y Aprovechamiento de la Vida Silvestre (CEDESU)';
    rec.auto.sSource = 'fuente institucional';
  }

  if (!rec.sLic) {
    rec.sLic = 'Uso restringido (solo CEDESU)';
    rec.auto.sLic = 'licencia predeterminada';
  }

  if (!rec.sAccess) {
    rec.sAccess = 'Pública';
    rec.auto.sAccess = 'acceso predeterminado';
  }

  if (!rec.sDesc) {
    const n = it.geojson?.features?.length;
    const countText = n ? ` con ${n.toLocaleString('es-MX')} entidades espaciales` : '';
    const crsText = it.crs ? ` en sistema de referencia ${it.crs}` : '';
    rec.sDesc = `Capa cartográfica de ${rec.sTitle}${countText}${crsText}. Integrada y procesada en DeltaMap-CEDESU para consulta e investigación territorial.`;
    rec.auto.sDesc = 'generada automáticamente';
  }

  if (!rec.sLineage) {
    rec.sLineage = 'Validación de estructura vectorial, reproyección y normalización cartográfica generada por la plataforma DeltaMap-CEDESU.';
    rec.auto.sLineage = 'generado automáticamente';
  }

  if (!rec.sKeywords) {
    rec.sKeywords = [rec.sTitle, rec.sTheme, 'Campeche', 'CEDESU'].filter(Boolean).join(', ');
    rec.auto.sKeywords = 'generadas automáticamente';
  }

  rec.listed = true;
  it.checks.push(['ok', 'Ficha de estudio generada automáticamente', 'La ficha técnica (ISO 19115) se completó con metadatos del archivo e información institucional.']);
}

/* Sin metadatos que lo digan, el tema se deduce del nombre de la capa y de sus campos (queda como sugerido) */
function inferTheme(it) {
  const rec = studyById(it.id);
  if (!rec || String(rec.sTheme || '').trim() || rec.edited.includes('sTheme')) return;
  const fields = it.geojson ? [...new Set(it.geojson.features.slice(0, 200).flatMap(f => Object.keys(f.properties || {})))] : (it.table?.headers || []);
  const theme = themeFromLayer(it.layerName, fields);
  if (!theme) return;
  rec.sTheme = theme;
  rec.auto.sTheme = 'sugerido por el nombre y los campos de la capa';
  it.checks.push(['info', `Tema detectado: ${theme}`, 'Se dedujo del nombre y los campos de la capa. Revísalo en el estudio.']);
}

function applyResult(it, r) {
  RESULT_FIELDS.forEach(k => { if (r[k] !== undefined) it[k] = r[k]; });
  it.checks = it.checks || [];
  it.issues = it.issues || [];
  /* Duplicados: misma huella SHA-256 que otra capa del lote */
  const dup = it.hash && batch.items.find(o => o !== it && o.hash === it.hash);
  if (dup) {
    it.checks.push(['err', 'Archivo duplicado en el lote', `Es idéntico a «${dup.layerName}» (misma huella SHA-256).`]);
    it.state = 'blocked';
    it.geojson = null;
  }
  rawify(it);
}

function processXML(it, text, kind) {
  const res = FC.checkXML(text, kind);
  if (Array.isArray(res)) { it.checks.push(...res); it.state = 'blocked'; return; }
  it.checks.push(...res.checks);
  const feats = xmlFeatures(res.doc, kind);
  if (!feats.length) { it.checks.push(['err', 'Sin entidades geográficas', 'No se encontraron Placemark, wpt, trk ni rte.']); it.state = 'blocked'; return; }
  it.checks.push(['ok', `${feats.length.toLocaleString('es-MX')} entidades geográficas`]);
  const own = kind === 'kml' ? fromKml(res.doc, it.parts.main?.name) : fromGpx(res.doc, it.parts.main?.name);
  if (own) noteInfo(it, own);
  it.geojson = { type: 'FeatureCollection', features: feats };
  it.crs = 'EPSG:4326 (WGS 84)';
  IngestCore.checkCoords(it, true);
  rawify(it);
}

async function processXlsx(it, buffer) {
  let XLSX;
  try { const mod = await import('xlsx'); XLSX = mod.default?.read ? mod.default : mod; }
  catch { it.checks.push(['err', 'Lector de Excel no disponible', 'No se pudo cargar el lector de Excel.']); it.state = 'blocked'; return; }
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, cellFormula: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
  it.checks.push(['ok', 'Fórmulas no ejecutadas', 'Se leen solo los valores almacenados.']);
  const own = fromOffice(wb.Props, it.parts.main?.name);
  if (own) noteInfo(it, own);
  IngestCore.prepareTable(it, rows, wb.SheetNames.length > 1 ? `Se usa la hoja «${wb.SheetNames[0]}» de ${wb.SheetNames.length}.` : '');
  rawify(it);
}

function finishItem(it) {
  if (it.state === 'reading' || it.state === 'checking') it.state = 'blocked';
}

/* ---------------- acciones sobre el lote ---------------- */
export function selectItem(id) { batch.selected = id; }

export function clearItems() {
  batch.items.forEach(it => { cancelJob(it.job); dropRaw(it.rawJob); });
  batch.items.splice(0);
  batch.selected = null;
  clearStudies();
}

export function removeItem(id) {
  const i = batch.items.findIndex(x => x.id === id);
  if (i < 0 || batch.items[i].state === 'sending') return;
  cancelJob(batch.items[i].job);
  dropRaw(batch.items[i].rawJob);
  removeStudy(batch.items[i].id);
  batch.items.splice(i, 1);
  batch.selected = batch.items[Math.min(i, batch.items.length - 1)]?.id || null;
}

export async function clearWithConfirm() {
  if (batch.items.some(it => it.state === 'sending')) return;
  const n = batch.items.length;
  if (!(await confirmAction({ title: 'Vaciar el lote', text: `Se quitarán ${n} ${n === 1 ? 'capa' : 'capas'} de esta carga. Los archivos de tu equipo no se modifican.`, ok: 'Vaciar' }))) return;
  clearItems();
}

/* Une un archivo a una capa que vino en un ZIP: los metadatos van aparte y los componentes del Shapefile se leen junto al ZIP */
function attachFile(it, ext, file) {
  if (ext === 'xml') it.sidecar = file;
  else it.extra = { ...(it.extra || {}), [ext]: file };
}

/* Añade a una capa solo el archivo que le falta (un componente del Shapefile, el .prj o los metadatos .xml).
   Las demás capas y los demás archivos de esta capa no se tocan. */
export async function addMissingFile(id, ext, file) {
  const it = byId(id);
  if (!it || !file || BUSY.includes(it.state) || it.state === 'sending') return;
  if (extOf(file.name) !== ext) {
    showToast('error', `Ese archivo no es un .${ext}`, `A «${it.layerName}» le falta el .${ext}; elegiste «${file.name}».`);
    return;
  }
  const used = batch.items.reduce((sum, x) => sum + sizeOf(x), 0);
  if (used + file.size > FC.LIMITS.maxBatchBytes) {
    showToast('error', 'El lote no admite más datos', `El lote admite hasta ${(FC.LIMITS.maxBatchBytes / 1048576).toFixed(0)} MB en total.`);
    return;
  }
  const zipped = it.srcFormat !== 'shp' && it.srcFormat !== undefined && it.zipStem !== undefined;
  if (ext === 'xml') {
    if (it.srcFormat === 'shp') it.parts.xml = file; else it.sidecar = file;
    const info = await readSidecar(it);
    if (info) { noteInfo(it, info); showToast('success', 'Metadatos añadidos', `Se leyeron de «${file.name}» y se aplicaron al estudio de «${it.layerName}».`); }
    return;
  }
  if (zipped) attachFile(it, ext, file); else it.parts[ext] = file;
  showToast('success', `Se añadió el .${ext}`, `Solo se volvió a leer «${it.layerName}»; las demás capas no cambian.`);
  processItem(id);
}

/* Sistema de referencia declarado para un Shapefile sin .prj */
export function declareCrs(id, v) {
  const it = byId(id);
  if (!it?.rawJob) return;
  const crs = v === 'geo' ? { kind: 'geo', datum: 'WGS84', label: 'Geográficas · WGS84 (declarado)' } : { kind: 'utm', zone: +v, datum: 'WGS84', label: `UTM ${v}N · WGS84 (declarado)` };
  it.declaredCrs = v === 'geo' ? 'geo' : String(+v);
  const rawJob = it.rawJob;
  const base = it.checks.filter(c => c[1] !== 'Falta el archivo .prj');
  it.state = 'checking'; it.needsCrs = false; it.rawJob = null;
  runJob({ id: rawJob, kind: 'reproject', crs }).then(r => {
    const cur = byId(id);
    if (!cur) return;
    applyResult(cur, { ...r, checks: [...base, ...r.checks], hash: cur.hash });
    finishItem(cur);
  });
}

/* Columnas de coordenadas de una tabla (CSV o Excel) */
export function updateMapping(id) {
  const it = byId(id);
  if (!it?.mapping) return;
  it.mapping.confirmed = false;
  IngestCore.tableToGeo(it);
  rawify(it);
}
export function confirmMapping(id) {
  const it = byId(id);
  if (!it?.mapping) return;
  it.mapping.confirmed = true;
  IngestCore.tableToGeo(it);
  rawify(it);
  autoGenerateStudy(it);
}

/* «Ver en el mapa»: capa de sesión, visible solo en este navegador. Su ficha sale del estudio de la capa. */
export function viewOnMap(id) {
  const it = byId(id);
  const rec = studyById(id);
  if (!it?.geojson || !rec) return;
  const shown = layers.entries.find(e => e.studyId === id);
  let layerId = shown?.id;
  if (!shown) {
    layerId = addSessionLayer(it.layerName, it.geojson, metaFromStudy(rec), id);
    showToast('success', 'Capa de sesión agregada', 'Visible solo en este navegador. No se ha publicado.');
  }
  router.push('/');
  selectLayer(layerId);
  nextTick(() => requestAnimationFrame(() => zoomToLayer(layerId)));
}

/* ---------------- estudio de cada capa ---------------- */
export function editStudy(id) {
  selectItem(id);
  openStudyEditor(id);
}

function geoBBox(gj) {
  let w = 180, e = -180, so = 90, n = -90, any = false;
  const walk = c => {
    if (typeof c[0] === 'number') { any = true; if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < so) so = c[1]; if (c[1] > n) n = c[1]; }
    else for (const x of c) walk(x);
  };
  for (const f of gj.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'GeometryCollection') g.geometries.forEach(x => walk(x.coordinates)); else walk(g.coordinates);
  }
  return any ? [so, n, w, e] : null;
}

/* Mantiene al día, por capa, los datos del estudio que salen del propio archivo (formato, tamaño, extensión, campos) y si ya se lista en el catálogo */
function syncStudy(it) {
  const rec = studyById(it.id);
  if (!rec) return;
  renameStudyLayer(rec.id, it.layerName);
  rec.listed = ['ready', 'server', 'sending', 'sent', 'failed'].includes(it.state);
  rec.busy = it.state === 'sending';
  const key = `${it.state}:${it.geojson ? it.geojson.features.length : 0}:${sizeOf(it)}:${it.crs || ''}`;
  if (rec.facts.key === key) return;
  const fmt = FORMATS[it.format] || FORMATS[it.srcFormat];
  rec.facts = {
    key, tipo: fmt?.label || '—', formato: fmt?.label || '—', tam: fmtSize(sizeOf(it)), crs: it.crs || '', n: it.geojson?.features.length || 0,
    bbox: it.geojson ? geoBBox(it.geojson) : null,
    attrs: it.geojson ? [...new Set(it.geojson.features.slice(0, 500).flatMap(ft => Object.keys(ft.properties || {})))].map(k => [k, '—', 'Campo del archivo']) : []
  };
}
watch(() => batch.items.map(x => `${x.id}:${x.state}:${x.layerName}:${x.geojson ? 1 : 0}`).join('|'), () => batch.items.forEach(syncStudy), { flush: 'post' });

/* ---------------- envío ---------------- */
/* Solo se envía al mismo origen o a HTTPS (lib/api.js): evita filtrar archivos a destinos inseguros */
/* Mensaje según el estado que informa el servidor */
function showServerState(it, body) {
  const texto = (body.estadoTexto || 'recibida').toLowerCase();
  if (body.estado === 'recibida') it.message = msg('loader-2', ['b', 'Recibida en cuarentena.'], ['t', ' El servidor la está revisando (antivirus, validación y conversión con GDAL)…']);
  else if (body.estado === 'requiere_correccion') {
    const err = (body.revision || []).find(c => c[0] === 'err');
    it.message = msg('alert-circle', ['b', 'El servidor la devolvió para corrección.'], ['t', ` ${err ? `${err[1]}${err[2] ? ` (${err[2]})` : ''}.` : ''} Nada se publicó.`]);
  } else it.message = msg('check-circle-2', ['b', 'Revisada por el servidor.'], ['t', ` Estado: ${texto}. Una persona administradora la aprueba antes de publicarla (pantalla Revisión).`]);
}

/* Después de enviar, la revisión del servidor sigue en segundo plano: se consulta su estado hasta que termina */
async function followUpload(itemId, serverId) {
  for (let i = 0, wait = 1500; i < 120; i++, wait = Math.min(wait * 1.3, 10000)) {
    await new Promise(r => setTimeout(r, wait));
    const it = byId(itemId);
    if (!it || it.serverId !== serverId) return;
    let body;
    try { body = await api(`/cargas/${serverId}`); } catch { continue; }
    if (body.estado === 'recibida') continue;
    showServerState(it, body);
    const bad = body.estado === 'requiere_correccion';
    if (bad) it.state = 'failed';
    showToast(bad ? 'error' : 'success', bad ? 'Devuelta por el servidor' : 'Revisión del servidor superada', `«${it.layerName}»: ${body.estadoTexto.toLowerCase()}.`);
    return;
  }
}

function sendOne(it) {
  return new Promise(resolve => {
    const fd = new FormData();
    Object.values(it.parts).forEach(file => file && fd.append('archivos', file));
    fd.append('capa', it.layerName);
    if (it.hash) fd.append('sha256', it.hash);
    fd.append('estudio', JSON.stringify(studyPayload(studyById(it.id))));
    /* Lo que decidió la persona y el servidor necesita para repetir la revisión */
    if (it.declaredCrs) fd.append('crs', it.declaredCrs);
    if (it.mapping?.confirmed) fd.append('mapeo', JSON.stringify({ x: it.mapping.x, y: it.mapping.y, crs: it.mapping.crs }));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiUrl()}/cargas/`);
    xhr.setRequestHeader('X-Requested-With', 'GeoportalCEDESU');
    xhr.setRequestHeader('X-CSRFToken', csrfToken());
    xhr.withCredentials = !sameOrigin();
    xhr.timeout = 10 * 60 * 1000;
    xhr.ontimeout = () => { it.state = 'failed'; it.message = msg('cloud-off', ['b', 'El servidor tardó demasiado en responder.'], ['t', ' Nada se publicó.']); resolve(); };
    xhr.upload.onprogress = e => { if (e.lengthComputable) it.progress = e.loaded / e.total; };
    xhr.onload = () => {
      let body = {}; try { body = JSON.parse(xhr.responseText); } catch { /* sin JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        it.state = 'sent';
        it.serverId = body.id || null;
        showServerState(it, body);
        if (body.estado === 'recibida' && it.serverId) followUpload(it.id, it.serverId);
      } else if (xhr.status === 401) {
        it.state = 'failed';
        it.message = msg('alert-circle', ['b', 'La sesión caducó.'], ['t', ' Vuelve a iniciar sesión y envíala de nuevo. Nada se publicó.']);
      } else {
        it.state = 'failed';
        it.message = msg('alert-circle', ['b', `El servidor la rechazó (${xhr.status}).`], ['t', ` ${body.detalle || body.detail || xhr.statusText || ''}`]);
      }
      resolve();
    };
    xhr.onerror = () => { it.state = 'failed'; it.message = msg('cloud-off', ['b', 'No se pudo conectar con el servidor.'], ['t', ' Nada se publicó.']); resolve(); };
    xhr.send(fd);
  });
}

const SENDABLE = ['ready', 'server', 'failed'];
export const canSend = it => !!it && SENDABLE.includes(it.state);

/* Envía solo esta capa, con su propio estudio */
export function sendLayer(id) {
  const it = byId(id);
  if (canSend(it)) return sendLayers([id]);
}

export function sendBatch() {
  return sendLayers(batch.items.filter(canSend).map(it => it.id));
}

async function sendLayers(list) {
  if (!list.length) return;
  const incomplete = list.map(id => byId(id)).filter(it => !studyComplete(studyById(it.id)));
  if (incomplete.length) {
    const first = incomplete[0];
    showToast('info', incomplete.length === 1 ? 'Falta completar un estudio' : `Faltan por completar ${incomplete.length} estudios`,
      `«${first.layerName}»: ${missingFields(studyById(first.id)).map(k => FIELD_LABELS[k].toLowerCase()).join(', ')}.`);
    editStudy(first.id);
    return;
  }
  const single = list.length === 1 && batch.items.filter(canSend).length > 1;
  const pending = single ? 0 : batch.items.filter(it => ['input', 'blocked'].includes(it.state)).length;
  const ok = await confirmAction({
    title: single ? `Enviar «${byId(list[0]).layerName}» a revisión` : `Enviar ${list.length} ${list.length === 1 ? 'capa' : 'capas'} a revisión`,
    text: `${single
      ? 'Se envía sola, con su estudio; las demás capas siguen en el lote. Quedará en cuarentena y pendiente de aprobación; no se publicará todavía.'
      : 'Cada capa se envía por separado, con su propio estudio. Quedarán en cuarentena y pendientes de aprobación; no se publicarán todavía.'}${pending ? ` ${pending} ${pending === 1 ? 'capa con pendientes no se enviará' : 'capas con pendientes no se enviarán'}.` : ''}`,
    ok: 'Enviar'
  });
  if (!ok) return;
  if (hasApi() && !apiUrl()) {
    showToast('error', 'Servidor de publicación inseguro', 'apiBase debe ser del mismo origen o usar HTTPS. No se envió nada.');
    return;
  }
  if (!hasApi()) {
    list.forEach(id => {
      const it = byId(id);
      it.state = 'sent';
      const study = studyPayload(studyById(it.id));
      const added = reviewDemo.add({
        id: it.id,
        titulo: it.layerName,
        formato: it.format || it.srcFormat || 'geojson',
        entidades: it.geojson?.features?.length || 0,
        estudio: study,
        crs: it.crs,
        archivos: Object.values(it.parts).filter(Boolean).map(f => ({ nombre: f.name, tam: f.size, sha256: it.hash || '0'.repeat(64) }))
      }, it.geojson);
      it.serverId = added.id;
      it.message = msg('check-circle-2', ['b', 'Enviada a revisión.'], ['t', ' Quedó en cuarentena. Una persona administradora la aprueba antes de publicarla (pantalla Revisión).']);
    });
    showToast('success', list.length === 1 ? 'Capa enviada a revisión' : `${list.length} capas enviadas a revisión`,
      'Ya está disponible en la pantalla Revisión para su aprobación.');
    return;
  }
  const done = startTask(list.length === 1 ? `Enviando ${byId(list[0])?.layerName || 'capa'}` : 'Enviando lote');
  for (const id of list) {
    const it = byId(id);
    if (!it) continue;
    it.state = 'sending'; it.progress = 0;
    await sendOne(it);
  }
  done();
}

/* Si se elimina el estudio (desde el catálogo o el diálogo), su capa sale del lote */
onStudyDeleted(id => removeItem(id));

/* Al cerrar la sesión se vacían el lote y los estudios de sus capas */
onSessionEnd(() => { clearItems(); });
export { hasApi };
