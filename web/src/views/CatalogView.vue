<script setup>
import { ref, computed } from 'vue';
import Icon from '../components/Icon.vue';
import { studyList, metaOf, showLayerInfo, viewStudyOnMap } from '../stores/layers.js';
import { fmtDate } from '../lib/format.js';

const q = ref('');
const theme = ref('');
const year = ref('');
const all = studyList();
const themes = [...new Set(all.map(s => s.theme))].sort();
const years = [...new Set(all.map(s => s.date.slice(0, 4)).filter(Boolean))].sort().reverse();

const list = computed(() => {
  const t = q.value.trim().toLowerCase();
  return all.filter(s => {
    const m = metaOf(s.id);
    return (!t || `${s.title} ${s.theme} ${m.fuente} ${s.desc}`.toLowerCase().includes(t))
      && (!theme.value || s.theme === theme.value) && (!year.value || s.date.startsWith(year.value));
  }).map(s => ({ ...s, m: metaOf(s.id) }));
});
const crsCodes = m => (m.crs.match(/EPSG:\d+/g) || ['—']).join(' → ');
function reset() { q.value = ''; theme.value = ''; year.value = ''; }
</script>

<template>
  <section id="screen-estudios" class="screen active" aria-labelledby="catTitle">
    <div class="page">
      <div class="page-inner">
        <div class="page-head">
          <div>
            <h1 id="catTitle">Catálogo de estudios</h1>
            <p>Estudios y capas disponibles en el geoportal, con su procedencia, fecha y sistema de referencia. Abre la ficha para consultar los metadatos completos.</p>
          </div>
        </div>
        <div class="callout info catalog-note" role="note">
          <Icon name="info" />
          <span>Por ahora el catálogo contiene solo <b>datos de prueba</b> convertidos desde QGIS. Los estudios de CEDESU aparecerán aquí cuando se publiquen.</span>
        </div>
        <div class="catalog-filters">
          <div class="input-search">
            <Icon name="search" />
            <input v-model="q" class="input" type="search" placeholder="Buscar por título, tema o fuente" aria-label="Buscar estudios">
          </div>
          <select v-model="theme" class="select" aria-label="Filtrar por tema"><option value="">Todos los temas</option><option v-for="t in themes" :key="t">{{ t }}</option></select>
          <select v-model="year" class="select" aria-label="Filtrar por año"><option value="">Todos los años</option><option v-for="y in years" :key="y">{{ y }}</option></select>
          <span class="catalog-meta" aria-live="polite">{{ list.length }} de {{ all.length }} conjuntos</span>
        </div>
        <div class="catalog">
          <template v-if="list.length">
            <div class="cat-headrow" aria-hidden="true"><span>Conjunto de datos</span><span>Tema</span><span>Sistema de referencia</span><span></span></div>
            <article v-for="s in list" :key="s.id" class="cat-row" :data-study="s.id">
              <div class="cat-main">
                <h3>{{ s.title }} <span class="badge badge-info">Datos de prueba</span></h3>
                <p class="desc">{{ s.desc }}</p>
                <div class="facts">
                  <span v-if="s.date"><Icon name="calendar" class="ic-14" />{{ fmtDate(s.date) }}</span>
                  <span><Icon name="building-2" class="ic-14" />{{ s.m.fuente }}</span>
                  <span v-for="f in s.facts" :key="f">{{ f }}</span>
                </div>
              </div>
              <div class="col col-theme"><span class="k">Tema</span><b>{{ s.theme }}</b></div>
              <div class="col col-crs"><span class="k">Referencia</span><b class="mono">{{ crsCodes(s.m) }}</b></div>
              <div class="actions">
                <button type="button" class="btn btn-secondary btn-sm" data-act="meta" @click="showLayerInfo(s.id)"><Icon name="file-text" />Ficha</button>
                <button type="button" class="btn btn-primary btn-sm" data-act="map" @click="viewStudyOnMap(s.id)"><Icon name="map" />Ver en el mapa</button>
              </div>
            </article>
          </template>
          <div v-else class="catalog-empty">
            <strong>Ningún conjunto coincide con los filtros</strong>Quita algún filtro o prueba con otra palabra.
            <div class="catalog-empty-action"><button type="button" class="btn btn-secondary btn-sm" @click="reset">Quitar filtros</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
