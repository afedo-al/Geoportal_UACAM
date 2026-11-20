/* Captura de puntos de campo. Con el servicio de publicación (cuando exista) se guardan en el servidor y los ve
   todo el equipo con sesión; sin él (un build estático) se guardan solo en este navegador (localStorage). */
import { reactive, watch } from 'vue';
import { store, downloadBlob, safePhotoURL } from '../lib/format.js';
import { setGpsMarkers } from './map.js';
import { showToast, startTask, confirmAction } from './ui.js';
import { onSessionStart, onSessionEnd } from './session.js';
import { api, apiHref, hasApi, ApiError } from '../lib/api.js';
import {
  LAT,
  LON,
  coordError,
  altitudeError,
  inWorkArea
} from '../lib/coords.js';

/* remote: los puntos viven en el servidor */
export const REMOTE = hasApi();

export { LAT, LON, coordError };

/* Los validadores se cargan solo al exportar o importar: no forman parte de la carga inicial del mapa */
const fileCheck = () => import('../lib/filecheck.js').then(m => m.FileCheck);

const GPS_VERSION = 'v6-empty';
const PHOTO_MAX = 2 * 1024 * 1024;

const now = () => new Date();
const emptyForm = () => ({
  lat: '19.84530',
  lon: '-90.52283',
  altitude: '',
  property: '',
  name: '',
  date: now().toISOString().slice(0, 10),
  time: now().toTimeString().slice(0, 5),
  type: 'Muestra de suelo',
  description: '',
  photo: '',
  photoFile: null
});

export const gps = reactive({
  points: [],
  counter: 0,
  form: emptyForm(),

  errors: {
    lat: '',
    lon: '',
    altitude: ''
  },

  editing: null,
  selected: null,
  source: 'inicial',
  locating: false,
  photoReset: 0
});

export function validateCoords() {
  gps.errors.lat = coordError(gps.form.lat, 'lat');
  gps.errors.lon = coordError(gps.form.lon, 'lon');

  gps.errors.altitude = altitudeError(
    gps.form.altitude
  );

  return (
    !gps.errors.lat &&
    !gps.errors.lon &&
    !gps.errors.altitude
  );
}

