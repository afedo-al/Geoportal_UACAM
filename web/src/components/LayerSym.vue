<script setup>
/* Símbolo de leyenda de una capa: rampa de color, polígono, línea o punto */
defineProps({ sym: { type: Object, required: true } });
</script>

<template>
  <span v-if="sym.t === 'ramp'" class="sym ramp" :style="{ '--ramp': sym.ramp.join(',') }" aria-hidden="true"></span>
  <span v-else class="sym" :class="sym.t.split(' ')" :style="{ '--c': sym.c || '#555', '--c-fill': sym.f || 'transparent' }" aria-hidden="true"></span>
</template>
