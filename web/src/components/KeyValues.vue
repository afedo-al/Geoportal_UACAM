<script setup>
/* Lista de pares campo–valor; las filas sin valor no se muestran. rows: [[campo, valor, monoespaciado?]] */
import { computed } from 'vue';
const props = defineProps({ rows: { type: Array, required: true } });
const shown = computed(() => props.rows.filter(r => r[1] !== undefined && r[1] !== null && r[1] !== ''));
</script>

<template>
  <dl class="kv">
    <template v-for="[k, v, mono] in shown" :key="k">
      <dt>{{ k }}</dt>
      <dd :class="{ mono }">{{ v }}</dd>
    </template>
  </dl>
</template>
