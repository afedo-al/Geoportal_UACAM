<script setup>
import { ref, watch, nextTick } from 'vue';
import { ui } from '../stores/ui.js';
import { useDialog } from '../lib/ui-helpers.js';

const dlg = ref(null);
const okBtn = ref(null);
const cancelBtn = ref(null);
const shown = ref({ title: '', text: '', ok: 'Confirmar' }); // se conserva durante la animación de salida

watch(() => ui.confirm, c => {
  if (!c) return;
  shown.value = c;
  nextTick(() => (c.danger ? cancelBtn : okBtn).value?.focus());
});
useDialog(dlg, () => !!ui.confirm, rv => {
  const c = ui.confirm;
  ui.confirm = null;
  c?.resolve(rv === 'ok');
});
</script>

<template>
  <dialog ref="dlg" class="dlg" aria-labelledby="confirmTitle">
    <div class="dlg-head"><div><h2 id="confirmTitle">{{ shown.title }}</h2><p>{{ shown.text }}</p></div></div>
    <div class="dlg-foot">
      <button ref="cancelBtn" type="button" class="btn btn-quiet" data-close>Cancelar</button>
      <button ref="okBtn" type="button" class="btn" :class="shown.danger ? 'btn-danger' : 'btn-primary'" @click="dlg.close('ok')">{{ shown.ok }}</button>
    </div>
  </dialog>
</template>
