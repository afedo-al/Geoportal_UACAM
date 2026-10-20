<script setup>
/* Ficha completa de metadatos (perfil basado en ISO 19115) */
import { ref, computed, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import KeyValues from './KeyValues.vue';
import { ui } from '../stores/ui.js';
import { entryById, exportMeta, copyCitation, viewStudyOnMap } from '../stores/layers.js';
import { CONTACTO_CEDESU } from '../lib/datasets.js';
import { fmtDate } from '../lib/format.js';
import { useDialog, moveInk, tabKeys } from '../lib/ui-helpers.js';

const dlg = ref(null);
const tabsEl = ref(null);
const shownId = ref(null);
const tab = ref('ident');
const setTab = v => { tab.value = v; };
const TABS = [['ident', 'Identificación'], ['cob', 'Cobertura'], ['cal', 'Calidad y linaje'], ['dist', 'Distribución'], ['attr', 'Atributos']];

const entry = computed(() => entryById(shownId.value));
const m = computed(() => entry.value?.metaRecord);
const access = computed(() => m.value?.access || (m.value?.estatus === 'Completo' ? 'Pública' : 'Interna (no publicada)'));

watch(() => ui.metaId, id => {
  if (!id) return;
  shownId.value = id;
  tab.value = 'ident';
  nextTick(() => requestAnimationFrame(() => moveInk(tabsEl.value)));
});
watch(tab, () => nextTick(() => moveInk(tabsEl.value)));
useDialog(dlg, () => !!ui.metaId, () => { ui.metaId = null; });

function onMap() {
  const id = shownId.value;
  dlg.value.close();
  viewStudyOnMap(id);
}
</script>

<template>
  <dialog ref="dlg" class="dlg dlg-wide" aria-labelledby="metaDlgTitle">
    <div class="dlg-head">
      <div><h2 id="metaDlgTitle">{{ entry?.name || 'Ficha de metadatos' }}</h2><p v-if="m">{{ m.id }} · {{ m.tipo }} · {{ m.cat }}</p></div>
      <button type="button" class="icon-btn" data-close aria-label="Cerrar"><Icon name="x" /></button>
    </div>
    <div v-if="m" class="dlg-body">
      <div ref="tabsEl" class="tabs" role="tablist" aria-label="Secciones de la ficha" @keydown="tabKeys($event, TABS.map(t => t[0]), tab, setTab)">
        <button v-for="[k, label] in TABS" :key="k" type="button" role="tab" :data-tab="k" :id="`mt-tab-${k}`" :aria-controls="`mt-${k}`"
          :aria-selected="String(tab === k)" :tabindex="tab === k ? 0 : -1" @click="tab = k">{{ label }}</button>
        <span class="tab-ink" aria-hidden="true"></span>
      </div>

      <div v-show="tab === 'ident'" id="mt-ident" class="tabpanel flush" role="tabpanel" aria-labelledby="mt-tab-ident">
        <div class="prop-sub spaced"><span class="badge" :class="m.estatus === 'Completo' ? 'badge-ok' : 'badge-warn'">{{ m.estatus }}</span></div>
        <p class="prop-desc lead">{{ m.resumen }}</p>
        <KeyValues :rows="[['Tema', m.temas], ['Responsable', m.resp], ['Fuente original', m.fuente], ['Fecha de publicación', fmtDate(m.pub)], ['Última actualización', fmtDate(m.act)], ['Licencia de uso', m.lic], ['Clasificación de acceso', access]]" />
        <div class="section-label">Palabras clave</div>
        <div class="tags"><span v-for="t in m.palabras || []" :key="t" class="badge">{{ t }}</span></div>
      </div>

      <div v-show="tab === 'cob'" id="mt-cob" class="tabpanel flush" role="tabpanel" aria-labelledby="mt-tab-cob">
        <div class="bbox">
          <span class="n">{{ m.bbox[1].toFixed(2) }}° N</span><span class="w">{{ Math.abs(m.bbox[2]).toFixed(2) }}° O</span>
          <span class="box"></span>
          <span class="e">{{ Math.abs(m.bbox[3]).toFixed(2) }}° O</span><span class="s">{{ m.bbox[0].toFixed(2) }}° N</span>
        </div>
        <KeyValues :rows="[['Escala', m.escala], ['Resolución o precisión', m.res], ['Sistema de referencia', m.crs, true], ['Ámbito geográfico', 'Estado de Campeche, México']]" />
      </div>

      <div v-show="tab === 'cal'" id="mt-cal" class="tabpanel flush" role="tabpanel" aria-labelledby="mt-tab-cal">
        <p class="prop-desc lead">{{ m.linaje }}</p>
        <KeyValues :rows="[['Estatus de la información', m.estatus]]" />
      </div>

      <div v-show="tab === 'dist'" id="mt-dist" class="tabpanel flush" role="tabpanel" aria-labelledby="mt-tab-dist">
        <KeyValues :rows="[['Formato', m.formato], ['Tamaño aproximado', m.tam], ['Servicios WMS / WFS', 'Fase posterior (fuera del MVP)'], ['Enlace de consulta', `/estudios/${m.id.toLowerCase()}`, true]]" />
        <div class="section-label">Punto de contacto</div>
        <KeyValues :rows="[['Organización', CONTACTO_CEDESU.org], ['Área', CONTACTO_CEDESU.nombre], ['Correo', CONTACTO_CEDESU.correo], ['Dirección', CONTACTO_CEDESU.dir]]" />
      </div>

      <div v-show="tab === 'attr'" id="mt-attr" class="tabpanel flush" role="tabpanel" aria-labelledby="mt-tab-attr">
        <table class="attr-table">
          <thead><tr><th>Campo</th><th>Tipo</th><th>Descripción</th></tr></thead>
          <tbody>
            <tr v-for="a in m.attrs || []" :key="a[0]"><td><code>{{ a[0] }}</code></td><td>{{ a[1] }}</td><td>{{ a[2] }}</td></tr>
            <tr v-if="!(m.attrs || []).length"><td colspan="3">Los campos aparecen cuando la capa se carga en el mapa.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="dlg-foot">
      <button type="button" class="btn btn-quiet" @click="copyCitation(shownId)"><Icon name="quote" />Copiar cita</button>
      <button type="button" class="btn btn-quiet" @click="exportMeta(shownId)"><Icon name="code" />Exportar XML</button>
      <button type="button" class="btn btn-primary" @click="onMap"><Icon name="map" />Ver en el mapa</button>
    </div>
  </dialog>
</template>
