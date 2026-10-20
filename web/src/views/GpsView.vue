<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import { gps, addPoint, exportCSV, importExcel, selectPhoto } from '../stores/gps.js';
import { focusGpsPoint, showAllGps } from '../stores/map.js';
import { showToast } from '../stores/ui.js';
import { fmtDay } from '../lib/format.js';

const router = useRouter();
const photoEl = ref(null);
const excelEl = ref(null);
const over = ref(false);
const TYPES = ['Muestra de suelo', 'Muestra de agua', 'Punto de referencia', 'Inicio de transecto', 'Fin de transecto', 'Observación de fauna', 'Observación de flora', 'Punto de control'];

const readLat = computed(() => Number.isFinite(Number(gps.form.lat)) && gps.form.lat !== '' ? Number(gps.form.lat).toFixed(5) : '—');
const readLon = computed(() => Number.isFinite(Number(gps.form.lon)) && gps.form.lon !== '' ? Number(gps.form.lon).toFixed(5) : '—');
const reversed = computed(() => gps.points.slice().reverse());

watch(() => gps.photoReset, () => { if (photoEl.value) photoEl.value.value = ''; });

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
      <div class="page-inner">
        <div class="page-head">
          <div>
            <h1 id="gpsTitle">Captura de puntos de campo</h1>
            <p>Registra puntos manualmente o importa un Excel con latitud y longitud. Los puntos se guardan solo en este navegador hasta que exista el servicio de publicación.</p>
          </div>
        </div>
        <div class="gps-layout">
          <div>
            <div class="panel">
              <div class="panel-head"><div><h2>Registro manual</h2><p>Haz clic en el mapa para tomar coordenadas o escríbelas.</p></div></div>
              <div class="panel-body stack">
                <div class="gps-readout">
                  <div><span>Latitud</span><b>{{ readLat }}</b></div>
                  <div><span>Longitud</span><b>{{ readLon }}</b></div>
                  <div><span>Estado</span><b>Listo</b></div>
                </div>
                <div class="grid2">
                  <div class="field"><label for="manualLat">Latitud</label><input id="manualLat" v-model="gps.form.lat" class="input mono" type="number" step="any" min="14" max="22" :aria-invalid="String(gps.invalid.lat)"></div>
                  <div class="field"><label for="manualLon">Longitud</label><input id="manualLon" v-model="gps.form.lon" class="input mono" type="number" step="any" min="-93" max="-86" :aria-invalid="String(gps.invalid.lon)"></div>
                </div>
                <div class="field"><label for="manualName">Nombre del punto</label><input id="manualName" v-model="gps.form.name" class="input" placeholder="Ej. Muestra de suelo norte"></div>
                <div class="grid2">
                  <div class="field"><label for="manualDate">Fecha</label><input id="manualDate" v-model="gps.form.date" type="date" class="input"></div>
                  <div class="field"><label for="manualTime">Hora</label><input id="manualTime" v-model="gps.form.time" type="time" class="input"></div>
                </div>
                <div class="field"><label for="manualType">Tipo de punto</label>
                  <select id="manualType" v-model="gps.form.type" class="select"><option v-for="t in TYPES" :key="t">{{ t }}</option></select></div>
                <div class="field"><label for="manualDescription">Descripción</label><textarea id="manualDescription" v-model="gps.form.description" class="textarea" rows="3" placeholder="Condiciones del sitio, observaciones"></textarea></div>
                <div class="field"><label for="manualPhoto">Fotografía</label>
                  <input id="manualPhoto" ref="photoEl" type="file" accept="image/*" class="input file-input" @change="selectPhoto($event.target.files?.[0])">
                  <div v-if="gps.form.photo" class="photo-preview"><img :src="gps.form.photo" alt="Vista previa de la fotografía"></div>
                </div>
              </div>
              <div class="panel-foot"><button type="button" class="btn btn-primary" @click="addPoint"><Icon name="map-pin" />Guardar punto</button></div>
            </div>
            <div class="panel">
              <div class="panel-head"><div><h2>Importar Excel</h2><p>Columnas reconocidas: latitud, longitud, nombre, tipo, descripción, fecha, hora y fotografía (URL).</p></div></div>
              <div class="panel-body">
                <input ref="excelEl" type="file" accept=".xls,.xlsx" hidden @change="onExcel($event.target.files?.[0])">
                <div class="dropzone dropzone-sm" :class="{ 'is-over': over }" role="button" tabindex="0"
                  @click="excelEl.click()" @keydown.enter.prevent="excelEl.click()" @keydown.space.prevent="excelEl.click()"
                  @dragover.prevent="over = true" @dragenter.prevent="over = true" @dragleave.prevent="over = false" @drop.prevent="onDrop">
                  <Icon name="file-spreadsheet" class="ic-20" />
                  <strong>Seleccionar archivo Excel</strong><span>.xls o .xlsx</span>
                </div>
              </div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-head">
              <div><h2>Puntos registrados</h2><p>Guardados en este navegador.</p></div>
              <span class="badge">{{ gps.points.length }} {{ gps.points.length === 1 ? 'punto' : 'puntos' }}</span>
            </div>
            <div class="panel-body">
              <ul class="gps-list">
                <li v-for="p in reversed" :key="p.id">
                  <div>
                    <div class="t">{{ p.name }}</div>
                    <div class="s">{{ p.type }} · {{ fmtDay(p.date) }} {{ p.time }}</div>
                    <div class="s mono">{{ Number(p.lat).toFixed(5) }}, {{ Number(p.lon).toFixed(5) }}</div>
                  </div>
                  <button type="button" class="btn btn-quiet btn-sm" @click="focusPoint(p)"><Icon name="map-pin" />Ver</button>
                </li>
                <li v-if="!gps.points.length" class="gps-empty">
                  <div class="empty flush"><strong>Sin puntos registrados</strong>Guarda un punto manual o importa un Excel. Los puntos aparecerán aquí y en el mapa.</div>
                </li>
              </ul>
            </div>
            <div class="panel-foot">
              <button type="button" class="btn btn-secondary" @click="exportCSV"><Icon name="download" />Exportar CSV</button>
              <button type="button" class="btn btn-primary" @click="showAll"><Icon name="map" />Ver en el mapa</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
