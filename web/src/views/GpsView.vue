<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import GpsPickerMap from '../components/GpsPickerMap.vue';
import GpsImports from '../components/GpsImports.vue';
import {
  gps, pointsOfImport, addPoint, exportCSV, importExcel, downloadTemplate, saveAsLayer, selectPhoto, removePhoto, setManualCoordinates, useDeviceLocation,
  editPoint, cancelEdit, deletePoint, validateCoords, LAT, LON, REMOTE
} from '../stores/gps.js';
import { focusGpsPoint, showAllGps } from '../stores/map.js';
import { showToast } from '../stores/ui.js';
import { fmtDay } from '../lib/format.js';
import { formatCoord, fromUTM, toUTM } from '../lib/geo.js';
import { altitudeError } from '../lib/coords.js';

const router = useRouter();
const photoEl = ref(null);
const excelEl = ref(null);
const formEl = ref(null);
const over = ref(false);
const saving = ref(false);
const TYPES = ['Muestra de suelo', 'Muestra de agua', 'Punto de referencia', 'Inicio de transecto', 'Fin de transecto', 'Observación de fauna', 'Observación de flora', 'Punto de control'];
const SOURCES = { mapa: 'Tomada del mapa', dispositivo: 'Ubicación de este dispositivo', punto: 'Coordenadas del punto en edición', manual: 'Escrita a mano', inicial: 'Valor de ejemplo: elige el punto en el mapa o escríbelo' };
const coordMode = ref('wgs84');
const coordInput = reactive({ x: '', y: '' });
const coordXLabel = computed(() => coordMode.value === 'wgs84' ? 'Longitud' : 'Este (X, metros)');
const coordYLabel = computed(() => coordMode.value === 'wgs84' ? 'Latitud' : 'Norte (Y, metros)');
const coordHelp = computed(() => coordMode.value === 'wgs84'
  ? 'Latitud y longitud en grados decimales. Ejemplo: 19.84530, -90.52283.'
  : `Este (X) y Norte (Y) en metros, WGS 84 / ${coordMode.value === 'utm15' ? 'UTM 15N' : 'UTM 16N'}.`);

/* La lista muestra los más recientes; con miles de puntos pintarlos todos congelaría la página */
const shownLimit = ref(200);
/* Origen de los puntos: todos, capturados a mano o uno de los Excel importados */
const source = ref('all');
const excels = computed(() => gps.imports.map(i => ({ id: i.id, name: i.name, n: pointsOfImport(i).length })).filter(i => i.n));
const excelOf = computed(() => {
  const map = new Map();
  gps.imports.forEach(i => i.pointIds.forEach(id => map.set(id, i.name)));
  return map;
});
const manualCount = computed(() => gps.points.filter(p => !excelOf.value.has(p.id)).length);
/* Si el Excel elegido ya no existe (se eliminó), se vuelve a «Todos» */
watch(excels, list => { if (!['all', 'manual'].includes(source.value) && !list.some(i => i.id === source.value)) source.value = 'all'; });
const filtered = computed(() => source.value === 'all' ? gps.points
  : source.value === 'manual' ? gps.points.filter(p => !excelOf.value.has(p.id))
  : []);
const reversed = computed(() => filtered.value.slice(-shownLimit.value).reverse());
const hiddenPoints = computed(() => Math.max(0, filtered.value.length - shownLimit.value));
const inExcel = computed(() => !['all', 'manual'].includes(source.value));
const editingPoint = computed(() => gps.points.find(p => p.id === gps.editing) || null);
const coordOk = computed(() => !gps.errors.lat && !gps.errors.lon && gps.form.lat !== '' && gps.form.lon !== '');
const coordLabel = computed(() => {
  const lat = Number(String(gps.form.lat).replace(',', '.')), lon = Number(String(gps.form.lon).replace(',', '.'));
  return Number.isFinite(lat) && Number.isFinite(lon) ? formatCoord(lat, lon, coordMode.value) : '';
});

