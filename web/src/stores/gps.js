/* Captura de puntos de campo. Hasta que exista el servicio de publicación
   se guardan solo en este navegador (localStorage). */
import { reactive, watch } from 'vue';
import { store, downloadBlob, safePhotoURL } from '../lib/format.js';
import { mapHooks, setGpsMarkers } from './map.js';
import { showToast, startTask } from './ui.js';

/* Los validadores se cargan solo al exportar o importar: no forman parte de la carga inicial del mapa */
const fileCheck = () => import('../lib/filecheck.js').then(m => m.FileCheck);

const GPS_VERSION = 'v6-empty';
const PHOTO_MAX = 2 * 1024 * 1024;
const LAT = [14, 22], LON = [-93, -86]; // rango de Campeche

const now = () => new Date();
const emptyForm = () => ({ lat: '19.84530', lon: '-90.52283', name: '', date: now().toISOString().slice(0, 10), time: now().toTimeString().slice(0, 5), type: 'Muestra de suelo', description: '', photo: '', photoFile: null });

export const gps = reactive({ points: [], counter: 0, form: emptyForm(), invalid: { lat: false, lon: false }, photoReset: 0 });

function sanitizePoint(pt) {
  if (!pt || typeof pt !== 'object') return null;
  const lat = Number(pt.lat), lon = Number(pt.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < LAT[0] || lat > LAT[1] || lon < LON[0] || lon > LON[1]) return null;
  const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
  return {
    id: str(pt.id, 40), name: str(pt.name, 120), lat, lon, type: str(pt.type, 60), description: str(pt.description, 1000),
    date: /^\d{4}-\d{2}-\d{2}$/.test(pt.date) ? pt.date : '', time: /^\d{2}:\d{2}/.test(String(pt.time)) ? String(pt.time).slice(0, 5) : '',
    photo: safePhotoURL(pt.photo)
  };
}

function persist() {
  try { localStorage.setItem('cedesuGPSPoints', JSON.stringify(gps.points)); return true; }
  catch { showToast('error', 'No se pudo guardar', 'El almacenamiento del navegador está lleno o bloqueado (la fotografía puede ser demasiado grande).'); return false; }
}

export function initGps() {
  const savedVersion = store.get('cedesuGPSVersion', null);
  const saved = store.get('cedesuGPSPoints', null);
  if (savedVersion === GPS_VERSION && Array.isArray(saved)) {
    gps.points = saved.map(sanitizePoint).filter(Boolean);
    if (gps.points.length !== saved.length) { showToast('warn', 'Puntos locales descartados', `${saved.length - gps.points.length} registros guardados no eran válidos.`); persist(); }
  } else { gps.points = []; store.set('cedesuGPSVersion', GPS_VERSION); persist(); }
  gps.counter = gps.points.length;
  setGpsMarkers(gps.points);
}

watch(() => gps.points.length, () => setGpsMarkers(gps.points));

/* Fotografías: solo PNG, JPEG o WebP reales y de hasta 2 MB */
async function checkPhoto(file) {
  if (file.size > PHOTO_MAX) return 'La fotografía supera 2 MB.';
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isWebp = String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WEBP';
  return isPng || isJpg || isWebp ? null : 'El archivo no es una imagen PNG, JPEG o WebP (se comprobó su contenido, no solo la extensión).';
}
const readDataURL = file => new Promise(resolve => { const r = new FileReader(); r.onload = e => resolve(e.target.result); r.onerror = () => resolve(''); r.readAsDataURL(file); });

export async function selectPhoto(file) {
  if (!file) return;
  const problem = await checkPhoto(file);
  if (problem) { gps.form.photo = ''; gps.form.photoFile = null; gps.photoReset++; showToast('error', 'Fotografía no válida', problem); return; }
  gps.form.photoFile = file;
  gps.form.photo = await readDataURL(file);
}

/* Un clic en el mapa llena la latitud y la longitud del formulario */
export function setManualCoordinates(lat, lon) {
  gps.form.lat = Number(lat).toFixed(6);
  gps.form.lon = Number(lon).toFixed(6);
}
mapHooks.mapClick = setManualCoordinates;

function resetForm() {
  const f = emptyForm();
  Object.assign(gps.form, { name: '', description: '', photo: '', photoFile: null, date: f.date, time: f.time });
  gps.photoReset++;
}

