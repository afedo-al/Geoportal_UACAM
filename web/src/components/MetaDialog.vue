<script setup>
/* Ficha completa de metadatos (perfil basado en ISO 19115), en una sola página de tarjetas por tema. */
import { ref, computed, watch } from 'vue';
import Icon from './Icon.vue';
import KeyValues from './KeyValues.vue';
import StudyCard from './StudyCard.vue';
import SourceChip from './SourceChip.vue';
import { ui } from '../stores/ui.js';
import { entryById, exportMeta, copyCitation, viewStudyOnMap } from '../stores/layers.js';
import { CONTACTO_CEDESU } from '../lib/datasets.js';
import { fmtDate, norm } from '../lib/format.js';
import { useDialog } from '../lib/ui-helpers.js';

const dlg = ref(null);
const shownId = ref(null);
const attrFilter = ref('');

const entry = computed(() => entryById(shownId.value));
const m = computed(() => entry.value?.metaRecord);
const access = computed(() => m.value?.access || (m.value?.estatus === 'Completo' ? 'Pública' : 'Interna (no publicada)'));
const accessWord = computed(() => String(access.value).split(' · ')[0]);
const req = computed(() => m.value?.req || null);
const done = computed(() => (req.value ? req.value.total - req.value.faltan.length : 0));
const isPending = key => !!m.value?.req?.faltan.includes(key);
const origin = k => m.value?.origenes?.[k] || null;
const attrs = computed(() => (m.value?.attrs || []).filter(a => !attrFilter.value || norm(a.join(' ')).includes(norm(attrFilter.value))));
const dash = v => (v && v !== '—' ? v : '');
/* Fila etiqueta/valor; si el dato obligatorio falta, se dice «Pendiente» en lugar de dejar un guion */
const row = (label, value, key, mono) => [label, dash(value) || (isPending(key) ? 'Pendiente' : ''), mono];

