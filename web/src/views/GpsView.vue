<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import GpsPickerMap from '../components/GpsPickerMap.vue';
import {
  gps, addPoint, exportCSV, importExcel, selectPhoto, removePhoto, setManualCoordinates, useDeviceLocation,
  editPoint, cancelEdit, deletePoint, validateCoords, LAT, LON, REMOTE
} from '../stores/gps.js';
import { focusGpsPoint, showAllGps } from '../stores/map.js';
import { showToast } from '../stores/ui.js';
import { fmtDay } from '../lib/format.js';
import { formatCoord } from '../lib/geo.js';

const router = useRouter();
const photoEl = ref(null);
const excelEl = ref(null);
const formEl = ref(null);
const over = ref(false);
const saving = ref(false);
const TYPES = ['Muestra de suelo', 'Muestra de agua', 'Punto de referencia', 'Inicio de transecto', 'Fin de transecto', 'Observación de fauna', 'Observación de flora', 'Punto de control'];
const SOURCES = { mapa: 'Tomada del mapa', dispositivo: 'Ubicación de este dispositivo', punto: 'Coordenadas del punto en edición', manual: 'Escrita a mano', inicial: 'Valor de ejemplo: elige el punto en el mapa o escríbelo' };

const reversed = computed(() => gps.points.slice().reverse());
const editingPoint = computed(() => gps.points.find(p => p.id === gps.editing) || null);
const coordOk = computed(() => !gps.errors.lat && !gps.errors.lon && gps.form.lat !== '' && gps.form.lon !== '');
const coordLabel = computed(() => {
  const lat = Number(String(gps.form.lat).replace(',', '.')), lon = Number(String(gps.form.lon).replace(',', '.'));
  return Number.isFinite(lat) && Number.isFinite(lon) ? formatCoord(lat, lon, 'wgs84') : '';
});

watch(() => gps.photoReset, () => { if (photoEl.value) photoEl.value.value = ''; });

function onCoordInput() { gps.source = 'manual'; }
function onCoordBlur(axis) { if (gps.errors[axis] || String(gps.form[axis]).trim()) validateCoords(); }
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
function onPick(lat, lon) { setManualCoordinates(lat, lon, 'mapa'); }
function onSelect(id) { gps.selected = gps.selected === id ? null : id; nextTick(() => document.querySelector(`[data-point="${id}"]`)?.scrollIntoView({ block: 'nearest' })); }