function sanitizePoint(pt) {
  if (!pt || typeof pt !== 'object') return null;

  const lat = Number(pt.lat);
  const lon = Number(pt.lon);

  if (!inWorkArea(lat, lon) || altitudeError(pt.altitude)) {
    return null;
  }

  const str = (value, max) =>
    String(value ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .slice(0, max);

  return {
    id: str(pt.id, 40),
    name: str(pt.name, 120),

    lat,
    lon,

    altitude:
      pt.altitude === '' || pt.altitude == null
        ? null
        : Number(String(pt.altitude).replace(',', '.')),

    property: str(pt.property, 120),
    type: str(pt.type, 60),
    description: str(pt.description, 1000),

    date: /^\d{4}-\d{2}-\d{2}$/.test(pt.date)
      ? pt.date
      : '',

    time: /^\d{2}:\d{2}/.test(String(pt.time))
      ? String(pt.time).slice(0, 5)
      : '',

    photo: safePhotoURL(pt.photo)
  };
}

/* Punto tal como lo devuelve el servidor: la fotografía es una ruta de la API */
const fromServer = p => sanitizePoint({ ...p, photo: p.photo ? apiHref(p.photo) : '' });
const apiMessage = err => (err instanceof ApiError ? err.detalle : 'No se pudo conectar con el servidor.');

function persist() {
  if (REMOTE) return true;
  try { localStorage.setItem('cedesuGPSPoints', JSON.stringify(gps.points)); return true; }
  catch { showToast('error', 'No se pudo guardar', 'El almacenamiento del navegador está lleno o bloqueado (la fotografía puede ser demasiado grande).'); return false; }
}

async function loadRemote() {
  try {
    const { puntos } = await api('/puntos');
    gps.points = puntos.map(fromServer).filter(Boolean);
    gps.counter = gps.points.length;
    setGpsMarkers(gps.points);
    await migrateLocal();
  } catch (err) { showToast('error', 'No se cargaron los puntos', apiMessage(err)); }
}

/* Puntos que se capturaron antes en este navegador, sin servidor: se suben una vez y se borran de aquí */
async function migrateLocal() {
  const saved = store.get('cedesuGPSPoints', null);
  if (!Array.isArray(saved) || !saved.length) return;
  const local = saved.map(sanitizePoint).filter(Boolean);
  if (!local.length) { store.set('cedesuGPSPoints', null); return; }
  try {
    const { puntos } = await api('/puntos/lote', { method: 'POST', json: { puntos: local } });
    gps.points.push(...puntos.map(fromServer).filter(Boolean));
    gps.counter = gps.points.length;
    setGpsMarkers(gps.points);
    store.set('cedesuGPSPoints', null);
    showToast('success', 'Puntos locales subidos al servidor', `${puntos.length} ${puntos.length === 1 ? 'punto capturado' : 'puntos capturados'} antes en este navegador ya están en el servidor.`);
  } catch (err) { showToast('warn', 'Puntos locales sin subir', `Siguen en este navegador: ${apiMessage(err)}`); }
}

export function initGps() {
  if (REMOTE) {
    onSessionStart(() => loadRemote());
    onSessionEnd(() => { gps.points = []; gps.counter = 0; gps.selected = null; resetForm(); setGpsMarkers([]); });
    return;
  }
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

/* Un clic en el mapa de la pantalla de captura llena la latitud y la longitud del formulario.
   (Antes cualquier clic en el visor principal las reescribía sin avisar, incluso al medir.) */
export function setManualCoordinates(lat, lon, source = 'mapa') {
  gps.form.lat = Number(lat).toFixed(6);
  gps.form.lon = Number(lon).toFixed(6);

  // Seleccionar en el mapa no proporciona altitud.
  if (source === 'mapa') {
    gps.form.altitude = '';
  }

  gps.source = source;
  validateCoords();
}

export function useDeviceLocation() {
  if (!('geolocation' in navigator)) {
    return showToast(
      'error',
      'Ubicación no disponible',
      'Este navegador no permite consultar la ubicación.'
    );
  }

  gps.locating = true;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gps.locating = false;

      setManualCoordinates(
        pos.coords.latitude,
        pos.coords.longitude,
        'dispositivo'
      );

      gps.form.altitude = Number.isFinite(pos.coords.altitude)
        ? pos.coords.altitude.toFixed(2)
        : '';

      validateCoords();

      if (gps.errors.lat || gps.errors.lon) {
        showToast(
          'warn',
          'Ubicación fuera del área de trabajo',
          'El punto está fuera del área geográfica configurada.'
        );
      }
    },

    (err) => {
      gps.locating = false;

      showToast(
        'error',
        'No se obtuvo la ubicación',
        err.code === 1
          ? 'El permiso de ubicación fue denegado.'
          : 'No fue posible obtener las coordenadas.'
      );
    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

function resetForm() {
  const nuevo = emptyForm();

  Object.assign(gps.form, {
    name: '',
    property: '',
    altitude: '',
    description: '',
    photo: '',
    photoFile: null,
    date: nuevo.date,
    time: nuevo.time
  });

  gps.editing = null;
  gps.photoReset++;
}

export function removePhoto() {
  gps.form.photo = ''; gps.form.photoFile = null; gps.photoReset++;
}

/* Edición: el formulario toma los datos del punto y «Guardar cambios» lo reemplaza en su lugar */
export function editPoint(id) {
  const punto = gps.points.find(p => p.id === id);

  if (!punto) return;

  Object.assign(gps.form, {
    lat: String(punto.lat),
    lon: String(punto.lon),

    altitude: punto.altitude == null
      ? ''
      : String(punto.altitude),

    property: punto.property || '',
    name: punto.name,
    date: punto.date,
    time: punto.time,
    type: punto.type,
    description: punto.description,
    photo: punto.photo,
    photoFile: null
  });

  gps.editing = id;
  gps.selected = id;
  gps.source = 'punto';

  gps.errors.lat = '';
  gps.errors.lon = '';
  gps.errors.altitude = '';

  gps.photoReset++;
}
export function cancelEdit() { resetForm(); }

export async function deletePoint(id) {
  const i = gps.points.findIndex(x => x.id === id);
  if (i < 0) return;
  const p = gps.points[i];
  const ok = await confirmAction({ title: `Eliminar «${p.name}»`, text: REMOTE ? 'El punto se borra del servidor para todo el equipo. No se puede deshacer.' : 'El punto se borra de este navegador. Si no lo exportaste a CSV, no se puede recuperar.', ok: 'Eliminar punto', danger: true });
  if (!ok) return;
  if (REMOTE) {
    try { await api(`/puntos/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
    catch (err) { showToast('error', 'No se eliminó el punto', apiMessage(err)); return; }
  }
  const at = gps.points.findIndex(x => x.id === id);
  if (at < 0) return;
  gps.points.splice(at, 1);
  if (!persist()) { gps.points.splice(at, 0, p); return; }
  if (gps.editing === id) resetForm();
  if (gps.selected === id) gps.selected = null;
  showToast('success', 'Punto eliminado', p.name);
}

export async function addPoint() {
  const f = gps.form;
  if (!validateCoords()) return false;
  const lat = Number(String(f.lat).replace(',', '.')), lon = Number(String(f.lon).replace(',', '.'));
  let photo = f.photo && !f.photoFile ? safePhotoURL(f.photo) : '';
  if (f.photoFile) {
    const problem = await checkPhoto(f.photoFile);
    if (problem) { showToast('error', 'Fotografía no válida', problem); return false; }
    photo = await readDataURL(f.photoFile);
  }
  const fields = {
    lat,
    lon,

    altitude:
      f.altitude === ''
        ? null
        : Number(String(f.altitude).replace(',', '.')),

    property: f.property.trim(),

    type: f.type || 'Punto de referencia',
    description: f.description.trim(),

    date: f.date || now().toISOString().slice(0, 10),
    time: f.time || now().toTimeString().slice(0, 5),

    photo
  };
  if (REMOTE) return saveRemote(f, fields);
  if (gps.editing) {
    const i = gps.points.findIndex(x => x.id === gps.editing);
    if (i < 0) { resetForm(); return false; }
    const before = gps.points[i];
    const point = { ...before, ...fields, name: f.name.trim() || before.name };
    gps.points.splice(i, 1, point);
    if (!persist()) { gps.points.splice(i, 1, before); return false; }
    setGpsMarkers(gps.points);
    showToast('success', 'Cambios guardados', `${point.name} · solo en este navegador.`);
    gps.selected = point.id;
    resetForm();
    return true;
  }
  gps.counter++;
  const point = { id: `P-${String(gps.counter).padStart(3, '0')}`, name: f.name.trim() || `Punto ${gps.counter}`, ...fields };
  gps.points.push(point);
  if (!persist()) { gps.points.pop(); gps.counter--; return false; }
  showToast('success', 'Punto guardado', `${point.name} · solo en este navegador.`);
  gps.selected = point.id;
  resetForm();
  return true;
}

/* Guardado en el servidor. La fotografía solo viaja si es nueva; si no cambió se conserva la que ya tiene. */
async function saveRemote(f, fields) {
  const editing = gps.editing;
  const before = editing ? gps.points.find(x => x.id === editing) : null;
  const body = { ...fields, name: f.name.trim() };
  if (before && fields.photo === before.photo) delete body.photo;
  const done = startTask('Guardando punto');
  let saved;
  try {
    saved = fromServer(await api(editing ? `/puntos/${encodeURIComponent(editing)}` : '/puntos', { method: editing ? 'PUT' : 'POST', json: body }));
  } catch (err) {
    showToast('error', 'No se guardó el punto', apiMessage(err));
    return false;
  } finally { done(); }
  if (!saved) return false;
  const i = gps.points.findIndex(x => x.id === saved.id);
  if (i >= 0) gps.points.splice(i, 1, saved); else gps.points.push(saved);
  gps.counter = gps.points.length;
  setGpsMarkers(gps.points);
  showToast('success', editing ? 'Cambios guardados' : 'Punto guardado', `${saved.name} · en el servidor.`);
  gps.selected = saved.id;
  resetForm();
  return true;
}

export async function exportCSV() {
  if (!gps.points.length) return showToast('info', 'Sin datos', 'No hay puntos para exportar.');
  const FC = await fileCheck();
  const header = [
    'ID',
    'Nombre',
    'Latitud',
    'Longitud',
    'Altitud (m)',
    'Propiedad o predio',
    'Tipo',
    'Descripción',
    'Fecha',
    'Hora',
    'Fotografía'
  ];

  const rows = gps.points.map(p => [
    p.id,
    p.name,
    p.lat,
    p.lon,
    p.altitude ?? '',
    p.property || '',
    p.type,
    p.description,
    p.date,
    p.time,
    p.photo && /^https?:\/\//i.test(p.photo)
      ? p.photo
      : ''
  ]);
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
      const lat = Number(
        rowValue(row, ['latitud', 'latitude', 'lat'])
      );

      const lon = Number(
        rowValue(row, ['longitud', 'longitude', 'lon', 'lng'])
      );

      const altitude = rowValue(row, [
        'altitud',
        'altura',
        'elevacion',
        'altitude',
        'altitud(m)'
      ]);

      if (!inWorkArea(lat, lon) || altitudeError(altitude)) {
        skipped.push(index + 2);
        return;
      }

      const rawDate = rowValue(row, ['fecha', 'date']);

      imported.push({
        id: String(
          rowValue(row, ['id', 'id_muestra', 'idpunto']) ||
          `EXCEL-${gps.points.length + imported.length + 1}`
        ),

        name: String(
          rowValue(row, ['nombre', 'nombrepunto', 'punto', 'name']) ||
          `Punto importado ${index + 1}`
        ),

        lat,
        lon,

        altitude:
          altitude === '' || altitude == null
            ? null
            : Number(String(altitude).replace(',', '.')),

        property: String(
          rowValue(row, ['propiedad', 'predio', 'sitio', 'lugar']) || ''
        ),

        type: String(
          rowValue(row, [
            'tipo',
            'tipomuestra',
            'tipo_muestra',
            'tipo_suelo'
          ]) || 'Punto de referencia'
        ),

        description: String(
          rowValue(row, [
            'descripcion',
            'description',
            'observaciones',
            'observacion'
          ]) || ''
        ),

        date: rawDate instanceof Date
          ? rawDate.toISOString().slice(0, 10)
          : String(rawDate || now().toISOString().slice(0, 10)),

        time: String(
          rowValue(row, ['hora', 'time']) || ''
        ),

        photo: String(
          rowValue(row, ['fotografia', 'foto', 'imagen', 'photo']) || ''
        )
      });
    });
    if (skipped.length) {
      return showToast('error', 'Importación detenida', `Filas sin coordenadas válidas para Campeche: ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? '…' : ''}. Corrígelas y vuelve a importar; no se descartan filas en silencio.`);
    }
    if (!imported.length) return showToast('error', 'Sin coordenadas', 'No se encontraron columnas de latitud y longitud válidas.');
    const clean = imported.map(sanitizePoint).filter(Boolean);
    if (REMOTE) {
      try {
        const { puntos } = await api('/puntos/lote', { method: 'POST', json: { puntos: clean.map(p => ({ ...p, photo: '' })) } });
        gps.points.push(...puntos.map(fromServer).filter(Boolean));
        gps.counter = gps.points.length;
        setGpsMarkers(gps.points);
        showToast('success', 'Excel importado', `${puntos.length} puntos guardados en el servidor.`);
      } catch (err) { showToast('error', 'No se importó el Excel', apiMessage(err)); }
      return;
    }
    gps.points.push(...clean);
    gps.counter = gps.points.length;
    if (!persist()) { gps.points.splice(-clean.length); return; }
    showToast('success', 'Excel importado', `${clean.length} puntos guardados en este navegador.`);
  } catch (error) {
    console.error(error);
    showToast('error', 'Error al leer Excel', 'Revisa que el archivo tenga encabezados de coordenadas válidos.');
  } finally { done(); }
}
