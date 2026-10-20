<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue';
import Icon from '../components/Icon.vue';
import PreviewMap from '../components/PreviewMap.vue';
import StudyDialog from '../components/StudyDialog.vue';
import {
  batch, study, studyComplete, FORMATS, STATES, BUSY, sizeOf, addFiles, selectItem, removeItem, clearWithConfirm,
  declareCrs, updateMapping, confirmMapping, viewOnMap, openStudy, sendBatch, hasApi
} from '../stores/upload.js';
import { fmtSize } from '../lib/format.js';

const fileEl = ref(null);
const listEl = ref(null);
const pick = () => fileEl.value.click();
function onFiles(e) { addFiles(e.target.files); e.target.value = ''; }

const items = computed(() => batch.items);
const it = computed(() => batch.items.find(x => x.id === batch.selected) || null);
const fmt = x => FORMATS[x.format] || { label: 'No admitido', icon: 'file' };
const plural = (k, a, b) => `${k} ${k === 1 ? a : b}`;

const counts = computed(() => {
  const c = {};
  batch.items.forEach(x => { c[x.state] = (c[x.state] || 0) + 1; });
  return c;
});

/* Franja del proceso: cada paso refleja el estado real del lote.
   Los pasos que dependen del servidor dicen «no configurado» si no hay API. */
const steps = computed(() => {
  const c = counts.value, n = batch.items.length, api = hasApi();
  const reading = c.reading || 0, checking = c.checking || 0;
  const issues = (c.blocked || 0) + (c.input || 0);
  const passed = (c.ready || 0) + (c.server || 0) + (c.sending || 0) + (c.sent || 0) + (c.failed || 0);
  return [
    ['Selección', 'done', plural(n, 'capa en el lote', 'capas en el lote')],
    reading ? ['Lectura', 'current', `Leyendo ${reading} de ${n}`] : ['Lectura', 'done', `${plural(n, 'leída', 'leídas')} en este equipo`],
    reading || checking ? ['Validación', reading && !checking ? 'pending' : 'current', checking ? `Validando ${checking}` : 'En espera de la lectura']
      : issues ? ['Validación', 'attention', `${plural(passed, 'correcta', 'correctas')} · ${issues} por corregir`] : ['Validación', 'done', plural(passed, 'correcta', 'correctas')],
    !api ? ['Procesamiento', 'off', 'Servidor no configurado']
      : c.sending ? ['Procesamiento', 'current', `Enviando ${c.sending}`]
      : c.sent ? ['Procesamiento', 'done', `${c.sent} en cuarentena`] : ['Procesamiento', 'pending', 'Al enviar el lote'],
    !api ? ['Revisión', 'off', 'Requiere servidor'] : c.sent ? ['Revisión', 'current', 'Pendiente del administrador'] : ['Revisión', 'pending', 'El administrador aprueba'],
    ['Publicación', api ? 'pending' : 'off', 'Solo con aprobación']
  ];
});

const summary = computed(() => [['ready', 'listas'], ['input', 'requieren datos'], ['blocked', 'con errores'], ['server', 'para el servidor'], ['sent', 'recibidas'], ['failed', 'no enviadas']]
  .filter(([k]) => counts.value[k]).map(([k, t]) => ({ k, n: counts.value[k], t })));
const sendable = computed(() => batch.items.filter(x => ['ready', 'server', 'failed'].includes(x.state)).length);
const sendDisabled = computed(() => !sendable.value || batch.items.some(x => BUSY.includes(x.state)));

/* Detalle del archivo seleccionado */
const CHECK_ICONS = { ok: 'check-circle-2', warn: 'alert-triangle', err: 'alert-circle', info: 'info', pending: 'clock' };
const busy = computed(() => it.value && ['reading', 'checking'].includes(it.value.state));
const fields = computed(() => it.value?.geojson ? [...new Set(it.value.geojson.features.slice(0, 500).flatMap(f => Object.keys(f.properties || {})))] : []);
const types = computed(() => it.value?.geojson ? [...new Set(it.value.geojson.features.map(f => f.geometry?.type).filter(Boolean))] : []);
const rows = computed(() => it.value?.geojson ? it.value.geojson.features.slice(0, 100) : []);
const canView = computed(() => it.value?.geojson && !it.value.issues.length && it.value.geojson.features.length);

/* Solo se anima lo que cambió: una capa nueva o un cambio de estado */
const fx = reactive({});
const seen = new Map();
let primed = false;
watch(() => batch.items.map(x => `${x.id}:${x.state}`).join('|'), () => {
  batch.items.forEach(x => {
    const before = seen.get(x.id);
    seen.set(x.id, x.state);
    if (!primed || before === x.state) return;
    fx[x.id] = before === undefined ? 'new' : 'state';
    setTimeout(() => { delete fx[x.id]; }, 260);
  });
  primed = true;
}, { immediate: true });

