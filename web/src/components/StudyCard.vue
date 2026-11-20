<script setup>
/* Tarjeta de una sección de la ficha: título con icono y su contenido. */
import Icon from './Icon.vue';
defineProps({ title: { type: String, required: true }, icon: { type: String, default: '' }, wide: Boolean });
</script>

<template>
  <section class="fc-card" :class="{ 'fc-wide': wide }">
    <h3 class="fc-title"><Icon v-if="icon" :name="icon" class="ic-14" />{{ title }}</h3>
    <slot />
  </section>
</template>
