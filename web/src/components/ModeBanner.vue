<script setup>
/* Franja que dice en qué modo trabaja la app: sin servidor de publicación, las cargas y revisiones viven solo en esta pestaña. */
import Icon from './Icon.vue';
import { hasApi } from '../lib/api.js';
const local = !hasApi();
</script>

<template>
  <div v-if="local" class="callout info mode-banner" role="note">
    <Icon name="info" />
    <span><b>Modo local.</b> No hay servidor de publicación conectado: lo que cargues, apruebes o publiques aquí vive solo en esta pestaña y se pierde al recargar.</span>
  </div>
</template>
