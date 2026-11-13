<script setup>
/* Revisión de cargas (solo con sesión). Cada capa enviada desde Carga llega al servidor en cuarentena,
   pasa la segunda revisión automática y espera aquí a que una persona administradora la apruebe y la publique.
   Flujo: en revisión → aprobada → publicada → archivada, con «requiere corrección» para devolverla. */
import { ref, computed, watch, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import KeyValues from '../components/KeyValues.vue';
import PreviewMap from '../components/PreviewMap.vue';
import { session, DEMO_LOCAL } from '../stores/session.js';
import { showToast, confirmAction } from '../stores/ui.js';
import { loadPublished } from '../stores/layers.js';
import { publishSessionLayer } from '../stores/layers.js';
import { markStudyPublished } from '../stores/studies.js';
import { api, hasApi, ApiError } from '../lib/api.js';
import { FIELD_LABELS } from '../lib/study-fields.js';
import { DATASETS } from '../lib/datasets.js';

const FILTERS = [
  ['recibida', 'En proceso'], ['en_revision', 'En revisión'], ['aprobada', 'Aprobadas'], ['requiere_correccion', 'Requieren corrección'],
  ['publicada', 'Publicadas'], ['archivada', 'Archivadas'], ['', 'Todas']
];
const BADGE = { en_revision: 'badge-info', aprobada: 'badge-ok', requiere_correccion: 'badge-err', publicada: 'badge-ok', archivada: '', recibida: 'badge-info' };
const CHECK_ICONS = { ok: 'check-circle-2', warn: 'alert-triangle', err: 'alert-circle', info: 'info', pending: 'clock' };
/* Acción de cada transición: texto del botón, estilo y si pide confirmación */
const ACTIONS = {
  aprobada: { label: 'Aprobar', icon: 'check', cls: 'btn-primary' },
  publicada: { label: 'Publicar', icon: 'send', cls: 'btn-primary', confirm: 'La capa se mostrará en el mapa y el catálogo del geoportal según su clasificación de acceso.' },
  requiere_correccion: { label: 'Devolver para corrección', icon: 'rotate-ccw', cls: 'btn-secondary', nota: true },
  archivada: { label: 'Archivar', icon: 'folder-open', cls: 'btn-quiet danger', nota: true },
  en_revision: { label: 'Reabrir revisión', icon: 'rotate-ccw', cls: 'btn-secondary' }
};
const FORMAT_LABEL = { shp: 'Shapefile', zip: 'ZIP', kmz: 'KMZ', geojson: 'GeoJSON', kml: 'KML', gpx: 'GPX', csv: 'CSV', xlsx: 'Excel', gpkg: 'GeoPackage', geotiff: 'GeoTIFF' };
const fmtLabel = f => FORMAT_LABEL[f] || f || '—';
const ACCION_TEXTO = {
  demo_abierta: 'Capa disponible para revisión local',
  acceso: 'Inició sesión', carga_recibida: 'Carga recibida en cuarentena', carga_en_revision: 'Superó la revisión automática',
  carga_rechazada: 'No superó la revisión automática', carga_aprobada: 'Aprobada', carga_devuelta: 'Devuelta para corrección',
  capa_publicada: 'Publicada', capa_retirada: 'Retirada del geoportal', carga_archivada: 'Archivada', carga_reabierta: 'Revisión reabierta'
};

const filter = ref('en_revision');
const list = ref([]);
const totals = ref({});
const loading = ref(false);
const selectedId = ref(null);
const detail = ref(null);
const geojson = ref(null);
const mapLoading = ref(false);
const mapError = ref('');
const previewDataset = computed(() => DEMO_LOCAL ? DATASETS.find(d => d.id === detail.value?.id) : null);
const nota = ref('');
const busy = ref(false);
const isAdmin = computed(() => session.admin?.rol === 'admin');
const available = hasApi() || DEMO_LOCAL;
const demoStore = async () => (await import('../lib/review-demo.js')).reviewDemo;
const totalCount = computed(() => Object.values(totals.value).reduce((sum, n) => sum + n, 0));
let listRequest = 0;

const errorText = err => (err instanceof ApiError ? err.detalle : DEMO_LOCAL ? err.message : 'No se pudo conectar con el servidor.');
const fmtDateTime = iso => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

async function loadList() {
  if (!available) return;
  const request = ++listRequest;
  loading.value = true;
  try {
    const body = DEMO_LOCAL ? (await demoStore()).list(filter.value) : await api(`/cargas${filter.value ? `?estado=${filter.value}` : ''}`);
    if (request !== listRequest) return;
    list.value = body.cargas;
    totals.value = body.totales;
    if (!list.value.some(c => c.id === selectedId.value)) await select(list.value[0]?.id || null);
  } catch (err) { showToast('error', 'No se cargó la lista', errorText(err)); }
  finally { if (request === listRequest) loading.value = false; }
}

async function select(id) {
  selectedId.value = id;
  detail.value = null; geojson.value = null; nota.value = ''; mapError.value = ''; mapLoading.value = false;
  if (!id) return;
  try {
    const d = DEMO_LOCAL ? (await demoStore()).detail(id) : await api(`/cargas/${id}`);
    if (selectedId.value !== id) return;
    detail.value = d;
    if (d.tieneGeometria) {
      mapLoading.value = true;
      const gj = DEMO_LOCAL ? await (await demoStore()).geometry(id) : await api(`/cargas/${id}/geojson`);
      if (selectedId.value === id) geojson.value = Object.freeze(gj);
    }
  } catch (err) {
    if (selectedId.value === id) { mapError.value = errorText(err); showToast('error', 'No se cargó la capa', errorText(err)); }
  } finally { if (selectedId.value === id) mapLoading.value = false; }
}

async function transition(estado) {
  const a = ACTIONS[estado];
  const d = detail.value;
  if (!d || busy.value || !isAdmin.value || !a || !d.transiciones.includes(estado)) return;
  if (a.nota && !nota.value.trim()) { showToast('info', 'Escribe el motivo', `Para «${a.label.toLowerCase()}» hace falta una nota que verá quien la envió.`); document.getElementById('reviewNote')?.focus(); return; }
  if (a.confirm && !(await confirmAction({ title: `${a.label} «${d.titulo}»`, text: DEMO_LOCAL ? 'La carga cambiará a «Publicada» en esta demostración. No se enviará ni publicará información real.' : a.confirm, ok: a.label }))) return;
  busy.value = true;
  try {
    detail.value = DEMO_LOCAL
      ? (await demoStore()).transition(d.id, estado, nota.value.trim(), session.admin.name)
      : await api(`/cargas/${d.id}/estado`, { method: 'POST', json: { estado, nota: nota.value.trim() } });
    if (DEMO_LOCAL && estado === 'publicada' && d.id.startsWith('manual-')) {
      const studyId = d.id.slice('manual-'.length);
      markStudyPublished(studyId);
      publishSessionLayer(studyId);
    }
    nota.value = '';
    showToast('success', `${detail.value.estadoTexto}${DEMO_LOCAL ? ' · demostración' : ''}`, `«${d.titulo}».`);
    if (!DEMO_LOCAL && (estado === 'publicada' || d.estado === 'publicada')) loadPublished();
    /* La lista pasa al nuevo estado para que la carga siga a la vista */
    if (filter.value && filter.value !== estado) filter.value = estado; else await loadList();
  } catch (err) { showToast('error', 'No se cambió el estado', errorText(err)); }
  finally { busy.value = false; }
}

async function resetDemo() {
  if (!DEMO_LOCAL || busy.value) return;
  if (!(await confirmAction({ title: 'Reiniciar demostración', text: 'Las tres capas de QGIS volverán a «En revisión». Solo se borrarán los cambios de estado de esta demostración; tus archivos originales se conservan.', ok: 'Reiniciar' }))) return;
  (await demoStore()).reset();
  selectedId.value = null;
  if (filter.value !== 'en_revision') filter.value = 'en_revision'; else await loadList();
  showToast('success', 'Demostración reiniciada', 'Las tres capas de QGIS están listas para revisar.');
}

const studyRows = computed(() => {
  const s = detail.value?.estudio || {};
  return ['sTitle', 'sTheme', 'sDate', 'sResp', 'sSource', 'sLic', 'sAccess', 'sKeywords'].map(k => [FIELD_LABELS[k], s[k]]);
});
const dataRows = computed(() => {
  const d = detail.value;
  if (!d) return [];
  return [
    ['Capa', d.capa], ['Formato', fmtLabel(d.formato)], ['Entidades', d.entidades ? d.entidades.toLocaleString('es-MX') : ''], ['Sistema de referencia', d.crs, true],
    ['Extensión (S, N, O, E)', d.bbox ? d.bbox.join(', ') : '', true], [DEMO_LOCAL ? 'Origen de la carga' : 'Enviada por', d.autor], [DEMO_LOCAL ? 'Abierta en demo' : 'Recibida', fmtDateTime(d.creada)],
    ['Revisada por', d.revisor], ['Publicada', d.publicada ? fmtDateTime(d.publicada) : '']
  ];
});
const fmtSize = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

watch(filter, loadList);
onMounted(loadList);
</script>

<template>
  <section class="screen active" aria-labelledby="revTitle">
    <div class="page">
      <div class="page-inner page-wide">
        <div class="page-head">
          <div>
            <h1 id="revTitle">Revisión de cargas</h1>
            <p>Revisa los datos y la ubicación de cada capa. Aprueba las cargas listas para publicar o devuelve las que necesitan una corrección.</p>
          </div>
        </div>

        <div v-if="!available" class="callout info"><Icon name="cloud-off" /><span>Esta versión no tiene servidor de publicación configurado.</span></div>
        <template v-else>
          <div v-if="DEMO_LOCAL" class="callout demo review-demo-banner">
            <Icon name="info" /><span><b>Presentación con tus mapas de QGIS.</b> Geometrías y archivos reales; aprobación y publicación simuladas. Los cambios de estado se reinician al recargar.</span>
            <button type="button" class="btn btn-sm btn-quiet" :disabled="busy || loading" @click="resetDemo"><Icon name="rotate-ccw" />Reiniciar demo</button>
          </div>
          <div class="seg review-filters" role="radiogroup" aria-label="Filtrar por estado">
            <label v-for="[k, t] in FILTERS" :key="k">
              <input v-model="filter" type="radio" name="revFilter" :value="k">{{ t }}
              <span class="count">{{ k ? totals[k] || 0 : totalCount }}</span>
            </label>
          </div>

          <div class="review-grid">
            <section class="panel review-list" aria-labelledby="revListTitle">
              <div class="panel-head"><h2 id="revListTitle">Cargas <span class="review-count">{{ list.length }}</span></h2><Icon v-if="loading" name="loader-2" class="ic-14 ic-spin" /></div>
              <ul v-if="list.length" role="listbox" aria-labelledby="revListTitle">
                <li v-for="c in list" :key="c.id" role="option" :aria-selected="String(c.id === selectedId)" tabindex="0"
                  @click="!busy && select(c.id)" @keydown.enter.prevent="!busy && select(c.id)" @keydown.space.prevent="!busy && select(c.id)">
                  <span class="rl-title">{{ c.titulo }}</span>
                  <span class="rl-meta">{{ fmtLabel(c.formato) }} · {{ c.entidades ? `${c.entidades.toLocaleString('es-MX')} ent.` : 'sin geometría' }} · {{ c.autor || '—' }}</span>
                  <span class="rl-foot"><span class="badge" :class="BADGE[c.estado]">{{ c.estadoTexto }}</span><span class="rl-date">{{ fmtDateTime(c.actualizada) }}</span></span>
                </li>
              </ul>
              <p v-else-if="!loading" class="review-empty">No hay cargas {{ filter ? `en «${FILTERS.find(f => f[0] === filter)[1].toLowerCase()}»` : 'todavía' }}.</p>
            </section>

            <section v-if="detail" class="review-detail" aria-labelledby="revDetailTitle">
              <div class="panel">
                <div class="panel-head">
                  <div>
                    <h2 id="revDetailTitle">{{ detail.titulo }}</h2>
                    <p>{{ detail.tema }} · Acceso {{ detail.acceso || '—' }}</p>
                  </div>
                  <span class="badge" :class="BADGE[detail.estado]">{{ detail.estadoTexto }}</span>
                </div>
                <div class="panel-body">
                  <div v-if="detail.nota" class="callout" :class="detail.estado === 'requiere_correccion' ? 'warn' : 'info'"><Icon name="info" /><span><b>Nota de revisión.</b> {{ detail.nota }}</span></div>
                  <p v-if="mapLoading" class="callout info" role="status"><Icon name="loader-2" class="ic-spin" />Cargando geometrías de la capa…</p>
                  <div v-else-if="mapError" class="callout warn" role="alert"><span>{{ mapError }}</span><button type="button" class="btn btn-sm btn-secondary" @click="select(selectedId)">Reintentar</button></div>
                  <PreviewMap v-if="geojson" class="review-map" :geojson="geojson" :feature-style="previewDataset?.style" />
                  <p v-if="geojson && DEMO_LOCAL" class="review-map-caption">{{ detail.source }} · {{ detail.entidades.toLocaleString('es-MX') }} entidades · {{ detail.resolucion }}</p>
                  <div v-if="geojson && previewDataset?.legend" class="review-legend">
                    <span>{{ previewDataset.legend.title }}</span>
                    <ul><li v-for="[color, label] in previewDataset.legend.items" :key="label"><i :style="{ backgroundColor: color }" aria-hidden="true"></i>{{ label }}</li></ul>
                  </div>
                  <div class="review-cols">
                    <div><h3 class="dsec">Estudio</h3><KeyValues :rows="studyRows" /><p v-if="detail.estudio.sDesc" class="review-desc">{{ detail.estudio.sDesc }}</p></div>
                    <div><h3 class="dsec">Datos</h3><KeyValues :rows="dataRows" /></div>
                  </div>
                  <h3 class="dsec">{{ DEMO_LOCAL ? 'Comprobación de archivos locales' : 'Revisión del servidor' }}</h3>
                  <ul class="check-list">
                    <li v-for="(c, i) in detail.revision" :key="i" :data-s="c[0]"><Icon :name="CHECK_ICONS[c[0]] || 'info'" /><div>{{ c[1] }}<span v-if="c[2]">{{ c[2] }}</span></div></li>
                  </ul>
                  <h3 class="dsec">{{ DEMO_LOCAL ? 'Archivos originales · carpeta QGIS' : 'Archivos en cuarentena' }}</h3>
                  <ul class="review-files">
                    <li v-for="a in detail.archivos" :key="a.nombre"><Icon name="file" class="ic-14" /><span class="mono">{{ a.nombre }}</span><span>{{ fmtSize(a.tam) }}</span></li>
                  </ul>
                  <h3 class="dsec">Historial</h3>
                  <ol class="review-history">
                    <li v-for="(h, i) in detail.historial" :key="i">
                      <b>{{ ACCION_TEXTO[h.accion] || h.accion }}</b>
                      <span>{{ fmtDateTime(h.fecha) }}{{ h.usuario ? ` · ${h.usuario}` : '' }}{{ h.detalle?.nota ? ` · «${h.detalle.nota}»` : '' }}</span>
                    </li>
                  </ol>
                </div>
                <div v-if="isAdmin && detail.transiciones.length" class="panel-foot review-actions">
                  <div class="field review-note">
                    <label for="reviewNote">Nota (obligatoria para devolver o archivar)</label>
                    <textarea id="reviewNote" v-model="nota" class="textarea" maxlength="2000" rows="2" placeholder="Por ejemplo: falta la fuente original del levantamiento"></textarea>
                  </div>
                  <div class="review-buttons">
                    <button v-for="t in detail.transiciones" :key="t" type="button" class="btn btn-sm" :class="ACTIONS[t].cls" :disabled="busy" @click="transition(t)">
                      <Icon :name="ACTIONS[t].icon" />{{ ACTIONS[t].label }}
                    </button>
                  </div>
                </div>
                <div v-else-if="!isAdmin" class="panel-foot"><span class="review-empty">Solo una persona administradora puede aprobar o publicar.</span></div>
              </div>
            </section>
            <div v-else class="panel review-detail review-empty" role="status">{{ loading ? 'Cargando revisión…' : list.length ? 'Elige una carga para revisarla.' : 'No hay cargas en este estado. Selecciona otro filtro para continuar.' }}</div>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.review-demo-banner { align-items: center; margin-bottom: var(--s-5); }
.review-demo-banner > span { flex: 1; }
.review-demo-banner .btn { flex: none; color: inherit; }
.review-count { margin-left: var(--s-2); color: var(--text-3); font-weight: 400; font-variant-numeric: tabular-nums; }
.review-detail .panel-body > .review-map-caption { margin-top: var(--s-2); font-size: var(--fs-12); color: var(--text-3); }
.review-files .mono { overflow-wrap: anywhere; min-width: 0; }
.review-list li:focus-visible { outline: 2px solid var(--navy-700); outline-offset: -2px; }
.review-list .rl-foot { flex-wrap: wrap; }
.review-legend { font-size: var(--fs-12); color: var(--text-2); }
.review-legend > span { font-weight: 600; }
.review-legend ul { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); padding: 0; margin: var(--s-2) 0 0; list-style: none; }
.review-legend li { display: inline-flex; align-items: center; gap: var(--s-2); }
.review-legend i { width: 14px; height: 14px; flex: none; border: 1px solid var(--line-strong); border-radius: 2px; }
@media (max-width: 640px) {
  .review-demo-banner { flex-wrap: wrap; }
  .review-demo-banner > span { flex-basis: calc(100% - 40px); }
  .review-demo-banner .btn { margin-left: 28px; }
  .review-detail .panel-head { flex-wrap: wrap; }
}
</style>
