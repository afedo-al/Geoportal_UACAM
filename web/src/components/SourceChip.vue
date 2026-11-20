<script setup>
/* Etiqueta de origen de un dato de la ficha: del archivo, sugerido, por defecto, generado o copiado.
   origin: { key, label } (ver originOf en lib/study-fields.js). Sin origin no muestra nada. */
defineProps({ origin: { type: Object, default: null } });
</script>

<template>
  <span v-if="origin" class="auto-tag" :data-origin="origin.key">{{ origin.label }}</span>
</template>
