<script setup>
/* Excel importados en Captura GPS: cada uno se puede abrir como tabla, editar fila por fila y eliminar completo. */
import { ref, reactive, computed, watch } from 'vue';
import Icon from './Icon.vue';
import { gps, pointsOfImport, updateImportedPoint, deleteImportedPoint, deleteImport } from '../stores/gps.js';
import { fmtDay } from '../lib/format.js';

const props = defineProps({ only: { type: String, default: '' } });   // con `only`, muestra solo ese Excel, ya abierto
const openId = ref(props.only || null);
watch(() => props.only, id => { openId.value = id || null; limit.value = 100; Object.keys(drafts).forEach(k => delete drafts[k]); });
const limit = ref(100);
const drafts = reactive({});
const saving = ref('');

/* Solo los conjuntos que aún tienen puntos */
const imports = computed(() => gps.imports.filter(i => !props.only || i.id === props.only).map(i => ({ ...i, points: pointsOfImport(i) })).filter(i => i.points.length));
const current = computed(() => imports.value.find(i => i.id === openId.value) || null);
const rows = computed(() => (current.value ? current.value.points.slice(0, limit.value) : []));
const hidden = computed(() => (current.value ? Math.max(0, current.value.points.length - limit.value) : 0));

const toDraft = p => ({ name: p.name, lon: String(p.lon), lat: String(p.lat), altitude: p.altitude == null ? '' : String(p.altitude), property: p.property || '', author: p.author || '' });
const draftOf = p => (drafts[p.id] ||= toDraft(p));
const dirty = p => {
  const d = draftOf(p), o = toDraft(p);
  return Object.keys(o).some(k => d[k] !== o[k]);
};

function toggle(id) {
  openId.value = openId.value === id ? null : id;
  limit.value = 100;
  Object.keys(drafts).forEach(k => delete drafts[k]);
}

async function save(p) {
  saving.value = p.id;
  try {
    if (await updateImportedPoint(openId.value, p.id, draftOf(p))) {
      delete drafts[p.id];
    }
  } finally { saving.value = ''; }
}
function reset(p) { delete drafts[p.id]; }
async function removeRow(p) { await deleteImportedPoint(openId.value, p.id); delete drafts[p.id]; }
async function removeAll(i) { if (await deleteImport(i.id) && openId.value === i.id) openId.value = null; }
</script>