function onExcel(file) { importExcel(file).finally(() => { if (excelEl.value) excelEl.value.value = ''; }); }
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
            <p>Registra observaciones con coordenadas WGS 84 en grados decimales: elige el punto en el mapa, usa la ubicación del dispositivo o escríbelo. {{ REMOTE ? 'Los puntos se guardan en el servidor y los ve todo el equipo con sesión.' : 'Sin servidor de publicación, los puntos se guardan solo en este navegador.' }}</p>
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
                <div class="grid2">
                  <div class="field">
                    <label for="manualLat">Latitud</label>
                    <input id="manualLat" v-model="gps.form.lat" class="input mono" type="number" step="any" inputmode="decimal" :min="LAT[0]" :max="LAT[1]" required
                      :aria-invalid="String(!!gps.errors.lat)" :aria-describedby="gps.errors.lat ? 'latErr' : 'coordHint'" @input="onCoordInput" @blur="onCoordBlur('lat')">
                    <p v-if="gps.errors.lat" id="latErr" class="error-text"><Icon name="alert-circle" />{{ gps.errors.lat }}</p>
                  </div>
                  <div class="field">
                    <label for="manualLon">Longitud</label>
                    <input id="manualLon" v-model="gps.form.lon" class="input mono" type="number" step="any" :min="LON[0]" :max="LON[1]" required
                      :aria-invalid="String(!!gps.errors.lon)" :aria-describedby="gps.errors.lon ? 'lonErr' : 'coordHint'" @input="onCoordInput" @blur="onCoordBlur('lon')">
                    <p v-if="gps.errors.lon" id="lonErr" class="error-text"><Icon name="alert-circle" />{{ gps.errors.lon }}</p>
                  </div>
                </div>
                <p id="coordHint" class="coord-hint">
                  <span class="coord-src" :data-ok="String(coordOk)"><Icon :name="coordOk ? 'map-pin' : 'info'" class="ic-14" />{{ SOURCES[gps.source] || SOURCES.manual }}</span>
                  <span v-if="coordOk" class="mono coord-read">{{ coordLabel }}</span>
                </p>
                <button type="button" class="btn btn-secondary btn-sm align-start" :disabled="gps.locating" @click="useDeviceLocation">
                  <Icon :name="gps.locating ? 'loader-2' : 'locate'" :class="{ 'ic-spin': gps.locating }" />{{ gps.locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación' }}
                </button>
              </fieldset>

              <div class="field"><label for="manualName">Nombre del punto</label><input id="manualName" v-model="gps.form.name" class="input" maxlength="120" placeholder="Ej. Muestra de suelo norte"></div>
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
              <div><h2 id="gpsListTitle">Puntos registrados</h2><p v-if="REMOTE">Guardados en el servidor del geoportal. Exporta el CSV para usarlos en otros programas.</p><p v-else>Solo en este navegador, sin sincronización. Borrar los datos del sitio los elimina: exporta el CSV para conservarlos.</p></div>
              <span class="badge">{{ gps.points.length }} {{ gps.points.length === 1 ? 'punto' : 'puntos' }}</span>
            </div>
            <ul v-if="gps.points.length" class="gps-list" aria-label="Puntos guardados">
              <li v-for="p in reversed" :key="p.id" :data-point="p.id" :data-selected="String(gps.selected === p.id)" :data-editing="String(gps.editing === p.id)">
                <button type="button" class="gps-item" :aria-pressed="String(gps.selected === p.id)" @click="onSelect(p.id)">
                  <span class="t">{{ p.name }}</span>
                  <span class="s">{{ p.type }} · {{ fmtDay(p.date) }} {{ p.time }}</span>
                  <span class="s mono">{{ Number(p.lat).toFixed(5) }}, {{ Number(p.lon).toFixed(5) }}</span>
                </button>
                <span class="gps-actions">
                  <button type="button" class="icon-btn" :aria-label="`Ver ${p.name} en el mapa principal`" data-tip="Ver en el mapa" @click="focusPoint(p)"><Icon name="map" /></button>
                  <button type="button" class="icon-btn" :aria-label="`Editar ${p.name}`" data-tip="Editar" @click="startEdit(p.id)"><Icon name="pencil" /></button>
                  <button type="button" class="icon-btn danger" :aria-label="`Eliminar ${p.name}`" data-tip="Eliminar" @click="deletePoint(p.id)"><Icon name="trash-2" /></button>
                </span>
              </li>
            </ul>
            <div v-else class="panel-body">
              <div class="empty flush"><strong>Sin puntos registrados</strong>Elige una ubicación en el mapa y guarda el punto, o importa un Excel. Los puntos aparecerán aquí, en este mapa y en el visor.</div>
            </div>
            <div class="panel-foot">
              <button type="button" class="btn btn-secondary" :disabled="!gps.points.length" @click="exportCSV"><Icon name="download" />Exportar CSV</button>
              <button type="button" class="btn btn-primary" :disabled="!gps.points.length" @click="showAll"><Icon name="map" />Ver todos en el visor</button>
            </div>
          </section>

          <!-- Excel -->
          <section class="panel gps-import" aria-labelledby="gpsXlsTitle">
            <div class="panel-head"><div><h2 id="gpsXlsTitle">Importar Excel</h2><p>Columnas reconocidas: latitud, longitud, nombre, tipo, descripción, fecha, hora y fotografía (URL). Una fila sin coordenadas válidas detiene la importación.</p></div></div>
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
