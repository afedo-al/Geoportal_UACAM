<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import Icon from './Icon.vue';
import KeyValues from './KeyValues.vue';
import { ui, setDock } from '../stores/ui.js';
import { layers, entryById, showLayerInfo, zoomToLayer, exportMeta, copyCitation, styleConfigOf, styleFields, saveLayerStyle } from '../stores/layers.js';
import { fmtDate } from '../lib/format.js';
import { moveInk, tabKeys, useSheet } from '../lib/ui-helpers.js';

const dock = ref(null);
const tabsEl = ref(null);
const entering = ref(null);
const sheet = useSheet('right', () => dock.value);
const TABS = [['info', 'Información'], ['style', 'Simbología'], ['attrs', 'Atributos'], ['meta', 'Metadatos']];

const e = computed(() => entryById(layers.selected));
const m = computed(() => e.value?.metaRecord);
const f = computed(() => layers.feature?.layer === layers.selected ? layers.feature : null);
const access = computed(() => m.value?.access || (m.value?.estatus === 'Completo' ? 'Pública' : 'Interna'));
const statusClass = computed(() => ['Completo', 'Publicada'].includes(m.value?.estatus) ? 'badge-ok' : 'badge-warn');
const styleDraft = ref({ ...styleConfigOf(e.value) });
const numericFields = computed(() => styleFields(e.value));
const styleSaving = ref(false);
watch(() => e.value?.id, () => { styleDraft.value = { ...styleConfigOf(e.value) }; });
watch(() => styleDraft.value.mode, mode => { if (mode === 'density' && !styleDraft.value.field) styleDraft.value.field = numericFields.value[0] || ''; });
async function applyStyle() {
  if (!e.value) return;
  styleSaving.value = true;
  await saveLayerStyle(e.value.id, styleDraft.value);
  styleSaving.value = false;
}

function setTab(t) { layers.tab = t; }
watch(() => layers.tab, t => {
  nextTick(() => moveInk(tabsEl.value));
  entering.value = null;
  requestAnimationFrame(() => { entering.value = t; });
});
watch(() => ui.docks.right, open => { if (open) nextTick(() => moveInk(tabsEl.value)); });
/* Con el panel cerrado no hay nada que medir: al abrirlo lo hace el watch de arriba */
const inkIfOpen = () => { if (ui.docks.right) moveInk(tabsEl.value); };
onMounted(() => { inkIfOpen(); document.fonts?.ready.then(inkIfOpen); });

function close() {
  setDock('right', false);
  nextTick(() => document.querySelector('[data-dock-open="right"]')?.focus({ preventScroll: true }));
}
</script>