const threeFormats = computed(() => {
  if (!coordOk.value) return [];

  const lat = Number(String(gps.form.lat).replace(',', '.'));
  const lon = Number(String(gps.form.lon).replace(',', '.'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return [];
  }

  const homeZone = lon >= -90 ? 'utm16' : 'utm15';

  return [
    {
      key: 'wgs84',
      title: 'Coordenadas geográficas WGS 84',
      value: `${lat.toFixed(6)}, ${lon.toFixed(6)}`
    },
    {
      key: 'utm15',
      title: 'UTM Zona 15N',
      home: homeZone === 'utm15',
      value: formatCoord(lat, lon, 'utm15')
    },
    {
      key: 'utm16',
      title: 'UTM Zona 16N',
      home: homeZone === 'utm16',
      value: formatCoord(lat, lon, 'utm16')
    }
  ];
});

async function copyFormats() {
  const texto = threeFormats.value
    .map(c => `${c.title}: ${c.value}`)
    .join('\n');

  const altitud = gps.form.altitude !== ''
    ? `\nAltitud: ${gps.form.altitude} m`
    : '';

  try {
    await navigator.clipboard.writeText(texto + altitud);

    showToast(
      'success',
      'Coordenadas copiadas',
      'Los tres formatos se copiaron al portapapeles.'
    );
  } catch {
    showToast(
      'warn',
      'No fue posible copiar',
      'Selecciona las coordenadas manualmente.'
    );
  }
}

watch(() => gps.photoReset, () => { if (photoEl.value) photoEl.value.value = ''; });
function syncCoordInput() {
  const lat = Number(gps.form.lat), lon = Number(gps.form.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (coordMode.value === 'wgs84') {
    coordInput.x = String(lon);
    coordInput.y = String(lat);
  } else {
    const p = toUTM(lat, lon, coordMode.value === 'utm15' ? 15 : 16);
    coordInput.x = p.x.toFixed(2);
    coordInput.y = p.y.toFixed(2);
  }
}
watch(coordMode, syncCoordInput, { immediate: true });
watch(() => [gps.form.lat, gps.form.lon], () => { if (gps.source !== 'manual') syncCoordInput(); });
function convertCoordInput() {
  const x = Number(String(coordInput.x).replace(',', '.')), y = Number(String(coordInput.y).replace(',', '.'));
  if (!Number.isFinite(x)) {
    gps.errors.lon = coordMode.value === 'wgs84' ? 'Escribe una longitud válida.' : 'Escribe un Este (X) válido en metros.';
  }
  if (!Number.isFinite(y)) {
    gps.errors.lat = coordMode.value === 'wgs84' ? 'Escribe una latitud válida.' : 'Escribe un Norte (Y) válido en metros.';
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (coordMode.value === 'wgs84') {
    gps.form.lon = String(x);
    gps.form.lat = String(y);
  } else {
    if (x < 100000 || x > 900000) {
      gps.errors.lon = 'El Este (X) debe estar entre 100,000 y 900,000 metros.';
      return false;
    }
    if (y < 0 || y > 10000000) {
      gps.errors.lat = 'El Norte (Y) debe estar entre 0 y 10,000,000 metros.';
      return false;
    }
    const p = fromUTM(x, y, coordMode.value === 'utm15' ? 15 : 16);
    gps.form.lat = String(p.lat);
    gps.form.lon = String(p.lon);
  }
  validateCoords();
  return true;
}

function onCoordInput() { gps.source = 'manual'; convertCoordInput(); }
function onCoordBlur() { convertCoordInput(); }
async function save() {
  saving.value = true;
  const ok = await addPoint();
  saving.value = false;
  if (!ok) nextTick(() => formEl.value?.querySelector('[aria-invalid="true"]')?.focus());
}
function startEdit(id) {
  editPoint(id);
  nextTick(() => {
    formEl.value?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    formEl.value?.querySelector('#manualName')?.focus({ preventScroll: true });
  });
}
function onPick(lat, lon) { setManualCoordinates(lat, lon, 'mapa'); syncCoordInput(); }
function onSelect(id) { gps.selected = gps.selected === id ? null : id; nextTick(() => document.querySelector(`[data-point="${id}"]`)?.scrollIntoView({ block: 'nearest' })); }

async function pointsAsLayer() { if (await saveAsLayer(gps.points, 'puntos de campo')) router.push('/carga'); }
function onExcel(file) { importExcel(file, coordMode.value).finally(() => { if (excelEl.value) excelEl.value.value = ''; }); }
function onDrop(e) { over.value = false; onExcel(e.dataTransfer.files?.[0]); }
function focusPoint(p) { router.push('/'); focusGpsPoint(p); }
function showAll() {
  if (!gps.points.length) return showToast('info', 'Sin puntos', 'Todavía no hay puntos registrados.');
  router.push('/');
  showAllGps(gps.points);
}
</script>

<template>
  <section id="screen-gps" class="screen active" aria-labelledby="gpsTitle">
    <div class="page">
      <div class="page-inner page-wide">
        <div class="page-head">
          <div>
            <h1 id="gpsTitle">Captura de puntos de campo</h1>
            <p>Registra observaciones en WGS 84 con grados decimales o UTM 15N/16N. El sistema guarda internamente latitud y longitud para que todos los puntos se vean igual en el mapa. {{ REMOTE ? 'Los puntos se guardan en el servidor y los ve todo el equipo con sesión.' : 'Sin servidor de publicación, los puntos se guardan solo en este navegador.' }}</p>
          </div>
        </div>

        <div class="gps-layout">
          <!-- Formulario -->
          <form ref="formEl" class="panel gps-form" :class="{ 'is-editing': gps.editing }" novalidate aria-labelledby="gpsFormTitle" @submit.prevent="save">
            <div class="panel-head">
              <div>
                <h2 id="gpsFormTitle">{{ editingPoint ? `Editar «${editingPoint.name}»` : 'Nuevo punto' }}</h2>
                <p>{{ editingPoint ? 'Los cambios reemplazan al punto guardado.' : 'Los campos sin marca son opcionales.' }}</p>
              </div>
              <span v-if="editingPoint" class="badge badge-info">Editando</span>
            </div>
            <div class="panel-body stack">
              <fieldset class="coord-set">
                <legend>Ubicación <span class="req" aria-hidden="true">*</span></legend>
                <div class="field">
                  <label for="coordMode">Formato de captura</label>
                  <select id="coordMode" v-model="coordMode" class="select">
                    <option value="wgs84">WGS 84 · grados decimales</option>
                    <option value="utm15">WGS 84 / UTM 15N · metros (96° O–90° O)</option>
                    <option value="utm16">WGS 84 / UTM 16N · metros (90° O–84° O)</option>
                  </select>
                  <span id="coordModeHint" class="hint">{{ coordHelp }}</span>
                </div>
                <div class="grid2">
                  <div class="field">
                    <label for="manualX">{{ coordXLabel }}</label>
                    <input id="manualX" v-model="coordInput.x" class="input mono" type="number" step="any" inputmode="decimal" :min="coordMode === 'wgs84' ? LON[0] : 100000" :max="coordMode === 'wgs84' ? LON[1] : 900000" required
                      :aria-invalid="String(!!gps.errors.lon)" :aria-describedby="gps.errors.lon ? 'lonErr' : 'coordHint'" @input="onCoordInput" @blur="onCoordBlur">
                    <p v-if="gps.errors.lon" id="lonErr" class="error-text"><Icon name="alert-circle" />{{ gps.errors.lon }}</p>
                  </div>
                  <div class="field">
                    <label for="manualY">{{ coordYLabel }}</label>
                    <input id="manualY" v-model="coordInput.y" class="input mono" type="number" step="any" inputmode="decimal" :min="coordMode === 'wgs84' ? LAT[0] : 0" :max="coordMode === 'wgs84' ? LAT[1] : 10000000" required
                      :aria-invalid="String(!!gps.errors.lat)" :aria-describedby="gps.errors.lat ? 'latErr' : 'coordHint'" @input="onCoordInput" @blur="onCoordBlur">
                    <p v-if="gps.errors.lat" id="latErr" class="error-text"><Icon name="alert-circle" />{{ gps.errors.lat }}</p>
                  </div>
                </div>
                <div class="field">
                  <label for="manualAltitude">
                    Altitud (metros)
                    <span class="hint">· opcional</span>
                  </label>

                  <input
                    id="manualAltitude"
                    v-model="gps.form.altitude"
                    type="number"
                    step="any"
                    min="-500"
                    max="9000"
                    inputmode="decimal"
                    class="input mono"
                    placeholder="Ej. 12.5"
                    :aria-invalid="String(!!gps.errors.altitude)"
                    @input="gps.errors.altitude = altitudeError(gps.form.altitude)"
                  />

                  <p v-if="gps.errors.altitude" class="error-text">
                    <Icon name="alert-circle" />
                    {{ gps.errors.altitude }}
                  </p>

                  <span class="hint">
                    La altitud es opcional. Puede capturarse manualmente
                    o tomarse del dispositivo cuando esté disponible.
                  </span>
                </div>

                <p id="coordHint" class="coord-hint">
                  <span class="coord-src" :data-ok="String(coordOk)"><Icon :name="coordOk ? 'map-pin' : 'info'" class="ic-14" />{{ SOURCES[gps.source] || SOURCES.manual }}</span>
                  <span v-if="coordOk" class="mono coord-read">{{ coordLabel }}</span>
                </p>

                <div v-if="threeFormats.length" class="gps-conversions">

                  <div class="gps-conversions-head">
                    <strong>Coordenadas del punto seleccionado</strong>

                    <button
                      type="button"
                      class="btn btn-quiet btn-sm"
                      @click="copyFormats"
                    >
                      <Icon name="copy" />
                      Copiar
                    </button>
                  </div>

                  <dl>
                    <div v-for="formato in threeFormats" :key="formato.key">
                      <dt>{{ formato.title }} <span v-if="formato.home" class="badge badge-ok">Zona del punto</span></dt>
                      <dd class="mono">{{ formato.value }}</dd>
                    </div>
                  </dl>

                  <p class="hint">
                    La zona del punto es la que le corresponde por su longitud; la otra es la misma
                    ubicación expresada con el meridiano central vecino, y sirve para comparar con mapas que usan esa zona.
                  </p>

                </div>

                <button type="button" class="btn btn-secondary btn-sm align-start" :disabled="gps.locating" @click="useDeviceLocation">
                  <Icon :name="gps.locating ? 'loader-2' : 'locate'" :class="{ 'ic-spin': gps.locating }" />{{ gps.locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación' }}
                </button>
              </fieldset>

              <div class="field"><label for="manualName">Nombre del punto</label><input id="manualName" v-model="gps.form.name" class="input" maxlength="120" placeholder="Ej. Muestra de suelo norte"></div>

              <div class="field">
                <label for="manualProperty">
                  Propiedad o predio
                  <span class="hint">· opcional</span>
                </label>

                <input
                  id="manualProperty"
                  v-model="gps.form.property"
                  type="text"
                  maxlength="120"
                  class="input"
                  placeholder="Ej. Parcela experimental A"
                />

                <span class="hint">
                  Este dato puede modificarse posteriormente
                  al editar las propiedades del punto.
                </span>
              </div>

              <div class="grid2">
                <div class="field"><label for="manualDate">Fecha</label><input id="manualDate" v-model="gps.form.date" type="date" class="input"></div>
                <div class="field"><label for="manualTime">Hora</label><input id="manualTime" v-model="gps.form.time" type="time" class="input"></div>
              </div>
              <div class="field"><label for="manualType">Tipo de punto</label>
                <select id="manualType" v-model="gps.form.type" class="select"><option v-for="t in TYPES" :key="t">{{ t }}</option></select></div>
              <div class="field"><label for="manualDescription">Descripción</label><textarea id="manualDescription" v-model="gps.form.description" class="textarea" rows="3" maxlength="1000" placeholder="Condiciones del sitio, observaciones"></textarea></div>
              <div class="field">
                <label for="manualPhoto">Fotografía</label>
                <input id="manualPhoto" ref="photoEl" type="file" accept="image/png,image/jpeg,image/webp" class="input file-input" aria-describedby="photoHint" @change="selectPhoto($event.target.files?.[0])">
                <span id="photoHint" class="hint">PNG, JPEG o WebP de hasta 2 MB. Se guarda con el punto{{ REMOTE ? ' en el servidor' : ' en este navegador' }}; revisa que no muestre personas o datos privados.</span>
                <div v-if="gps.form.photo" class="photo-preview">
                  <img :src="gps.form.photo" alt="Vista previa de la fotografía del punto">
                  <button type="button" class="btn btn-quiet btn-sm danger" @click="removePhoto"><Icon name="trash-2" />Quitar fotografía</button>
                </div>
              </div>
            </div>
            <div class="panel-foot">
              <button v-if="gps.editing" type="button" class="btn btn-quiet" @click="cancelEdit">Cancelar edición</button>
              <button type="submit" class="btn btn-primary" :disabled="saving" :aria-busy="String(saving)">
                <Icon :name="gps.editing ? 'check' : 'map-pin'" />{{ gps.editing ? 'Guardar cambios' : 'Guardar punto' }}
              </button>
            </div>
          </form>

          <!-- Mapa de ubicación -->
          <section class="panel gps-map-panel" aria-labelledby="gpsMapTitle">
            <div class="panel-head">
              <div><h2 id="gpsMapTitle">Ubicación en el mapa</h2><p>Toca o haz clic en el mapa para tomar las coordenadas. Los puntos guardados aparecen en ámbar; el anillo azul es el punto del formulario.</p></div>
            </div>
            <GpsPickerMap :points="gps.points" :lat="gps.form.lat" :lon="gps.form.lon" :selected="gps.selected" @pick="onPick" @select="onSelect" />
          </section>

          <!-- Puntos -->
          <section class="panel gps-points" aria-labelledby="gpsListTitle">
            <div class="panel-head">
              <div><h2 id="gpsListTitle">Puntos registrados</h2><p v-if="REMOTE">Guardados en el servidor de DeltaMap-CEDESU. Exporta el CSV para usarlos en otros programas.</p><p v-else>Solo en este navegador, sin sincronización. Borrar los datos del sitio los elimina: exporta el CSV para conservarlos.</p></div>
              <span class="badge">{{ gps.points.length }} {{ gps.points.length === 1 ? 'punto' : 'puntos' }}</span>
            </div>
            <div v-if="excels.length" class="gps-sources" role="group" aria-label="Origen de los puntos">
              <button type="button" class="chip-btn" :aria-pressed="String(source === 'all')" @click="source = 'all'">Todos <span>{{ gps.points.length }}</span></button>
              <button type="button" class="chip-btn" :aria-pressed="String(source === 'manual')" @click="source = 'manual'">Capturados a mano <span>{{ manualCount }}</span></button>
              <button v-for="x in excels" :key="x.id" type="button" class="chip-btn" :aria-pressed="String(source === x.id)" :title="x.name" @click="source = x.id">
                <Icon name="file-spreadsheet" class="ic-14" /><span class="chip-name">{{ x.name }}</span> <span>{{ x.n }}</span>
              </button>
            </div>
            <GpsImports v-if="inExcel" :only="source" />
            <ul v-else-if="filtered.length" class="gps-list" aria-label="Puntos guardados">
              <li v-for="p in reversed" :key="p.id" :data-point="p.id" :data-selected="String(gps.selected === p.id)" :data-editing="String(gps.editing === p.id)">
                <button type="button" class="gps-item" :aria-pressed="String(gps.selected === p.id)" @click="onSelect(p.id)">
                  <span class="t">{{ p.name }}<span v-if="excelOf.get(p.id)" class="badge gps-xls" :title="excelOf.get(p.id)"><Icon name="file-spreadsheet" class="ic-14" />Excel</span></span>
                  <span class="s">{{ p.type }} · {{ fmtDay(p.date) }} {{ p.time }}</span>
                  <span class="s mono">
                    {{ Number(p.lat).toFixed(5) }},
                    {{ Number(p.lon).toFixed(5) }}

                    <template v-if="p.altitude != null">
                      · {{ p.altitude }} m
                    </template>
                  </span>

                  <span v-if="p.author" class="s">Autor: {{ p.author }}</span>
                  <span v-if="p.property" class="s">
                    Propiedad/predio: {{ p.property }}
                  </span>
                </button>
                <span class="gps-actions">
                  <button type="button" class="icon-btn" :aria-label="`Ver ${p.name} en el mapa principal`" data-tip="Ver en el mapa" @click="focusPoint(p)"><Icon name="map" /></button>
                  <button type="button" class="icon-btn" :aria-label="`Editar ${p.name}`" data-tip="Editar" @click="startEdit(p.id)"><Icon name="pencil" /></button>
                  <button type="button" class="icon-btn danger" :aria-label="`Eliminar ${p.name}`" data-tip="Eliminar" @click="deletePoint(p.id)"><Icon name="trash-2" /></button>
                </span>
              </li>
            </ul>
            <div v-if="!inExcel && hiddenPoints" class="panel-foot"><button type="button" class="btn btn-quiet btn-sm" @click="shownLimit += 200">Mostrar {{ Math.min(200, hiddenPoints) }} más ({{ hiddenPoints.toLocaleString('es-MX') }} sin mostrar)</button></div>
            <div v-else-if="!inExcel && !filtered.length" class="panel-body">
              <div class="empty flush"><strong>Sin puntos registrados</strong>Elige una ubicación en el mapa y guarda el punto, o importa un Excel. Los puntos aparecerán aquí, en este mapa y en el visor.</div>
            </div>
            <div class="panel-foot">
              <button type="button" class="btn btn-secondary" :disabled="!gps.points.length" @click="exportCSV"><Icon name="download" />Exportar CSV</button>
              <button type="button" class="btn btn-secondary" :disabled="!gps.points.length" @click="pointsAsLayer"><Icon name="layers" />Guardar como capa</button>
              <button type="button" class="btn btn-primary" :disabled="!gps.points.length" @click="showAll"><Icon name="map" />Ver todos en el visor</button>
            </div>
          </section>

          <!-- Excel -->
          <section class="panel gps-import" aria-labelledby="gpsXlsTitle">
            <div class="panel-head"><div><h2 id="gpsXlsTitle">Importar Excel</h2><p>Plantilla: columnas <b>Name</b>, <b>X</b>, <b>Y</b> y <b>Autor</b>. X e Y pueden ir en grados (longitud y latitud, WGS 84) o en metros UTM; se detecta solo. Si son metros y caben en dos zonas, se usa la elegida en «Sistema de coordenadas». Una fila sin coordenadas válidas detiene la importación.</p> <button type="button" class="btn btn-quiet btn-sm" @click="downloadTemplate"><Icon name="download" />Descargar plantilla</button></div></div>
            <div class="panel-body">
              <input ref="excelEl" type="file" accept=".xls,.xlsx" hidden @change="onExcel($event.target.files?.[0])">
              <div class="dropzone dropzone-sm" :class="{ 'is-over': over }" role="button" tabindex="0"
                @click="excelEl.click()" @keydown.enter.prevent="excelEl.click()" @keydown.space.prevent="excelEl.click()"
                @dragover.prevent="over = true" @dragenter.prevent="over = true" @dragleave.prevent="over = false" @drop.prevent="onDrop">
                <Icon name="file-spreadsheet" class="ic-20" />
                <strong>Seleccionar o soltar un Excel</strong><span>.xls o .xlsx, hasta 20 MB</span>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.gps-conversions {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  padding: 16px;
  margin: 12px 0;
}

.gps-conversions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 14px;
}

.gps-conversions dl {
  display: grid;
  gap: 12px;
  margin: 16px 0;
}

.gps-conversions dl > div {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}

.gps-conversions dt {
  color: var(--text-3);
  font-size: 12px;
}

.gps-conversions dd {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  word-break: break-word;
}

.gps-conversions .hint {
  font-size: 12px;
  line-height: 1.6;
}
</style>
