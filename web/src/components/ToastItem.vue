<script setup>
/* Aviso con cierre automático; se pausa mientras el cursor está encima */
import { onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import { closeToast } from '../stores/ui.js';

const props = defineProps({ toast: { type: Object, required: true } });
const ICONS = { success: 'check-circle-2', error: 'alert-circle', warn: 'alert-triangle', info: 'info' };
let timer = 0;
const close = () => closeToast(props.toast.id);
const start = ms => { clearTimeout(timer); timer = setTimeout(close, ms); };
const pause = () => clearTimeout(timer);
onMounted(() => start(props.toast.type === 'error' ? 8000 : 5000));
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div class="toast" :class="[toast.type, { 'is-leaving': toast.leaving }]" :role="toast.type === 'error' ? 'alert' : 'status'"
    @mouseenter="pause" @mouseleave="start(2500)">
    <Icon :name="ICONS[toast.type] || 'info'" />
    <div>
      <div class="t">{{ toast.title }}</div>
      <div v-if="toast.message" class="m">{{ toast.message }}</div>
    </div>
    <button type="button" class="icon-btn" aria-label="Cerrar aviso" @click="close"><Icon name="x" class="ic-14" /></button>
  </div>
</template>
