<script setup>
/* Edición de un estudio (perfil basado en ISO 19115). Sirve para dos casos:
   - el estudio de una capa del lote (studies.editing = id de la capa): lo que el archivo declara llega
     ya escrito y marcado, y se puede eliminar junto con su capa;
   - la ficha de un conjunto de prueba del catálogo (studies.editing = «dataset:<id>»): los cambios se
     guardan solo en este navegador: son datos de prueba y no pasan por el servidor de publicación.
   Solo se monta con la sesión de administración iniciada (App.vue). */
import { ref, reactive, computed, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import KeyValues from './KeyValues.vue';
import { showToast } from '../stores/ui.js';
import { studies, studyById, saveStudy, closeStudyEditor, deleteStudy, STUDY_FIELDS, STUDY_REQ, THEMES, LICENSES, ACCESS, FIELD_LABELS } from '../stores/studies.js';
import { entryById, datasetForm, saveDatasetMeta, resetDatasetMeta, hideDataset } from '../stores/layers.js';
import { useDialog } from '../lib/ui-helpers.js';

const dlg = ref(null);
const titleEl = ref(null);
const form = reactive(Object.fromEntries(STUDY_FIELDS.map(k => [k, ''])));
const share = ref(false);

const dsId = computed(() => (String(studies.editing || '').startsWith('dataset:') ? studies.editing.slice(8) : null));
const entry = computed(() => (dsId.value ? entryById(dsId.value) : null));
const rec = computed(() => (dsId.value ? null : studyById(studies.editing)));
const shown = computed(() => !!(rec.value || entry.value));
const heading = computed(() => (rec.value ? rec.value.layerName : entry.value?.name || ''));
const others = computed(() => !!rec.value && studies.list.length > 1);

/* Las listas cerradas conservan el valor actual aunque no sea una de las opciones (fichas de prueba) */
const withCurrent = (list, v) => (v && !list.includes(v) ? [...list, v] : list);
const themeOptions = computed(() => withCurrent(THEMES, form.sTheme));
const licenseOptions = computed(() => withCurrent(LICENSES, form.sLic));
const accessOptions = computed(() => withCurrent(ACCESS, form.sAccess));

function load() {
  const values = rec.value ? rec.value : dsId.value ? datasetForm(dsId.value) : null;
  if (!values) return;
  STUDY_FIELDS.forEach(k => { form[k] = values[k] || ''; });
  share.value = false;
  nextTick(() => titleEl.value?.focus());
}
watch(() => studies.editing, id => { if (id) load(); }, { immediate: true });
useDialog(dlg, () => shown.value, () => closeStudyEditor());

/* Etiqueta junto al campo: de dónde salió el valor, mientras nadie lo haya cambiado (solo capas del lote) */
function tag(k) {
  const a = rec.value?.auto[k];
  if (!a || rec.value.edited.includes(k) || form[k] !== rec.value[k]) return '';
  if (a.startsWith('metadatos')) return 'del archivo';
  if (a.startsWith('sugerido')) return 'sugerido';
  if (a.startsWith('copiado')) return 'copiado de otra capa';
  return 'nombre del archivo';
}

async function remove() {
  if (dsId.value) { if (await hideDataset(dsId.value)) closeStudyEditor(); return; }
  await deleteStudy(rec.value?.id);   // al eliminarse, el diálogo se cierra solo
}

function restore() {
  resetDatasetMeta(dsId.value);
  load();
  showToast('info', 'Ficha restablecida', `«${entry.value?.name}» vuelve a sus datos originales.`);
}

/* Se puede guardar a medias: lo obligatorio se exige al enviar a revisión, no al editar */
function submit() {
  const title = String(form.sTitle).trim() || heading.value;
  if (dsId.value) {
    if (!saveDatasetMeta(dsId.value, form)) return;
    showToast('success', 'Ficha guardada', `«${title}». Es un conjunto de prueba: los cambios se guardan solo en este navegador.`);
    dlg.value.close('ok');
    return;
  }
  const missing = STUDY_REQ.filter(k => !String(form[k] || '').trim());
  const copied = share.value && others.value;
  saveStudy(rec.value.id, form, { shareWith: copied });
  const extra = copied ? ' Responsable, licencia y acceso se copiaron a las capas que no los tenían.' : '';
  if (missing.length) showToast('warn', 'Estudio guardado, aún incompleto', `«${title}»: para enviarlo a revisión falta ${missing.map(k => FIELD_LABELS[k].toLowerCase()).join(', ')}.${extra}`);
  else showToast('success', 'Estudio guardado', `«${title}» está completo.${extra}`);
  dlg.value.close('ok');
}
</script>

<template>
  <dialog ref="dlg" class="dlg dlg-wide" aria-labelledby="studyDlgTitle">
    <form v-if="shown" novalidate @submit.prevent="submit">
      <div class="dlg-head">
        <div>
          <h2 id="studyDlgTitle">{{ dsId ? 'Ficha de' : 'Estudio de' }} «{{ heading }}»</h2>
          <p v-if="dsId">Conjunto de prueba del catálogo (perfil basado en ISO 19115).</p>
          <p v-else>Cada capa del lote tiene su propio estudio. Puedes guardarlo a medias; los campos con * son obligatorios para enviar a revisión (perfil basado en ISO 19115).</p>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Cerrar"><Icon name="x" /></button>
      </div>
      <div class="dlg-body stack">
        <div v-if="dsId" class="callout info">
          <Icon name="info" />
          <span>Es un conjunto de prueba: los cambios se guardan <b>solo en este navegador</b> y no cambian el archivo de datos. Los estudios del CEDESU se publican desde Carga y Revisión.
            <template v-if="entry?.edited"> Esta ficha ya tiene cambios. <button type="button" class="link-btn" @click="restore">Restablecer la original</button></template>
          </span>
        </div>
        <div v-else-if="rec.origins.length" class="callout info">
          <Icon name="info" />
          <span>Datos leídos de <b>{{ rec.origins.join(' · ') }}</b>. Las etiquetas «del archivo» y «sugerido» marcan lo que se rellenó solo: revísalo y corrígelo si hace falta.</span>
        </div>
        <div v-else class="callout warn">
          <Icon name="alert-triangle" />
          <span>Este archivo no trae metadatos del estudio, así que solo el título sale del nombre del archivo. Completa los campos con *; si tienes el <b>.xml</b> de la capa, añádelo en la pantalla de la capa y se leerá solo.</span>
        </div>

        <div class="grid2">
          <div class="field"><label for="sTitle">Título del estudio * <span v-if="tag('sTitle')" class="auto-tag">{{ tag('sTitle') }}</span></label>
            <input id="sTitle" ref="titleEl" v-model="form.sTitle" class="input" required></div>
          <div class="field"><label for="sTheme">Tema * <span v-if="tag('sTheme')" class="auto-tag">{{ tag('sTheme') }}</span></label>
            <select id="sTheme" v-model="form.sTheme" class="select" required><option value="">Selecciona…</option><option v-for="t in themeOptions" :key="t">{{ t }}</option></select></div>
        </div>
        <div class="grid3">
          <div class="field"><label for="sDate">Fecha del estudio * <span v-if="tag('sDate')" class="auto-tag">{{ tag('sDate') }}</span></label>
            <input id="sDate" v-model="form.sDate" class="input" type="date" required></div>
          <div class="field"><label for="sResp">Responsable * <span v-if="tag('sResp')" class="auto-tag">{{ tag('sResp') }}</span></label>
            <input id="sResp" v-model="form.sResp" class="input" required></div>
          <div class="field"><label for="sSource">Fuente original <span v-if="tag('sSource')" class="auto-tag">{{ tag('sSource') }}</span></label>
            <input id="sSource" v-model="form.sSource" class="input" placeholder="Institución o autor"></div>
        </div>
        <div class="grid2">
          <div class="field"><label for="sLic">Licencia de uso * <span v-if="tag('sLic')" class="auto-tag">{{ tag('sLic') }}</span></label>
            <select id="sLic" v-model="form.sLic" class="select" required><option value="">Selecciona…</option><option v-for="l in licenseOptions" :key="l">{{ l }}</option></select></div>
          <div class="field"><label for="sAccess">Clasificación de acceso * <span v-if="tag('sAccess')" class="auto-tag">{{ tag('sAccess') }}</span></label>
            <select id="sAccess" v-model="form.sAccess" class="select" required><option value="">Selecciona…</option><option v-for="a in accessOptions" :key="a">{{ a }}</option></select></div>
        </div>
        <div class="field"><label for="sDesc">Descripción <span v-if="tag('sDesc')" class="auto-tag">{{ tag('sDesc') }}</span></label><textarea id="sDesc" v-model="form.sDesc" class="textarea" rows="3"></textarea></div>
        <div class="field"><label for="sLineage">Procedencia y metodología <span v-if="tag('sLineage')" class="auto-tag">{{ tag('sLineage') }}</span></label><textarea id="sLineage" v-model="form.sLineage" class="textarea" rows="2" placeholder="Cómo se levantaron y procesaron los datos"></textarea></div>
        <div class="field"><label for="sKeywords">Palabras clave <span v-if="tag('sKeywords')" class="auto-tag">{{ tag('sKeywords') }}</span></label><input id="sKeywords" v-model="form.sKeywords" class="input" placeholder="Separadas por comas"></div>

        <div v-if="rec?.extras.length">
          <div class="section-label flush-top">Otros datos que declara el archivo</div>
          <KeyValues :rows="rec.extras" />
        </div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn btn-quiet danger" @click="remove"><Icon name="trash-2" />{{ dsId ? 'Eliminar del catálogo' : 'Eliminar estudio' }}</button>
        <label v-if="others" class="check share"><input v-model="share" type="checkbox"> Copiar responsable, licencia y acceso a las demás capas que aún no los tienen</label>
        <button type="button" class="btn btn-quiet" data-close>Cancelar</button>
        <button type="submit" class="btn btn-primary">{{ dsId ? 'Guardar ficha' : 'Guardar estudio' }}</button>
      </div>
    </form>
  </dialog>
</template>