<template>
  <section v-if="imports.length" class="gps-imports" :class="{ panel: !only, embedded: !!only }" :aria-labelledby="only ? null : 'gpsImpTitle'">
    <div v-if="!only" class="panel-head">
      <div>
        <h2 id="gpsImpTitle">Excel importados</h2>
        <p>Abre un Excel para ver sus filas, corregirlas o quitarlas. Si su capa aún está en Carga, se actualiza sola.</p>
      </div>
      <span class="badge">{{ imports.length }}</span>
    </div>

    <ul class="imp-list">
      <li v-for="i in imports" :key="i.id" class="imp-item" :data-open="String(i.id === openId)">
        <div class="imp-row">
          <Icon name="file-spreadsheet" class="ic-20" />
          <div class="imp-info">
            <b>{{ i.name }}</b>
            <span>{{ i.points.length.toLocaleString('es-MX') }} {{ i.points.length === 1 ? 'punto' : 'puntos' }}<template v-if="i.date"> · importado el {{ fmtDay(i.date) }}</template></span>
          </div>
          <div class="imp-actions">
            <button v-if="!only" type="button" class="btn btn-secondary btn-sm" :aria-expanded="String(i.id === openId)" @click="toggle(i.id)">
              <Icon :name="i.id === openId ? 'chevron-down' : 'table-2'" />{{ i.id === openId ? 'Cerrar' : 'Ver y editar' }}
            </button>
            <button type="button" class="btn btn-quiet btn-sm danger" :aria-label="`Eliminar el Excel ${i.name}`" @click="removeAll(i)"><Icon name="trash-2" />Eliminar</button>
          </div>
        </div>

        <div v-if="i.id === openId" class="imp-table-wrap">
          <table class="imp-table">
            <thead>
              <tr><th>Name</th><th>X (longitud)</th><th>Y (latitud)</th><th>Altitud (m)</th><th>Predio</th><th>Autor</th><th><span class="sr-only">Acciones</span></th></tr>
            </thead>
            <tbody>
              <tr v-for="p in rows" :key="p.id" :data-dirty="String(dirty(p))">
                <td><input v-model="draftOf(p).name" class="input" maxlength="120" :aria-label="`Nombre de ${p.name}`" @keydown.enter.prevent="dirty(p) && save(p)"></td>
                <td><input v-model="draftOf(p).lon" class="input mono" inputmode="decimal" :aria-label="`Longitud de ${p.name}`" @keydown.enter.prevent="dirty(p) && save(p)"></td>
                <td><input v-model="draftOf(p).lat" class="input mono" inputmode="decimal" :aria-label="`Latitud de ${p.name}`" @keydown.enter.prevent="dirty(p) && save(p)"></td>
                <td><input v-model="draftOf(p).altitude" class="input mono" inputmode="decimal" :aria-label="`Altitud de ${p.name}`" @keydown.enter.prevent="dirty(p) && save(p)"></td>
                <td><input v-model="draftOf(p).property" class="input" maxlength="120" :aria-label="`Predio de ${p.name}`" @keydown.enter.prevent="dirty(p) && save(p)"></td>
                <td><input v-model="draftOf(p).author" class="input" maxlength="120" :aria-label="`Autor de ${p.name}`" @keydown.enter.prevent="dirty(p) && save(p)"></td>
                <td class="imp-cell-actions">
                  <template v-if="dirty(p)">
                    <button type="button" class="icon-btn" :disabled="saving === p.id" :aria-label="`Guardar los cambios de ${p.name}`" data-tip="Guardar" @click="save(p)"><Icon name="check" /></button>
                    <button type="button" class="icon-btn" :aria-label="`Descartar los cambios de ${p.name}`" data-tip="Descartar" @click="reset(p)"><Icon name="rotate-ccw" /></button>
                  </template>
                  <button v-else type="button" class="icon-btn danger" :aria-label="`Eliminar la fila ${p.name}`" data-tip="Eliminar fila" @click="removeRow(p)"><Icon name="trash-2" /></button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="hidden" class="imp-more"><button type="button" class="btn btn-quiet btn-sm" @click="limit += 100">Mostrar {{ Math.min(100, hidden) }} más ({{ hidden.toLocaleString('es-MX') }} sin mostrar)</button></div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.embedded .imp-item { border-top: 0; }
.embedded .imp-table-wrap { max-height: 460px; }
.imp-list { list-style: none; margin: 0; padding: 0; }
.imp-item { border-top: 1px solid var(--line); }
.imp-row { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-4); flex-wrap: wrap; }
.imp-info { flex: 1; min-width: 160px; display: grid; gap: 2px; }
.imp-info b { font-size: var(--fs-14); overflow-wrap: anywhere; }
.imp-info span { font-size: var(--fs-12); color: var(--text-3); }
.imp-actions { display: flex; gap: var(--s-2); }
.imp-table-wrap { max-height: 380px; overflow: auto; border-top: 1px solid var(--line); background: var(--surface-2); }
.imp-table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: var(--fs-12); }
.imp-table th { position: sticky; top: 0; z-index: 1; padding: 6px 8px; background: var(--surface-3); text-align: left; font-weight: 600; color: var(--text-2); }
.imp-table td { padding: 4px 6px; border-bottom: 1px solid var(--line); }
.imp-table .input { min-width: 0; width: 100%; padding: 4px 6px; font-size: var(--fs-12); }
.imp-table tr[data-dirty="true"] { background: var(--warn-bg); }
.imp-cell-actions { white-space: nowrap; width: 76px; }
.imp-more { padding: var(--s-2); text-align: center; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
