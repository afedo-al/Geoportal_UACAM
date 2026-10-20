<script setup>
import ToastItem from './ToastItem.vue';
import { ui } from '../stores/ui.js';
</script>

<template>
  <div class="toasts" aria-live="polite">
    <ToastItem v-for="t in ui.toasts" :key="t.id" :toast="t" />
  </div>
</template>