<template>
  <section id="propsDock" ref="dock" class="dock dock-right" :inert="!ui.docks.right && !sheet.moving.value" aria-labelledby="propsTitle">
    <div class="dock-head" v-on="sheet.handlers">
      <span class="sheet-grip" aria-hidden="true"></span>
      <h2 id="propsTitle"><Icon name="info" />Propiedades</h2>
      <button type="button" class="icon-btn sheet-size" :aria-label="sheet.expanded.value ? 'Reducir el panel' : 'Expandir el panel'" :aria-expanded="String(sheet.expanded.value)" @click="sheet.toggleSize()">
        <Icon name="chevron-down" :class="{ 'is-up': !sheet.expanded.value }" />
      </button>
      <button type="button" class="icon-btn" data-tip="Ocultar propiedades" aria-label="Ocultar panel de propiedades" @click="close">
        <Icon name="panel-right" class="ic-desk" /><Icon name="x" class="ic-sheet" />
      </button>
    </div>
    <div ref="tabsEl" class="tabs" role="tablist" aria-label="Propiedades de la selección" @keydown="tabKeys($event, TABS.map(t => t[0]), layers.tab, setTab)">
      <button v-for="[k, label] in TABS" :key="k" type="button" role="tab" :data-tab="k" :id="`tab-${k}`" :aria-controls="`side-${k}`"
        :aria-selected="String(layers.tab === k)" :tabindex="layers.tab === k ? 0 : -1" @click="setTab(k)">{{ label }}</button>
      <span class="tab-ink" aria-hidden="true"></span>
    </div>
    <div class="dock-body">
      <template v-if="!e">
        <div v-for="[k] in TABS" v-show="layers.tab === k" :key="k" :id="`side-${k}`" class="tabpanel" role="tabpanel" :aria-labelledby="`tab-${k}`">
          <div class="empty flush"><strong>Nada seleccionado</strong><span>Elige una capa en el panel de capas o usa <Icon name="crosshair" class="ic-14" /> Identificar sobre el mapa.</span></div>
        </div>
      </template>
      <template v-else>
        <!-- Información -->
        <div v-show="layers.tab === 'info'" id="side-info" class="tabpanel" :class="{ 'is-entering': entering === 'info' }" role="tabpanel" aria-labelledby="tab-info">
          <h3 class="prop-title">{{ e.name }}</h3>
          <div class="prop-sub">
            <span v-if="e.kind === 'session'" class="badge badge-info">Sesión · no publicada</span>
            <span v-if="m" class="badge" :class="statusClass">{{ m.estatus }}</span>
          </div>
          <p class="prop-desc">{{ m?.resumen }}</p>
          <template v-if="e.def?.legend">
            <div class="section-label">Simbología</div>
            <p class="prop-desc legend-title">{{ e.def.legend.title }}</p>
            <ul class="legend-list">
              <li v-for="[c, t] in e.def.legend.items" :key="t"><span class="swatch" :style="{ background: c }"></span>{{ t }}</li>
            </ul>
          </template>
          <p v-if="e.geojson" class="prop-desc count-note">{{ e.count.toLocaleString('es-MX') }} entidades cargadas.</p>
          <div class="section-label">Ficha</div>
          <KeyValues :rows="[['Responsable', m?.resp], ['Fuente', m?.fuente], ['Actualización', fmtDate(m?.act)], ['Escala', m?.escala], ['Formato', m?.formato], ['Sistema de referencia', m?.crs, true]]" />
          <div class="prop-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="showLayerInfo(e.id)"><Icon name="file-text" />Ficha completa</button>
            <button type="button" class="btn btn-quiet btn-sm" @click="zoomToLayer(e.id)"><Icon name="scan" />Acercar</button>
          </div>
        </div>

        <!-- Atributos -->
        <div v-show="layers.tab === 'style'" id="side-style" class="tabpanel" :class="{ 'is-entering': entering === 'style' }" role="tabpanel" aria-labelledby="tab-style">
          <h3 class="prop-title">Simbología</h3>
          <p class="prop-desc">Cambia cómo se dibuja la capa, como en QGIS. El archivo y sus atributos no se modifican.</p>
          <div class="field">
            <label for="styleMode">Modo de representación</label>
            <select id="styleMode" v-model="styleDraft.mode" class="select">
              <option value="single">Símbolo único</option>
              <option value="density" :disabled="!numericFields.length">Graduado por atributo (densidad)</option>
            </select>
          </div>
          <div v-if="styleDraft.mode === 'density'" class="field">
            <label for="styleField">Campo numérico</label>
            <select id="styleField" v-model="styleDraft.field" class="select">
              <option v-for="field in numericFields" :key="field" :value="field">{{ field }}</option>
            </select>
            <span class="hint">Los valores bajos usan tonos claros y los altos tonos oscuros, como una capa graduada de QGIS.</span>
          </div>
          <div v-if="styleDraft.mode === 'density'" class="grid2">
            <div class="field">
              <label for="styleClassification">Clasificación</label>
              <select id="styleClassification" v-model="styleDraft.classification" class="select">
                <option value="equal">Intervalo igual</option>
                <option value="quantile">Cuantiles</option>
              </select>
            </div>
            <div class="field">
              <label for="styleClasses">Clases</label>
              <select id="styleClasses" v-model.number="styleDraft.classes" class="select">
                <option :value="3">3</option><option :value="4">4</option><option :value="5">5</option>
              </select>
            </div>
          </div>
          <div class="grid2">
            <div class="field"><label for="styleColor">Color del borde</label><input id="styleColor" v-model="styleDraft.color" class="input" type="color"></div>
            <div class="field"><label for="styleFill">Color del relleno</label><input id="styleFill" v-model="styleDraft.fillColor" class="input" type="color" :disabled="styleDraft.mode === 'density'"></div>
          </div>
          <div class="field"><label for="styleWeight">Grosor del borde <output>{{ styleDraft.weight }} px</output></label><input id="styleWeight" v-model.number="styleDraft.weight" type="range" min="0.5" max="8" step="0.5"></div>
          <div class="field"><label for="styleOpacity">Opacidad del borde <output>{{ Math.round(styleDraft.opacity * 100) }}%</output></label><input id="styleOpacity" v-model.number="styleDraft.opacity" type="range" min="0" max="1" step="0.05"></div>
          <div class="field"><label for="styleFillOpacity">Opacidad del relleno <output>{{ Math.round(styleDraft.fillOpacity * 100) }}%</output></label><input id="styleFillOpacity" v-model.number="styleDraft.fillOpacity" type="range" min="0" max="1" step="0.05"></div>
          <div class="field"><label for="stylePointRadius">Tamaño de puntos <output>{{ styleDraft.pointRadius }} px</output></label><input id="stylePointRadius" v-model.number="styleDraft.pointRadius" type="range" min="2" max="20" step="1"></div>
          <div class="prop-actions">
            <button type="button" class="btn btn-primary btn-sm" :disabled="styleSaving" @click="applyStyle"><Icon name="check" />{{ styleSaving ? 'Guardando…' : 'Aplicar simbología' }}</button>
          </div>
          <p class="hint">Las capas locales se guardan en este navegador. Las publicadas también se envían al servidor cuando la API de estilos está disponible.</p>
        </div>

        <!-- Atributos -->
        <div v-show="layers.tab === 'attrs'" id="side-attrs" class="tabpanel" :class="{ 'is-entering': entering === 'attrs' }" role="tabpanel" aria-labelledby="tab-attrs">
          <template v-if="f">
            <h3 class="prop-title small">Entidad {{ f.index + 1 }} de {{ f.total }}</h3>
            <div class="prop-sub"><span class="badge">{{ f.geomType }}</span></div>
            <table class="attr-table spaced-top">
              <thead><tr><th>Campo</th><th>Valor</th></tr></thead>
              <tbody>
                <tr v-for="(v, k) in f.props" :key="k"><td><code>{{ k }}</code></td><td>{{ v }}</td></tr>
                <tr v-if="!Object.keys(f.props).length"><td colspan="2">La entidad no tiene atributos.</td></tr>
              </tbody>
            </table>
          </template>
          <template v-else>
            <p class="prop-desc flush-top">Usa Identificar y haz clic en una entidad para ver sus valores.</p>
            <table class="attr-table spaced-top">
              <thead><tr><th>Campo</th><th>Tipo</th><th>Descripción</th></tr></thead>
              <tbody>
                <tr v-for="a in m?.attrs || []" :key="a[0]"><td><code>{{ a[0] }}</code></td><td>{{ a[1] }}</td><td>{{ a[2] }}</td></tr>
                <tr v-if="!(m?.attrs || []).length"><td colspan="3">Los campos aparecen cuando la capa termina de cargarse.</td></tr>
              </tbody>
            </table>
          </template>
        </div>

        <!-- Metadatos -->
        <div v-show="layers.tab === 'meta'" id="side-meta" class="tabpanel" :class="{ 'is-entering': entering === 'meta' }" role="tabpanel" aria-labelledby="tab-meta">
          <template v-if="m">
            <div class="prop-sub flush-top"><span class="badge mono">{{ m.id }}</span><span class="badge" :class="statusClass">{{ m.estatus }}</span></div>
            <div class="section-label">Identificación</div>
            <KeyValues :rows="[['Tema', m.temas], ['Publicación', fmtDate(m.pub)], ['Licencia', m.lic], ['Acceso', access]]" />
            <div class="section-label">Cobertura</div>
            <KeyValues :rows="m.bbox ? [['Norte', `${m.bbox[1].toFixed(2)}°`, true], ['Sur', `${m.bbox[0].toFixed(2)}°`, true], ['Oeste', `${m.bbox[2].toFixed(2)}°`, true], ['Este', `${m.bbox[3].toFixed(2)}°`, true], ['Resolución', m.res]] : [['Extensión', 'Todavía no calculada'], ['Resolución', m.res]]" />
            <div class="section-label">Linaje</div>
            <p class="prop-desc flush-top">{{ m.linaje }}</p>
            <div class="prop-actions">
              <button type="button" class="btn btn-secondary btn-sm" @click="exportMeta(e.id)"><Icon name="code" />Exportar XML</button>
              <button type="button" class="btn btn-quiet btn-sm" @click="copyCitation(e.id)"><Icon name="quote" />Copiar cita</button>
            </div>
          </template>
        </div>
      </template>
    </div>
  </section>
</template>