watch(() => ui.metaId, id => {
  if (!id) return;
  shownId.value = id;
  attrFilter.value = '';
});
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
    <div v-if="m" class="dlg-body fc">
      <header class="fc-head">
        <div class="fc-badges">
          <span class="badge" :class="m.estatus === 'Completo' || m.estatus === 'Publicada' ? 'badge-ok' : 'badge-warn'">{{ m.estatus }}</span>
          <span class="badge">Acceso: {{ accessWord }}</span>
          <span v-if="dash(m.lic)" class="badge">{{ m.lic }}</span>
          <span v-if="m.version" class="badge">Versión {{ m.version }}</span>
          <span v-if="m.act" class="fc-updated"><Icon name="calendar" class="ic-14" />Actualizada {{ fmtDate(m.act) }}</span>
        </div>
        <div v-if="req" class="fc-progress" role="group" aria-label="Campos obligatorios completos">
          <div class="fc-bar" role="progressbar" :aria-valuenow="done" aria-valuemin="0" :aria-valuemax="req.total"><span :style="{ width: `${(done / req.total) * 100}%` }"></span></div>
          <span class="fc-count">{{ done }} de {{ req.total }} obligatorios<template v-if="req.faltan.length"> · falta completar</template></span>
        </div>
      </header>

      <div class="fc-grid">
        <StudyCard title="Resumen" icon="file-text" wide>
          <p class="fc-lead">{{ m.resumen }} <SourceChip :origin="origin('sDesc')" /></p>
          <div v-if="(m.palabras || []).length" class="tags"><span v-for="t in m.palabras" :key="t" class="badge">{{ t }}</span></div>
          <p v-else class="fc-none">El registro no declara palabras clave.</p>
        </StudyCard>

        <StudyCard title="Identificación" icon="book-open">
          <KeyValues :rows="[row('Tema', m.temas, 'sTheme'), row('Fecha del estudio', fmtDate(m.pub), 'sDate'), ['Última actualización', fmtDate(m.act)], row('Clasificación de acceso', access, 'sAccess')]" />
          <div class="fc-origins"><SourceChip :origin="origin('sTheme')" /><SourceChip :origin="origin('sDate')" /><SourceChip :origin="origin('sAccess')" /></div>
        </StudyCard>

        <StudyCard title="Responsable y licencia" icon="user">
          <KeyValues :rows="[row('Responsable', m.resp, 'sResp'), row('Fuente original', m.fuente, 'sSource'), row('Licencia de uso', m.lic, 'sLic')]" />
        </StudyCard>

        <StudyCard title="Cobertura" icon="globe">
          <p v-if="!m.bbox" class="fc-none">La extensión se calcula al leer las geometrías. Este formato lo interpreta el servidor, así que todavía no se conoce.</p>
          <div v-else class="bbox">
            <span class="n">{{ m.bbox[1].toFixed(2) }}° N</span><span class="w">{{ Math.abs(m.bbox[2]).toFixed(2) }}° O</span>
            <span class="box"></span>
            <span class="e">{{ Math.abs(m.bbox[3]).toFixed(2) }}° O</span><span class="s">{{ m.bbox[0].toFixed(2) }}° N</span>
          </div>
          <KeyValues :rows="[['Escala', m.escala], ['Resolución o precisión', m.res], ['Sistema de referencia', m.crs, true], ['Ámbito geográfico', 'Estado de Campeche, México']]" />
        </StudyCard>

        <StudyCard title="Calidad y linaje" icon="shield-check">
          <p class="fc-lead">{{ dash(m.linaje) || (isPending('sLineage') ? 'Pendiente' : 'No se declaró la procedencia ni la metodología.') }} <SourceChip :origin="origin('sLineage')" /></p>
          <KeyValues :rows="[['Estatus de la información', m.estatus]]" />
        </StudyCard>

        <StudyCard title="Distribución" icon="download">
          <KeyValues :rows="[['Formato', m.formato], ['Tamaño aproximado', m.tam], ['Servicios WMS / WFS', 'Fase posterior (fuera del MVP)'], ['Enlace de consulta', `/estudios/${m.id.toLowerCase()}`, true]]" />
        </StudyCard>

        <StudyCard title="Punto de contacto" icon="building-2">
          <KeyValues :rows="[['Organización', CONTACTO_CEDESU.org], ['Área', CONTACTO_CEDESU.nombre], ['Correo', CONTACTO_CEDESU.correo], ['Dirección', CONTACTO_CEDESU.dir]]" />
        </StudyCard>

        <StudyCard v-if="(m.versiones || []).length > 1" title="Versiones" icon="clock" wide>
          <ol class="fc-timeline">
            <li v-for="v in m.versiones" :key="v.id" :data-current="String(v.version === m.version)">
              <b>Versión {{ v.version }}</b><span class="badge">{{ v.estadoTexto }}</span><span class="fc-date">{{ fmtDate(String(v.fecha).slice(0, 10)) }}</span>
            </li>
          </ol>
        </StudyCard>

        <StudyCard title="Atributos" icon="table-2" wide>
          <div v-if="(m.attrs || []).length > 8" class="input-search fc-filter"><Icon name="search" /><input v-model="attrFilter" class="input" type="search" placeholder="Buscar un campo" aria-label="Buscar un campo"></div>
          <table class="attr-table">
            <thead><tr><th>Campo</th><th>Tipo</th><th>Descripción</th></tr></thead>
            <tbody>
              <tr v-for="a in attrs" :key="a[0]"><td><code>{{ a[0] }}</code></td><td>{{ a[1] }}</td><td>{{ a[2] }}</td></tr>
              <tr v-if="!attrs.length"><td colspan="3">{{ (m.attrs || []).length ? 'Ningún campo coincide.' : 'Los campos aparecen cuando la capa se carga en el mapa.' }}</td></tr>
            </tbody>
          </table>
        </StudyCard>
      </div>
    </div>
    <div class="dlg-foot">
      <button type="button" class="btn btn-quiet" @click="copyCitation(shownId)"><Icon name="quote" />Copiar cita</button>
      <button type="button" class="btn btn-quiet" @click="exportMeta(shownId)"><Icon name="code" />Exportar XML</button>
      <button type="button" class="btn btn-primary" @click="onMap"><Icon name="map" />Ver en el mapa</button>
    </div>
  </dialog>
</template>