export async function addPoint() {
  const f = gps.form;
  const lat = Number(f.lat), lon = Number(f.lon);
  gps.invalid.lat = !(Number.isFinite(lat) && lat >= LAT[0] && lat <= LAT[1]);
  gps.invalid.lon = !(Number.isFinite(lon) && lon >= LON[0] && lon <= LON[1]);
  if (gps.invalid.lat) return showToast('error', 'Latitud inválida', 'Usa una latitud entre 14 y 22 para Campeche.');
  if (gps.invalid.lon) return showToast('error', 'Longitud inválida', 'Usa una longitud entre −93 y −86 para Campeche.');
  let photo = '';
  if (f.photoFile) {
    const problem = await checkPhoto(f.photoFile);
    if (problem) return showToast('error', 'Fotografía no válida', problem);
    photo = await readDataURL(f.photoFile);
  }
  gps.counter++;
  const point = {
    id: `P-${String(gps.counter).padStart(3, '0')}`, name: f.name.trim() || `Punto ${gps.counter}`, lat, lon,
    type: f.type || 'Punto de referencia', description: f.description.trim(), date: f.date || now().toISOString().slice(0, 10), time: f.time || now().toTimeString().slice(0, 5), photo
  };
  gps.points.push(point);
  if (!persist()) { gps.points.pop(); gps.counter--; return; }
  showToast('success', 'Punto guardado', `${point.name} · guardado en este navegador.`);
  resetForm();
}

export async function exportCSV() {
  if (!gps.points.length) return showToast('info', 'Sin datos', 'No hay puntos para exportar.');
  const FC = await fileCheck();
  const header = ['ID', 'Nombre', 'Latitud', 'Longitud', 'Tipo', 'Descripción', 'Fecha', 'Hora', 'Fotografía'];
  const rows = gps.points.map(p => [p.id, p.name, p.lat, p.lon, p.type, p.description, p.date, p.time, p.photo && /^https?:\/\//i.test(p.photo) ? p.photo : '']);
  const csv = [header, ...rows].map(r => r.map(v => `"${FC.safeCell(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob(new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' }), 'puntos_campo_cedesu.csv');
}

/* ---------------- importación de Excel ---------------- */
const normalizeHeader = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[ _-]+/g, '');
function rowValue(row, aliases) {
  const target = aliases.map(normalizeHeader);
  const key = Object.keys(row).find(k => target.includes(normalizeHeader(k)));
  return key ? row[key] : '';
}

export async function importExcel(file) {
  if (!file) return;
  if (!/\.xlsx?$/i.test(file.name)) return showToast('error', 'Archivo no válido', 'Selecciona un archivo .xls o .xlsx.');
  if (file.size > 20 * 1024 * 1024) return showToast('error', 'Archivo demasiado grande', 'El límite para importar puntos es de 20 MB.');
  const FC = await fileCheck();
  const sig = FC.signature(await file.slice(0, 4096).arrayBuffer());
  const want = /\.xlsx$/i.test(file.name) ? 'zip' : 'ole';
  if (sig !== want) return showToast('error', 'El archivo no es un Excel', `Tiene extensión de Excel, pero su contenido es ${FC.SIGNATURE_LABEL[sig]}.`);
  const done = startTask('Importando Excel');
  try {
    const mod = await import('xlsx');
    const XLSX = mod.default?.read ? mod.default : mod;
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    const imported = [], skipped = [];
    rows.forEach((row, index) => {
      const lat = Number(rowValue(row, ['latitud', 'latitude', 'lat']));
      const lon = Number(rowValue(row, ['longitud', 'longitude', 'lon', 'lng']));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < LAT[0] || lat > LAT[1] || lon < LON[0] || lon > LON[1]) { skipped.push(index + 2); return; }
      const rawDate = rowValue(row, ['fecha', 'date']);
      imported.push({
        id: String(rowValue(row, ['id', 'id_muestra', 'idpunto']) || `EXCEL-${gps.points.length + imported.length + 1}`),
        name: String(rowValue(row, ['nombre', 'nombrepunto', 'punto', 'name']) || `Punto importado ${index + 1}`), lat, lon,
        type: String(rowValue(row, ['tipo', 'tipomuestra', 'tipo_muestra', 'tipo_suelo']) || 'Punto de referencia'),
        description: String(rowValue(row, ['descripcion', 'description', 'observaciones', 'observacion']) || ''),
        date: rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate || now().toISOString().slice(0, 10)),
        time: String(rowValue(row, ['hora', 'time']) || ''),
        photo: String(rowValue(row, ['fotografia', 'foto', 'imagen', 'photo']) || '')
      });
    });
    if (skipped.length) {
      return showToast('error', 'Importación detenida', `Filas sin coordenadas válidas para Campeche: ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? '…' : ''}. Corrígelas y vuelve a importar; no se descartan filas en silencio.`);
    }
    if (!imported.length) return showToast('error', 'Sin coordenadas', 'No se encontraron columnas de latitud y longitud válidas.');
    const clean = imported.map(sanitizePoint).filter(Boolean);
    gps.points.push(...clean);
    gps.counter = gps.points.length;
    if (!persist()) { gps.points.splice(-clean.length); return; }
    showToast('success', 'Excel importado', `${clean.length} puntos guardados en este navegador.`);
  } catch (error) {
    console.error(error);
    showToast('error', 'Error al leer Excel', 'Revisa que el archivo tenga encabezados de coordenadas válidos.');
  } finally { done(); }
}
