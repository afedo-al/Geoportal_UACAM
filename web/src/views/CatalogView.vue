<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import { layers, studyList, metaOf, showLayerInfo, viewStudyOnMap, hideDataset, restoreDatasets } from '../stores/layers.js';
import { studies, metaFromStudy, loteId, openStudyEditor, deleteStudy } from '../stores/studies.js';
import { session } from '../stores/session.js';
import { fmtDate } from '../lib/format.js';

const router = useRouter();

const q = ref('');
const theme = ref('');
const year = ref('');
/* Estudios de las capas cargadas en esta sesión: se crean solos al leer los archivos y no están publicados */
const loteList = computed(() => studies.list.filter(r => r.listed).map(r => {
  const m = metaFromStudy(r);
  return {
    id: loteId(r.id), rec: r, lote: true, m, title: r.sTitle || r.layerName, theme: r.sTheme || 'Sin tema', date: (r.sDate || '').slice(0, 7), desc: m.resumen,
    published: !!r.published,
    facts: [m.formato, r.facts.n ? `${r.facts.n.toLocaleString('es-MX')} entidades` : ''].filter(Boolean)
  };
}));
const all = computed(() => [...loteList.value, ...studyList()]);
const themes = computed(() => [...new Set(all.value.map(s => s.theme))].sort());
const years = computed(() => [...new Set(all.value.map(s => s.date.slice(0, 4)).filter(Boolean))].sort().reverse());
const onMap = s => layers.entries.some(e => e.studyId === s.rec?.id);
/* Editar abre el diálogo aquí mismo; solo existe con la sesión de administración (App.vue) */
function editStudy(s) { openStudyEditor(s.lote ? s.rec.id : `dataset:${s.id}`); }
function removeStudy(s) { if (s.lote) deleteStudy(s.rec.id); else hideDataset(s.id); }
const hiddenCount = computed(() => layers.entries.filter(e => e.hidden).length);
const publishedCount = computed(() => layers.entries.filter(e => e.remote || e.published).length);
function openInUpload(s) { studies.focus = s.rec.id; router.push('/carga'); }

const list = computed(() => {
  const t = q.value.trim().toLowerCase();
  return all.value.filter(s => {
    const m = s.m || metaOf(s.id);
    return (!t || `${s.title} ${s.theme} ${m.fuente} ${s.desc}`.toLowerCase().includes(t))
      && (!theme.value || s.theme === theme.value) && (!year.value || s.date.startsWith(year.value));
  }).map(s => ({ ...s, m: s.m || metaOf(s.id) }));
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
          <span v-if="publishedCount">Los conjuntos marcados <b>Publicada</b> son estudios del CEDESU aprobados en la pantalla Revisión; los demás son <b>datos de prueba</b> convertidos desde QGIS.</span>
          <span v-else>Por ahora solo hay <b>datos de prueba</b> convertidos desde QGIS. Los estudios del CEDESU aparecerán aquí cuando se aprueben y publiquen en la pantalla Revisión.</span>
        </div>
        <div v-if="loteList.length" class="callout warn catalog-note" role="note">
          <Icon name="alert-triangle" />
          <span>Los conjuntos marcados <b>Sin publicar</b> son las capas que cargaste en esta sesión. Sus estudios se crearon con los metadatos de cada archivo y desaparecen al cerrar la sesión o recargar la página.</span>
        </div>
        <div v-if="session.admin && hiddenCount" class="callout info catalog-note" role="note">
          <Icon name="info" />
          <span>{{ hiddenCount === 1 ? 'Hay 1 conjunto de prueba eliminado' : `Hay ${hiddenCount} conjuntos de prueba eliminados` }} del catálogo en este navegador. <button type="button" class="link-btn" @click="restoreDatasets">Restaurar</button></span>
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
        <div class="catalog" :class="{ 'is-admin': session.admin }">
          <template v-if="list.length">
            <div class="cat-headrow" aria-hidden="true"><span>Conjunto de datos</span><span>Tema</span><span>Sistema de referencia</span><span></span></div>
            <article v-for="s in list" :key="s.id" class="cat-row" :data-study="s.id">
              <div class="cat-main">
                <h2>{{ s.title }} <span v-if="s.lote && !s.published" class="badge badge-warn">Sin publicar · solo esta sesión</span><span v-else-if="s.published" class="badge badge-ok">Publicada</span><span v-else class="badge badge-info">Datos de prueba</span><span v-if="s.edited" class="badge">Editado en este navegador</span></h2>
                <p class="desc" :title="s.desc && s.desc.length > 220 ? s.desc : null">{{ s.desc }}</p>
                <div class="facts">
                  <span v-if="s.date"><Icon name="calendar" class="ic-14" />{{ fmtDate(s.date) }}</span>
                  <span v-if="s.m.fuente && s.m.fuente !== '—'"><Icon name="building-2" class="ic-14" />{{ s.m.fuente }}</span>
                  <span v-for="f in s.facts" :key="f">{{ f }}</span>
                </div>
              </div>
              <div class="col col-theme"><span class="k">Tema</span><b>{{ s.theme }}</b></div>
              <div class="col col-crs"><span class="k">Referencia</span><b class="mono">{{ crsCodes(s.m) }}</b></div>
              <div class="actions">
                <div class="act-main">
                  <button type="button" class="btn btn-secondary btn-sm" data-act="meta" :aria-label="`Ficha de ${s.title}`" @click="showLayerInfo(s.id)"><Icon name="file-text" />Ficha</button>
                  <button v-if="!s.lote || onMap(s)" type="button" class="btn btn-primary btn-sm" data-act="map" @click="viewStudyOnMap(s.id)"><Icon name="map" />Ver en el mapa</button>
                  <button v-else-if="session.admin" type="button" class="btn btn-primary btn-sm" data-act="open" @click="openInUpload(s)"><Icon name="upload" />Abrir en Carga</button>
                </div>
                <!-- Administración: separada de la consulta y solo con sesión -->
                <div v-if="session.admin && !s.published" class="act-admin" role="group" :aria-label="`Administración de ${s.title}`">
                  <button type="button" class="btn btn-quiet btn-sm" data-act="edit" :aria-label="`Editar el estudio ${s.title}`" @click="editStudy(s)"><Icon name="pencil" />Editar</button>
                  <button type="button" class="btn btn-quiet btn-sm danger" data-act="delete" :aria-label="`Eliminar el estudio ${s.title}`" @click="removeStudy(s)"><Icon name="trash-2" />Eliminar</button>
                </div>
              </div>
            </article>
          </template>
          <div v-else class="catalog-empty">
            <template v-if="all.length">
              <strong>Ningún conjunto coincide con los filtros</strong>Quita algún filtro o prueba con otra palabra.
              <div class="catalog-empty-action"><button type="button" class="btn btn-secondary btn-sm" @click="reset">Quitar filtros</button></div>
            </template>
            <template v-else>
              <strong>El catálogo está vacío</strong>Se eliminaron todos los conjuntos en este navegador.
              <div v-if="session.admin && hiddenCount" class="catalog-empty-action"><button type="button" class="btn btn-secondary btn-sm" @click="restoreDatasets">Restaurar conjuntos</button></div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
