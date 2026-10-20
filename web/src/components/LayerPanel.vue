<script setup>
import { ref, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import LayerSym from './LayerSym.vue';
import { ui, setDock, openMenu, isMobile } from '../stores/ui.js';
import { session } from '../stores/session.js';
import { layers, toggleLayer, toggleGroup, selectLayer, moveLayer, showProps, showLayerInfo, zoomToLayer, removeSessionLayer } from '../stores/layers.js';
import { mapState, setBasemap } from '../stores/map.js';
import { GROUPS } from '../lib/datasets.js';
import { sheetSwipe } from '../lib/ui-helpers.js';

const router = useRouter();
const dock = ref(null);
const filterEl = ref(null);
const swipe = sheetSwipe(() => dock.value, isMobile, () => setDock('left', false));

const BASES = [['osm', 'Calles', 'thumb-osm'], ['satellite', 'Satélite', 'thumb-sat'], ['topo', 'Topográfico', 'thumb-topo']];

const q = computed(() => layers.filter.trim().toLowerCase());
const groups = computed(() => GROUPS.map(g => {
  const all = layers.entries.filter(l => l.group === g.id);
  const items = all.filter(l => !q.value || l.name.toLowerCase().includes(q.value));
  const hidden = (q.value && !items.length) || (g.id === 'sesion' && !items.length && !session.admin && !q.value);
  return { ...g, all, items, hidden, visibleCount: all.filter(l => l.visible).length, collapsed: layers.collapsed.includes(g.id) && !q.value };
}).filter(g => !g.hidden));

function close() {
  setDock('left', false);
  nextTick(() => document.querySelector('[data-dock-open="left"]')?.focus({ preventScroll: true }));
}

function openLayerMenu(id, anchor) {
  const l = layers.entries.find(x => x.id === id);
  const same = layers.entries.filter(x => x.group === l.group);
  const i = same.indexOf(l);
  const items = [
    { act: 'props', icon: 'info', label: 'Propiedades' },
    { act: 'meta', icon: 'file-text', label: 'Ficha de metadatos' },
    { act: 'zoom', icon: 'scan', label: 'Acercar a la extensión' },
    '-',
    { act: 'up', icon: 'arrow-up', label: 'Subir en el orden', disabled: i <= 0 },
    { act: 'down', icon: 'arrow-down', label: 'Bajar en el orden', disabled: i >= same.length - 1 }
  ];
  if (l.kind === 'session') items.push('-', { act: 'remove', icon: 'x', label: 'Quitar capa de sesión' });
  openMenu(anchor, items, { align: 'right', onSelect: act => layerAction(id, act) });
}

function layerAction(id, act) {
  if (act === 'props') showProps(id, 'info');
  else if (act === 'meta') showLayerInfo(id);
  else if (act === 'zoom') zoomToLayer(id);
  else if (act === 'up' || act === 'down') {
    moveLayer(id, act === 'up' ? -1 : 1);
    nextTick(() => document.querySelector(`[data-layer="${id}"] [data-menu]`)?.focus());
  } else if (act === 'remove') removeSessionLayer(id);
}

function onContext(e, id) {
  e.preventDefault();
  openLayerMenu(id, e.currentTarget.querySelector('[data-menu]'));
}
function clearFilter() { layers.filter = ''; filterEl.value?.focus(); }
</script>

<template>
  <aside id="layersDock" ref="dock" class="dock dock-left" :inert="!ui.docks.left" aria-labelledby="layersTitle">
    <div class="dock-head" v-on="swipe">
      <h2 id="layersTitle"><Icon name="layers" />Capas <span class="count">{{ layers.entries.length }}</span></h2>
      <button type="button" class="icon-btn" data-tip="Ocultar panel de capas" aria-label="Ocultar panel de capas" @click="close">
        <Icon name="panel-left" class="ic-desk" /><Icon name="x" class="ic-sheet" />
      </button>
    </div>
    <div class="layer-filter">
      <div class="input-search">
        <Icon name="filter" />
        <input ref="filterEl" v-model="layers.filter" class="input" type="search" placeholder="Filtrar capas" aria-label="Filtrar capas">
      </div>
    </div>
    <div class="dock-body">
      <div class="demo-note" role="note">
        <Icon name="info" />
        <span>Datos de prueba convertidos desde QGIS para revisar el visor. No son estudios publicados por CEDESU.</span>
      </div>
      <div class="layer-tree" role="tree" aria-label="Árbol de capas">
        <div v-for="g in groups" :key="g.id" class="lgroup" :data-group="g.id" :data-collapsed="String(g.collapsed)">
          <button type="button" class="lgroup-head" :aria-expanded="String(!g.collapsed)" @click="toggleGroup(g.id)">
            <Icon name="chevron-down" class="ic-14 chev" />{{ g.name }}<span class="gcount">{{ g.visibleCount }}/{{ g.all.length }}</span>
          </button>
          <div class="lgroup-body">
            <ul role="group">
              <li v-for="l in g.items" :key="l.id" class="lrow" role="treeitem" :data-layer="l.id" :aria-selected="String(layers.selected === l.id)"
                @contextmenu="onContext($event, l.id)">
                <input type="checkbox" class="vis" :checked="l.visible" :aria-label="`Mostrar ${l.name}`" @change="toggleLayer(l.id, $event.target.checked)">
                <LayerSym :sym="l.sym" />
                <button type="button" class="lname" :title="l.name" @click="selectLayer(l.id)">{{ l.name }}</button>
                <span class="meta-flags">
                  <span v-if="l.loading" class="nodata" role="status" aria-label="Cargando"><Icon name="loader-2" class="ic-14 ic-spin" /></span>
                  <span v-if="l.error" class="nodata err" role="img" :aria-label="`Error: ${l.error}`" :data-tip="l.error"><Icon name="alert-circle" class="ic-14" /></span>
                  <button type="button" class="icon-btn icon-btn-sm" data-menu aria-haspopup="menu" aria-expanded="false" :aria-label="`Acciones de ${l.name}`"
                    @click="openLayerMenu(l.id, $event.currentTarget)">
                    <Icon name="more-horizontal" class="ic-14" />
                  </button>
                </span>
              </li>
              <li v-if="!g.items.length">
                <div class="empty">
                  <strong>Aún no hay capas de sesión</strong>Previsualiza un archivo en Carga de datos para verlo aquí. Las capas de sesión no se publican.
                  <button type="button" class="btn btn-secondary btn-sm" @click="router.push('/carga')"><Icon name="upload" />Cargar archivo</button>
                </div>
              </li>
            </ul>
          </div>
        </div>
        <div v-if="!groups.length" class="empty">
          <strong>Ninguna capa coincide con «{{ layers.filter }}»</strong>Revisa la ortografía o borra el filtro.
          <button type="button" class="btn btn-secondary btn-sm" @click="clearFilter">Borrar filtro</button>
        </div>
      </div>
    </div>
    <div class="basemaps" role="radiogroup" aria-labelledby="basemapLabel">
      <span id="basemapLabel" class="label">Mapa base</span>
      <div class="basemap-list">
        <button v-for="[key, label, thumb] in BASES" :key="key" type="button" class="basemap-opt" role="radio"
          :aria-checked="String(mapState.base === key)" @click="setBasemap(key)">
          <span class="thumb" :class="thumb"></span>{{ label }}
        </button>
      </div>
    </div>
  </aside>
</template>
