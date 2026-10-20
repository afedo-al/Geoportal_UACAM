/* Carga de datos por lotes.
   La lectura y validación reales corren en un Web Worker (lib/ingest.worker.js)
   para no congelar la página; aquí quedan el estado del lote, KML/GPX
   (DOMParser) y Excel (SheetJS, cargado bajo demanda). GeoPackage y GeoTIFF se
   validan en el servidor. Nada se publica sin confirmación del servidor. */
import { reactive, markRaw, nextTick } from 'vue';
import { FileCheck as FC } from '../lib/filecheck.js';
import { IngestCore } from '../lib/ingest-core.js';
import { xmlFeatures } from '../lib/xmlgeo.js';
import { fmtSize } from '../lib/format.js';
import { CFG } from '../config.js';
import { showToast, startTask, confirmAction, ui } from './ui.js';
import { onSessionEnd } from './session.js';
import { addSessionLayer, selectLayer, zoomToLayer } from './layers.js';
import { router } from '../router.js';

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

export const STUDY_REQ = ['sTitle', 'sTheme', 'sDate', 'sResp', 'sLic', 'sAccess'];
const emptyStudy = () => ({ sTitle: '', sTheme: '', sDate: '', sResp: '', sSource: '', sLic: '', sAccess: '', sDesc: '', sLineage: '' });
export const study = reactive(emptyStudy());
export const studyComplete = () => STUDY_REQ.every(k => String(study[k] || '').trim());

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
export const sizeOf = it => Object.values(it.parts).reduce((sum, f) => sum + (f?.size || 0), 0);

function newItem(o) {
  const it = { id: `c${++seq}`, state: 'reading', progress: 0, checks: [], geojson: null, table: null, crs: null, srcCrs: null, issues: [], message: null, layerName: o.name.replace(/[_-]+/g, ' ').trim(), ...o };
  batch.items.push(it);
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
  files = accepted.slice(0, room * 8);
  if (!files.length) return;
  const groups = new Map();
  const singles = [];
  const shpBases = new Set([...files.filter(f => extOf(f.name) === 'shp').map(f => baseName(f.name).toLowerCase()), ...batch.items.filter(i => i.format === 'shp').map(i => i.key)]);
  files.forEach(f => {
    const ext = extOf(f.name);
    if (SHP_PARTS.includes(ext) && (ext !== 'xml' || /\.shp\.xml$/i.test(f.name) || shpBases.has(baseName(f.name).toLowerCase()))) {
      const key = baseName(f.name).toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    } else singles.push(f);
  });
  const touched = [];
  groups.forEach((list, key) => {
    const existing = batch.items.find(it => it.format === 'shp' && it.key === key && !['sending', 'sent'].includes(it.state));
    if (existing) {
      list.forEach(f => { existing.parts[extOf(f.name)] = f; });
      touched.push(existing.id);
    } else {
      const parts = {};
      list.forEach(f => { parts[extOf(f.name)] = f; });
      touched.push(newItem({ format: 'shp', key, name: baseName(list[0].name), parts }));
    }
  });
  singles.forEach(f => {
    const ext = extOf(f.name);
    touched.push(newItem({ format: EXT[ext] || null, key: f.name.toLowerCase(), name: baseName(f.name), parts: { main: f } }));
  });
  if (!batch.selected && touched[0]) batch.selected = touched[0];
  touched.forEach(processItem);
}

