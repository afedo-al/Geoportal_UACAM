<script setup>
/* Datos del estudio del lote: todas las capas los heredan (perfil basado en ISO 19115) */
import { ref, reactive, watch, nextTick, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import { ui } from '../stores/ui.js';
import { session } from '../stores/session.js';
import { study, STUDY_REQ, saveStudy, closeStudy } from '../stores/upload.js';
import { useDialog } from '../lib/ui-helpers.js';

const dlg = ref(null);
const titleEl = ref(null);
const form = reactive({ ...study });
const invalid = reactive({});
const THEMES = ['Hidrología', 'Suelos', 'Riesgos', 'Vegetación', 'Topografía', 'Clima', 'División territorial', 'Fauna', 'Levantamiento de campo'];
const LICENSES = ['CC BY 4.0', 'CC BY-NC 4.0', 'CC BY-NC 2.5 MX', 'Uso restringido (solo CEDESU)'];

watch(() => ui.studyOpen, open => {
  if (!open) return;
  Object.assign(form, study);
  if (!form.sResp && session.admin) form.sResp = 'CEDESU · UACAM';
  STUDY_REQ.forEach(k => { invalid[k] = false; });
  nextTick(() => titleEl.value?.focus());
});
useDialog(dlg, () => ui.studyOpen, () => closeStudy());
/* Vive dentro de la vista de carga: si se sale de ella con el diálogo abierto, se cierra como cancelado */
onBeforeUnmount(() => { if (ui.studyOpen) closeStudy(); });

/* Al escribir en un campo obligatorio se retira su aviso */
watch(form, () => STUDY_REQ.forEach(k => { if (invalid[k] && String(form[k]).trim()) invalid[k] = false; }));

function submit() {
  let first = null;
  STUDY_REQ.forEach(k => {
    invalid[k] = !String(form[k] || '').trim();
    if (invalid[k] && !first) first = k;
  });
  if (first) { document.getElementById(first)?.focus(); return; }
  saveStudy(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v ?? '').trim()])));
  dlg.value.close('ok');
}
</script>

<template>
  <dialog ref="dlg" class="dlg dlg-wide" aria-labelledby="studyDlgTitle">
    <form novalidate @submit.prevent="submit">
      <div class="dlg-head">
        <div><h2 id="studyDlgTitle">Estudio del lote</h2><p>Todas las capas del lote heredan estos datos. Los campos con * son obligatorios para enviar a revisión (perfil basado en ISO 19115).</p></div>
        <button type="button" class="icon-btn" data-close aria-label="Cerrar"><Icon name="x" /></button>
      </div>
      <div class="dlg-body stack">
        <div class="grid2">
          <div class="field"><label for="sTitle">Título del estudio *</label><input id="sTitle" ref="titleEl" v-model="form.sTitle" class="input" required :aria-invalid="String(!!invalid.sTitle)"><span v-if="invalid.sTitle" class="error-text">Campo obligatorio</span></div>
          <div class="field"><label for="sTheme">Tema *</label>
            <select id="sTheme" v-model="form.sTheme" class="select" required :aria-invalid="String(!!invalid.sTheme)"><option value="">Selecciona…</option><option v-for="t in THEMES" :key="t">{{ t }}</option></select>
            <span v-if="invalid.sTheme" class="error-text">Campo obligatorio</span></div>
        </div>
        <div class="grid3">
          <div class="field"><label for="sDate">Fecha del estudio *</label><input id="sDate" v-model="form.sDate" class="input" type="date" required :aria-invalid="String(!!invalid.sDate)"><span v-if="invalid.sDate" class="error-text">Campo obligatorio</span></div>
          <div class="field"><label for="sResp">Responsable *</label><input id="sResp" v-model="form.sResp" class="input" required :aria-invalid="String(!!invalid.sResp)"><span v-if="invalid.sResp" class="error-text">Campo obligatorio</span></div>
          <div class="field"><label for="sSource">Fuente original</label><input id="sSource" v-model="form.sSource" class="input" placeholder="Institución o autor"></div>
        </div>
        <div class="grid2">
          <div class="field"><label for="sLic">Licencia de uso *</label>
            <select id="sLic" v-model="form.sLic" class="select" required :aria-invalid="String(!!invalid.sLic)"><option value="">Selecciona…</option><option v-for="l in LICENSES" :key="l">{{ l }}</option></select>
            <span v-if="invalid.sLic" class="error-text">Campo obligatorio</span></div>
          <div class="field"><label for="sAccess">Clasificación de acceso *</label>
            <select id="sAccess" v-model="form.sAccess" class="select" required :aria-invalid="String(!!invalid.sAccess)"><option value="">Selecciona…</option><option>Pública</option><option>Interna</option></select>
            <span v-if="invalid.sAccess" class="error-text">Campo obligatorio</span></div>
        </div>
        <div class="field"><label for="sDesc">Descripción</label><textarea id="sDesc" v-model="form.sDesc" class="textarea" rows="3"></textarea></div>
        <div class="field"><label for="sLineage">Procedencia y metodología</label><textarea id="sLineage" v-model="form.sLineage" class="textarea" rows="2" placeholder="Cómo se levantaron y procesaron los datos"></textarea></div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn btn-quiet" data-close>Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar estudio</button>
      </div>
    </form>
  </dialog>
</template>
