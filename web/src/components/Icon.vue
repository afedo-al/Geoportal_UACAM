<script setup>
/* Icono del sprite de index.html (trazos de Lucide) */
defineProps({ name: { type: String, required: true } });
</script>

<template>
  <svg class="ic" aria-hidden="true"><use :href="`#i-${name}`" /></svg>
</template>