/* ---------------- procesamiento ---------------- */
const RESULT_FIELDS = ['checks', 'issues', 'state', 'geojson', 'table', 'mapping', 'crs', 'srcCrs', 'hash', 'zipped', 'format', 'layerName', 'needsCrs'];

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
  Object.assign(it, { state: 'reading', progress: 0, checks: [], issues: [], geojson: null, table: null, mapping: null, message: null, needsCrs: false, hash: null, rawJob: null });
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
  const parts = Object.fromEntries(Object.entries(it.parts).filter(([k, f]) => f && (it.format !== 'shp' || ['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(k))));
  const result = await runJob({ id: jobId, kind: 'file', format: it.format, parts, hasApi: !!CFG.apiBase }, {
    onProgress: v => { if (it.job === jobId) it.progress = v; },
    onStage: st => { if (it.job === jobId) it.state = st; }
  });
  done();
  it = byId(id);
  if (!result || !it || it.job !== jobId) return; // cancelado, reemplazado o quitado
  applyResult(it, result);
  if (result.needsCrs) it.rawJob = jobId;
  try {
    if (result.next?.kind === 'xml') processXML(it, result.next.text, result.next.xmlKind);
    else if (result.next?.kind === 'xlsx') await processXlsx(it, result.next.buffer);
  } catch (err) {
    it.checks.push(['err', 'No se pudo interpretar el archivo', err.message]);
    it.state = 'blocked';
  }
  finishItem(it);
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
}

export function removeItem(id) {
  const i = batch.items.findIndex(x => x.id === id);
  if (i < 0 || batch.items[i].state === 'sending') return;
  cancelJob(batch.items[i].job);
  dropRaw(batch.items[i].rawJob);
  batch.items.splice(i, 1);
  batch.selected = batch.items[Math.min(i, batch.items.length - 1)]?.id || null;
}

export async function clearWithConfirm() {
  if (batch.items.some(it => it.state === 'sending')) return;
  const n = batch.items.length;
  if (!(await confirmAction({ title: 'Vaciar el lote', text: `Se quitarán ${n} ${n === 1 ? 'capa' : 'capas'} de esta carga. Los archivos de tu equipo no se modifican.`, ok: 'Vaciar' }))) return;
  clearItems();
}

/* Sistema de referencia declarado para un Shapefile sin .prj */
export function declareCrs(id, v) {
  const it = byId(id);
  if (!it?.rawJob) return;
  const crs = v === 'geo' ? { kind: 'geo', datum: 'WGS84', label: 'Geográficas · WGS84 (declarado)' } : { kind: 'utm', zone: +v, datum: 'WGS84', label: `UTM ${v}N · WGS84 (declarado)` };
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
}

/* «Ver en el mapa»: capa de la sesión, visible solo en este navegador */
export function viewOnMap(id) {
  const it = byId(id);
  if (!it?.geojson) return;
  const rec = {
    id: `SESION-${Date.now().toString(36).toUpperCase()}`, cat: 'Capa de sesión', estatus: 'No publicada', tipo: FORMATS[it.format].label, temas: study.sTheme || '—',
    resumen: study.sDesc || 'Archivo previsualizado en este navegador. No se ha enviado al servidor.', pub: study.sDate || '', act: study.sDate || '', escala: '—', res: '—', crs: it.crs || '—', bbox: [0, 0, 0, 0],
    formato: FORMATS[it.format].label, tam: fmtSize(sizeOf(it)), lic: study.sLic || '—', palabras: [], resp: study.sResp || '—', fuente: study.sSource || study.sResp || '—', linaje: study.sLineage || '—', access: 'Solo esta sesión',
    attrs: [...new Set(it.geojson.features.slice(0, 500).flatMap(ft => Object.keys(ft.properties || {})))].map(k => [k, '—', 'Campo del archivo'])
  };
  const layerId = addSessionLayer(it.layerName, it.geojson, rec);
  router.push('/');
  selectLayer(layerId);
  nextTick(() => requestAnimationFrame(() => zoomToLayer(layerId)));
  showToast('success', 'Capa de sesión agregada', 'Visible solo en este navegador. No se ha publicado.');
}

/* ---------------- estudio ---------------- */
let studyResolver = null;
export function openStudy() {
  ui.studyOpen = true;
  return new Promise(resolve => { studyResolver = resolve; });
}
export function closeStudy() {
  ui.studyOpen = false;
  studyResolver?.(studyComplete());
  studyResolver = null;
}
export function saveStudy(values) {
  Object.assign(study, values);
  showToast('success', 'Estudio guardado', `Las capas del lote heredan «${study.sTitle}».`);
}

/* ---------------- envío ---------------- */
/* Solo se envía al mismo origen o a HTTPS: evita filtrar archivos a destinos inseguros */
function apiUrl() {
  if (!CFG.apiBase) return null;
  try {
    const url = new URL(CFG.apiBase, location.origin);
    if (url.origin !== location.origin && url.protocol !== 'https:') return null;
    return url.href.replace(/\/$/, '');
  } catch { return null; }
}

function sendOne(it) {
  return new Promise(resolve => {
    const fd = new FormData();
    Object.values(it.parts).forEach(file => file && fd.append('archivos', file));
    fd.append('capa', it.layerName);
    if (it.hash) fd.append('sha256', it.hash);
    fd.append('estudio', JSON.stringify(study));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiUrl()}/cargas/`);
    xhr.setRequestHeader('X-Requested-With', 'GeoportalCEDESU');
    xhr.withCredentials = new URL(apiUrl()).origin === location.origin;
    xhr.timeout = 10 * 60 * 1000;
    xhr.ontimeout = () => { it.state = 'failed'; it.message = msg('cloud-off', ['b', 'El servidor tardó demasiado en responder.'], ['t', ' Nada se publicó.']); resolve(); };
    xhr.upload.onprogress = e => { if (e.lengthComputable) it.progress = e.loaded / e.total; };
    xhr.onload = () => {
      let body = {}; try { body = JSON.parse(xhr.responseText); } catch { /* sin JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        it.state = 'sent';
        it.message = msg('check-circle-2', ['b', 'Recibida por el servidor.'], ['t', ` Estado: ${body.estado || 'recibida'}${body.id ? ` · ${body.id}` : ''}. Pendiente de revisión.`]);
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

export async function sendBatch() {
  const list = batch.items.filter(it => ['ready', 'server', 'failed'].includes(it.state)).map(it => it.id);
  if (!list.length) return;
  if (!studyComplete()) {
    showToast('info', 'Completa el estudio', 'Las capas necesitan los metadatos del estudio antes de enviarse.');
    if (!(await openStudy())) return;
  }
  const pending = batch.items.filter(it => ['input', 'blocked'].includes(it.state)).length;
  const ok = await confirmAction({
    title: `Enviar ${list.length} ${list.length === 1 ? 'capa' : 'capas'} a revisión`,
    text: `Se enviarán al servidor dentro del estudio «${study.sTitle}». Quedarán en cuarentena y pendientes de aprobación; no se publicarán todavía.${pending ? ` ${pending} ${pending === 1 ? 'capa con pendientes no se enviará' : 'capas con pendientes no se enviarán'}.` : ''}`,
    ok: 'Enviar'
  });
  if (!ok) return;
  if (CFG.apiBase && !apiUrl()) {
    showToast('error', 'Servidor de publicación inseguro', 'apiBase debe ser del mismo origen o usar HTTPS. No se envió nada.');
    return;
  }
  if (!CFG.apiBase) {
    list.forEach(id => {
      const it = byId(id);
      it.state = 'failed';
      it.message = msg('cloud-off', ['b', 'No se envió.'], ['t', ' Este prototipo no tiene configurado un servidor de publicación ('], ['code', 'VITE_API_BASE'], ['t', '). Nada se ha publicado; puedes verla en el mapa como capa de sesión.']);
    });
    showToast('error', 'Envío no disponible', 'No hay servidor de publicación configurado. Nada se publicó.');
    return;
  }
  const done = startTask('Enviando lote');
  for (const id of list) {
    const it = byId(id);
    if (!it) continue;
    it.state = 'sending'; it.progress = 0;
    await sendOne(it);
  }
  done();
}

/* Al cerrar la sesión se vacía el lote y el estudio */
onSessionEnd(() => { clearItems(); Object.assign(study, emptyStudy()); });
export const hasApi = () => !!CFG.apiBase;