const entering = ref(false);
watch(() => batch.selected, () => { entering.value = false; requestAnimationFrame(() => { entering.value = true; }); });

function listKeys(e) {
  const ids = batch.items.map(x => x.id);
  const i = ids.indexOf(batch.selected);
  let n = null;
  if (e.key === 'ArrowDown') n = ids[Math.min(ids.length - 1, i + 1)];
  if (e.key === 'ArrowUp') n = ids[Math.max(0, i - 1)];
  if (n) { e.preventDefault(); selectItem(n); nextTick(() => listEl.value?.querySelector(`[data-id="${n}"]`)?.focus()); }
  if (e.key === 'Delete' && i >= 0) removeItem(batch.selected);
}

/* Arrastrar archivos a cualquier parte de la pantalla de carga */
let depth = 0;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
function dragEnter(e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; batch.dragging = true; }
function dragOver(e) { if (hasFiles(e)) e.preventDefault(); }
function dragLeave() { depth = Math.max(0, depth - 1); if (!depth) batch.dragging = false; }
function drop(e) { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; batch.dragging = false; addFiles(e.dataTransfer.files); }
</script>

<template>
  <section id="screen-carga" class="screen active" aria-labelledby="uploadTitle" @dragenter="dragEnter" @dragover="dragOver" @dragleave="dragLeave" @drop="drop">
    <div class="ingest" :class="{ 'is-dragging': batch.dragging }" :data-empty="String(!items.length)">
      <header class="ingest-head">
        <div class="ingest-title">
          <h1 id="uploadTitle">Carga de datos</h1>
          <p>Los archivos se leen y validan en este navegador. Nada se publica hasta que el servidor confirme la recepción y el administrador designado apruebe la publicación.</p>
        </div>
        <div class="ingest-actions">
          <button type="button" class="study-chip" aria-haspopup="dialog" @click="openStudy">
            <Icon name="book-open" />
            <span><span class="k">Estudio</span><b>{{ study.sTitle || 'Sin definir' }}</b></span>
            <span class="badge" :class="studyComplete() ? 'badge-ok' : 'badge-warn'">{{ studyComplete() ? 'Completo' : 'Incompleto' }}</span>
          </button>
          <button type="button" class="btn btn-primary" @click="pick"><Icon name="plus" />Agregar archivos</button>
          <input ref="fileEl" type="file" multiple hidden
            accept=".zip,.shp,.shx,.dbf,.prj,.cpg,.qpj,.xml,.gpkg,.geojson,.json,.kml,.kmz,.gpx,.csv,.xlsx,.xls,.tif,.tiff" @change="onFiles">
        </div>
      </header>

      <ol v-if="items.length" class="pipeline" aria-label="Estado del proceso de carga">
        <li v-for="([t, st, sub], i) in steps" :key="t" :data-state="st" :aria-current="st === 'current' ? 'step' : null">
          <span class="pn" aria-hidden="true">
            <Icon v-if="st === 'done'" name="check" class="ic-14" />
            <Icon v-else-if="st === 'attention'" name="alert-triangle" class="ic-14" />
            <Icon v-else-if="st === 'current'" name="loader-2" class="ic-14 ic-spin" />
            <span v-else>{{ i + 1 }}</span>
          </span>
          <span class="pt"><b>{{ t }}</b><span>{{ sub }}</span></span>
        </li>
      </ol>

      <!-- Sin archivos -->
      <div v-if="!items.length" class="ingest-empty">
        <div class="dropzone dropzone-lg" role="button" tabindex="0" aria-describedby="dzHelp" @click="pick" @keydown.enter.prevent="pick" @keydown.space.prevent="pick">
          <Icon name="file-up" class="ic-20" />
          <strong>Arrastra los archivos del estudio o selecciónalos</strong>
          <span id="dzHelp">Puedes soltar varios a la vez. Los componentes de un Shapefile (.shp, .shx, .dbf, .prj) se agrupan solos en una capa.</span>
          <div class="formats">
            <span class="badge">Shapefile</span><span class="badge">ZIP</span><span class="badge">GeoJSON</span><span class="badge">KML / KMZ</span>
            <span class="badge">GPX</span><span class="badge">CSV / XLSX</span><span class="badge">GeoPackage</span><span class="badge">GeoTIFF</span>
          </div>
        </div>
        <ol class="flow" aria-label="Proceso de carga">
          <li><b>Lectura local</b><span>El archivo no sale de tu equipo mientras lo revisas.</span></li>
          <li><b>Validación</b><span>Contenido real, componentes, sistema de referencia y coordenadas.</span></li>
          <li><b>Vista previa</b><span>Geometrías en el mapa y tabla de atributos.</span></li>
          <li><b>Envío a revisión</b><span>El servidor recibe el lote en cuarentena; el administrador aprueba la publicación.</span></li>
        </ol>
      </div>

      <!-- Lote en curso -->
      <div v-else class="ingest-work">
        <aside class="batch" aria-labelledby="batchTitle">
          <div class="batch-head">
            <h2 id="batchTitle">Lote <span class="count">{{ items.length }}</span></h2>
            <button type="button" class="icon-btn" data-tip="Vaciar el lote" aria-label="Vaciar el lote" @click="clearWithConfirm"><Icon name="x" /></button>
          </div>
          <ul ref="listEl" class="batch-list" role="listbox" aria-label="Capas del lote" @keydown="listKeys">
            <li v-for="x in items" :key="x.id" role="option" class="bitem" :data-id="x.id" :data-state="x.state" :data-fx="fx[x.id] || null"
              :aria-selected="String(batch.selected === x.id)" :tabindex="batch.selected === x.id ? 0 : -1" @click="selectItem(x.id)">
              <span class="bicon"><Icon :name="fmt(x).icon" /></span>
              <span class="bmain">
                <span class="bname">{{ x.layerName }}</span>
                <span class="bmeta">{{ fmt(x).label }}{{ x.zipped ? ' en ZIP' : '' }} · {{ fmtSize(sizeOf(x)) }}{{ x.geojson ? ` · ${x.geojson.features.length.toLocaleString('es-MX')} ent.` : '' }}</span>
                <span v-if="x.state === 'reading'" class="progress" role="progressbar" :aria-label="`Lectura de ${x.layerName}`" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(x.progress * 100)">
                  <i :style="{ '--p': x.progress }"></i>
                </span>
              </span>
              <span class="badge" :class="STATES[x.state]?.[1]"><Icon v-if="BUSY.includes(x.state)" name="loader-2" class="ic-14 ic-spin" />{{ STATES[x.state]?.[0] || x.state }}</span>
            </li>
          </ul>
          <button type="button" class="batch-add" @click="pick"><Icon name="plus" />Agregar o soltar más archivos</button>
          <div class="batch-foot">
            <div class="batch-summary" aria-live="polite">
              <span v-for="s in summary" :key="s.k" :data-state="s.k"><b>{{ s.n }}</b> {{ s.t }}</span>
              <span v-if="!summary.length">Procesando…</span>
            </div>
            <button type="button" class="btn btn-primary btn-block" :disabled="sendDisabled" @click="sendBatch">
              <Icon name="send" />Enviar a revisión{{ sendable ? ` (${sendable})` : '' }}
            </button>
          </div>
        </aside>

        <div class="item-detail" :class="{ 'is-entering': entering }" aria-live="polite">
          <div v-if="!it" class="empty detail-empty">Selecciona una capa del lote para ver su validación.</div>
          <template v-else>
            <header class="dhead">
              <span class="bicon lg"><Icon :name="fmt(it).icon" /></span>
              <div class="dtitle">
                <label class="sr-only" for="layerNameInput">Nombre de la capa</label>
                <input id="layerNameInput" v-model="it.layerName" class="dname" spellcheck="false">
                <div class="dmeta">{{ fmt(it).label }}{{ it.zipped ? ' en ZIP' : '' }} · {{ fmtSize(sizeOf(it)) }}<template v-if="it.crs"> · <span class="mono">{{ it.crs }}</span></template></div>
              </div>
              <span class="badge" :class="STATES[it.state]?.[1]"><Icon v-if="BUSY.includes(it.state)" name="loader-2" class="ic-14 ic-spin" />{{ STATES[it.state]?.[0] }}</span>
              <div class="dactions">
                <button type="button" class="btn btn-quiet btn-sm" @click="removeItem(it.id)"><Icon name="x" />Quitar</button>
                <button type="button" class="btn btn-secondary btn-sm" :disabled="!canView" @click="viewOnMap(it.id)"><Icon name="layers" />Ver en el mapa</button>
              </div>
            </header>

            <div v-if="it.message" class="dmsg">
              <Icon :name="it.message.icon" />
              <span><template v-for="([kind, text], i) in it.message.parts" :key="i"><b v-if="kind === 'b'">{{ text }}</b><code v-else-if="kind === 'code'">{{ text }}</code><template v-else>{{ text }}</template></template></span>
            </div>

            <div class="dgrid">
              <section class="dcol" aria-labelledby="valTitle">
                <h3 id="valTitle" class="dsec">Validación</h3>
                <div v-if="busy" class="skeleton-list"><span></span><span></span><span></span></div>
                <ul v-else class="check-list">
                  <li v-for="(c, i) in it.checks" :key="i" :data-s="c[0]"><Icon :name="CHECK_ICONS[c[0]]" /><div>{{ c[1] }}<span v-if="c[2]">{{ c[2] }}</span></div></li>
                </ul>

                <div v-if="it.format === 'shp' && it.needsCrs" class="field dcard">
                  <span id="crsPickL" class="label">Sistema de referencia del Shapefile</span>
                  <div class="seg" role="radiogroup" aria-labelledby="crsPickL">
                    <label><input type="radio" name="shpCrs" value="geo" @change="declareCrs(it.id, 'geo')"> WGS 84 · grados</label>
                    <label><input type="radio" name="shpCrs" value="15" @change="declareCrs(it.id, '15')"> UTM 15N</label>
                    <label><input type="radio" name="shpCrs" value="16" @change="declareCrs(it.id, '16')"> UTM 16N</label>
                  </div>
                  <span class="hint">Usa el sistema documentado por la fuente del estudio. El datum se asume WGS 84.</span>
                </div>

                <div v-if="it.table && it.mapping" class="dcard stack mapping">
                  <div class="grid2">
                    <div class="field"><label for="colX">Columna X (longitud o Este)</label>
                      <select id="colX" v-model.number="it.mapping.x" class="select" @change="updateMapping(it.id)"><option v-for="(h, i) in it.table.headers" :key="i" :value="i">{{ h }}</option></select></div>
                    <div class="field"><label for="colY">Columna Y (latitud o Norte)</label>
                      <select id="colY" v-model.number="it.mapping.y" class="select" @change="updateMapping(it.id)"><option v-for="(h, i) in it.table.headers" :key="i" :value="i">{{ h }}</option></select></div>
                  </div>
                  <div class="field"><span id="tblCrsL" class="label">Sistema de referencia</span>
                    <div class="seg" role="radiogroup" aria-labelledby="tblCrsL">
                      <label v-for="[v, t] in [['wgs84', 'WGS 84 · grados'], ['utm15', 'UTM 15N'], ['utm16', 'UTM 16N']]" :key="v">
                        <input v-model="it.mapping.crs" type="radio" name="tblCrs" :value="v" @change="updateMapping(it.id)"> {{ t }}
                      </label>
                    </div></div>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="it.mapping.confirmed" @click="confirmMapping(it.id)">
                    <Icon name="check" />{{ it.mapping.confirmed ? 'Columnas confirmadas' : 'Confirmar columnas' }}
                  </button>
                </div>

                <div v-if="it.issues.length" class="callout err issues">
                  <Icon name="alert-circle" />
                  <div>
                    <b>{{ it.issues.length === 1 ? '1 fila no se puede ubicar' : `${it.issues.length.toLocaleString('es-MX')} filas no se pueden ubicar` }}.</b>
                    Una fila inválida bloquea la capa; no se descartan filas en silencio.
                    <ul><li v-for="(x, i) in it.issues.slice(0, 6)" :key="i">{{ x }}</li></ul>
                    <template v-if="it.issues.length > 6">…y {{ it.issues.length - 6 }} más.</template>
                  </div>
                </div>
              </section>

              <section class="dcol dpreview" aria-labelledby="prevTitle">
                <h3 id="prevTitle" class="dsec">Vista previa
                  <span v-if="it.geojson" class="dsub">{{ it.geojson.features.length.toLocaleString('es-MX') }} entidades · {{ types.join(', ') || '—' }} · {{ fields.length }} campos</span>
                </h3>
                <PreviewMap v-if="it.geojson" :key="it.id" :geojson="it.geojson" />
                <div v-else class="preview-map"><div class="pm-empty">{{ busy ? 'Leyendo geometrías…' : it.state === 'server' ? 'La vista previa de este formato la genera el servidor.' : 'Sin geometrías para mostrar.' }}</div></div>
                <template v-if="it.geojson && fields.length">
                  <div class="table-scroll">
                    <table class="attr-table">
                      <thead><tr><th v-for="k in fields" :key="k">{{ k }}</th></tr></thead>
                      <tbody><tr v-for="(f, i) in rows" :key="i"><td v-for="k in fields" :key="k">{{ f.properties?.[k] ?? '' }}</td></tr></tbody>
                    </table>
                  </div>
                  <p v-if="it.geojson.features.length > 100" class="dnote">Se muestran las primeras 100 filas de {{ it.geojson.features.length.toLocaleString('es-MX') }}.</p>
                </template>
              </section>
            </div>
          </template>
        </div>
      </div>
      <div class="drop-veil" aria-hidden="true"><span><Icon name="file-up" class="ic-20" />Suelta para agregar al lote</span></div>
    </div>
    <StudyDialog />
  </section>
</template>
