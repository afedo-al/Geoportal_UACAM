<script setup>
import { ref, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { ui } from '../stores/ui.js';
import { layers, studyList, showProps, focusFeature, showLayerInfo, loadVisibleDatasets } from '../stores/layers.js';
import { flyTo, showSearchMarker } from '../stores/map.js';
import { PLACES } from '../lib/datasets.js';
import { parseCoord } from '../lib/geo.js';
import { norm } from '../lib/format.js';

const router = useRouter();
const input = ref(null);
const q = ref('');
const open = ref(false);
const active = ref(-1);
const results = ref([]);

const placeholder = computed(() => ui.mobile ? 'Buscar lugar o capa' : 'Buscar lugar, coordenada o capa');

function goTo(lat, lon, zoom, label) {
  router.push('/');
  flyTo(lat, lon, zoom);
  showSearchMarker(lat, lon, label);
}

function build(text) {
  const nq = norm(text.trim());
  const out = [];
  const c = parseCoord(text);
  if (c) out.push({ group: 'Coordenada', icon: 'crosshair', t: `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`, s: 'Ir a esta coordenada (WGS 84)', run: () => goTo(c.lat, c.lon, 14, `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`) });
  if (nq.length < 2) return out;
  PLACES.filter(p => norm(p[0]).includes(nq) || norm(p[1]).includes(nq)).slice(0, 5)
    .forEach(p => out.push({ group: 'Lugares', icon: 'map-pin', t: p[0], s: `Municipio de ${p[1]} · coordenadas aproximadas`, run: () => goTo(p[2], p[3], 12, p[0]) }));
  layers.entries.filter(l => !l.hidden && norm(l.name).includes(nq)).slice(0, 5)
    .forEach(l => out.push({ group: 'Capas', icon: 'layers', t: l.name, s: l.group === 'pruebas' ? 'Capa de referencia' : l.remote ? 'Capa publicada' : 'Capa de sesión', run: () => { router.push('/'); showProps(l.id, 'info'); } }));
  layers.entries.filter(e => !e.hidden && e.geojson && e.def?.label).forEach(e => {
    const label = e.def.label;
    let n = 0;
    e.geojson.features.forEach((f, i) => {
      if (n >= 4 || !norm(f.properties?.[label]).includes(nq)) return;
      n++;
      out.push({ group: 'Entidades', icon: 'pentagon', t: String(f.properties[label]), s: e.name, run: () => focusFeature(e.id, i) });
    });
  });
  studyList().filter(s => norm(s.title).includes(nq) || norm(s.theme).includes(nq)).slice(0, 4)
    .forEach(s => out.push({ group: 'Estudios', icon: 'book-open', t: s.title, s: `${s.theme} · ${s.published ? 'publicado' : 'catálogo'}`, run: () => showLayerInfo(s.id) }));
  return out;
}

let deb = 0;
function render() {
  results.value = build(q.value);
  active.value = results.value.length ? 0 : -1;
  open.value = !!q.value.trim() && document.activeElement === input.value;
}
function onInput() { clearTimeout(deb); deb = setTimeout(render, 60); }
function onFocus() { loadVisibleDatasets(); if (q.value.trim()) render(); }
function close() { open.value = false; }
function onBlur() { setTimeout(close, 0); }

function setActive(i) {
  active.value = i;
  nextTick(() => document.getElementById(`sr-${i}`)?.scrollIntoView({ block: 'nearest' }));
}
function run(i) {
  const r = results.value[i];
  if (!r) return;
  close();
  input.value.blur();
  r.run();
}
function onKey(e) {
  const n = results.value.length;
  if (e.key === 'ArrowDown' && n) { e.preventDefault(); setActive((active.value + 1) % n); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setActive((active.value - 1 + n) % n); }
  else if (e.key === 'Enter') { e.preventDefault(); run(active.value); }
  else if (e.key === 'Escape') { if (open.value) { e.stopPropagation(); close(); } else input.value.blur(); }
}

/* Grupos visibles en el orden de los resultados */
const rows = computed(() => {
  let last = '';
  return results.value.map((r, i) => {
    const head = r.group !== last ? r.group : null;
    last = r.group;
    return { r, i, head };
  });
});
</script>

<template>
  <div class="global-search">
    <div class="search-box">
      <Icon name="search" />
      <input id="globalSearch" ref="input" v-model="q" type="search" autocomplete="off" spellcheck="false"
        :placeholder="placeholder" role="combobox" :aria-expanded="String(open)" aria-controls="searchResults"
        aria-autocomplete="list" aria-label="Buscar en DeltaMap-CEDESU" :aria-activedescendant="open && active >= 0 ? `sr-${active}` : null"
        @input="onInput" @focus="onFocus" @keydown="onKey" @blur="onBlur">
      <span class="kbd" aria-hidden="true">/</span>
    </div>
    <div id="searchResults" class="popover search-results" :class="{ 'is-open': open }" role="listbox" aria-label="Resultados de búsqueda"
      @pointerdown.prevent>
      <template v-for="row in rows" :key="row.i">
        <div v-if="row.head" class="sr-group" role="presentation">{{ row.head }}</div>
        <button :id="`sr-${row.i}`" type="button" class="menu-item sr-item" role="option" :aria-selected="String(row.i === active)" tabindex="-1" @click="run(row.i)">
          <Icon :name="row.r.icon" /><span><span class="t">{{ row.r.t }}</span><span class="s">{{ row.r.s }}</span></span>
        </button>
      </template>
      <div v-if="!results.length" class="sr-empty">
        Sin resultados para <b>«{{ q }}»</b>. Prueba con un municipio, el nombre de una capa o coordenadas como <span class="mono">19.84, -90.53</span>.
      </div>
    </div>
  </div>
</template>
