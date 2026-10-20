<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, onActivated, onDeactivated } from 'vue';
import Icon from '../components/Icon.vue';
import LayerPanel from '../components/LayerPanel.vue';
import PropsPanel from '../components/PropsPanel.vue';
import MapNeatline from '../components/MapNeatline.vue';
import { ui, setDock } from '../stores/ui.js';
import { layers, entryById } from '../stores/layers.js';
import { gps } from '../stores/gps.js';
import { mapState, initMap, fitStart, refreshSize, setMapActive, setTool, restartMeasure, zoomBy, flyToState, locate, coordText, setGpsMarkers } from '../stores/map.js';

defineOptions({ name: 'MapView' });

const mapEl = ref(null);
const neat = ref(null);

const TOOLS = [['pan', 'hand', 'Desplazar'], ['identify', 'crosshair', 'Identificar elemento'], ['distance', 'ruler', 'Medir distancia'], ['area', 'pentagon', 'Medir área']];
const activeName = computed(() => entryById(layers.selected)?.name || 'ninguna');
const visibleCount = computed(() => layers.entries.filter(l => l.visible).length);
const tasks = computed(() => ui.tasks.map(t => t.label).join(' · '));

function pickTool(t) { setTool(mapState.tool === t && t !== 'pan' ? 'pan' : t); }
const printMap = () => window.print();

/* El contenedor puede no tener tamaño en el primer cuadro: el encuadre inicial
   espera a que lo tenga, y cualquier cambio de tamaño se comunica al mapa. */
let fitted = false;
const sizeWatch = new ResizeObserver(() => {
  const el = mapEl.value;
  if (!el?.clientWidth || !el.clientHeight) return;
  refreshSize();
  if (!fitted) { fitted = true; fitStart(); }
  neat.value?.schedule();
});
onMounted(() => {
  initMap(mapEl.value, layers.entries.map(e => e.olLayer));
  setGpsMarkers(gps.points);
  sizeWatch.observe(mapEl.value);
});
onBeforeUnmount(() => sizeWatch.disconnect());
onActivated(() => { setMapActive(true); neat.value?.schedule(); });
onDeactivated(() => setMapActive(false));
/* Al abrir o cerrar un panel cambia el área útil: el mapa y el marco se recalculan al terminar la transición */
watch(() => [ui.docks.left, ui.docks.right], () => setTimeout(() => { neat.value?.schedule(); }, 300));
</script>

<template>
  <section id="screen-geoportal" class="screen active" aria-label="Visor cartográfico">
    <div id="workspace" class="workspace" :class="{ 'left-closed': !ui.docks.left, 'right-closed': !ui.docks.right }">
      <div class="print-head">Geoportal CEDESU · Estado de Campeche</div>
      <div class="map-stage">
        <div id="olMap" ref="mapEl" class="map-canvas" role="application" aria-label="Mapa interactivo del Estado de Campeche"></div>
      </div>

      <MapNeatline ref="neat" />
      <LayerPanel />
      <PropsPanel />

      <button type="button" class="dock-reopen left" data-dock-open="left" aria-label="Mostrar panel de capas" @click="setDock('left', true)">
        <Icon name="layers" />Capas
      </button>
      <button type="button" class="dock-reopen right" data-dock-open="right" aria-label="Mostrar panel de propiedades" @click="setDock('right', true)">
        <Icon name="info" />Propiedades
      </button>

      <div class="map-tools" role="toolbar" aria-label="Herramientas del mapa" aria-orientation="vertical">
        <button v-for="[t, icon, label] in TOOLS" :key="t" type="button" class="icon-btn" :data-tool="t" :aria-pressed="String(mapState.tool === t)"
          :data-tip="label" :aria-label="label" @click="pickTool(t)"><Icon :name="icon" /></button>
        <span class="sep" role="separator"></span>
        <button type="button" class="icon-btn" data-tip="Imprimir mapa" aria-label="Imprimir mapa" @click="printMap"><Icon name="printer" /></button>
      </div>

      <div class="measure-panel" :class="{ 'is-on': mapState.measure.type }" role="status" aria-live="polite">
        <span>{{ mapState.measure.hint }}</span>
        <b>{{ mapState.measure.value }}</b>
        <button type="button" class="btn btn-quiet btn-sm" @click="restartMeasure">Borrar</button>
        <button type="button" class="icon-btn icon-btn-sm" aria-label="Terminar medición" @click="setTool('pan')"><Icon name="x" /></button>
      </div>

      <div class="map-nav">
        <div class="ctrl-group">
          <button type="button" class="icon-btn" data-tip="Acercar" aria-label="Acercar" @click="zoomBy(1)"><Icon name="plus" /></button>
          <button type="button" class="icon-btn" data-tip="Alejar" aria-label="Alejar" @click="zoomBy(-1)"><Icon name="minus" /></button>
        </div>
        <div class="ctrl-group">
          <button type="button" class="icon-btn" data-tip="Extensión del estado" aria-label="Volver a la extensión del estado" @click="flyToState"><Icon name="scan" /></button>
          <button type="button" class="icon-btn" data-tip="Mi ubicación" aria-label="Centrar en mi ubicación" :disabled="mapState.locating" @click="locate">
            <Icon :name="mapState.locating ? 'loader-2' : 'locate'" :class="{ 'ic-spin': mapState.locating }" />
          </button>
        </div>
      </div>

      <div class="mobile-dock-bar">
        <button type="button" class="btn btn-secondary" @click="setDock('left', !ui.docks.left)"><Icon name="layers" />Capas</button>
        <button type="button" class="btn btn-secondary" @click="setDock('right', !ui.docks.right)"><Icon name="info" />Propiedades</button>
      </div>
    </div>

    <footer class="statusbar" aria-label="Estado del mapa">
      <span class="cell">
        <label for="coordSystem" class="sr-only">Sistema de coordenadas mostrado</label>
        <select id="coordSystem" v-model="mapState.crs" class="select">
          <option value="wgs84">WGS 84 · grados</option>
          <option value="utm15">UTM 15N · m</option>
          <option value="utm16">UTM 16N · m</option>
        </select>
      </span>
      <span class="cell coord"><Icon name="mouse-pointer-2" class="ic-14" /><span class="mono">{{ coordText() }}</span></span>
      <span class="cell">Escala <span class="mono">{{ mapState.scale }}</span></span>
      <span class="cell opt">Capa activa <b>{{ activeName }}</b></span>
      <span class="cell opt">Visibles <b class="tnum">{{ visibleCount }}</b></span>
      <span class="cell opt2"><span class="dot" :class="ui.tasks.length ? 'warn' : 'idle'"></span><span>{{ tasks || 'Sin procesos' }}</span></span>
      <span class="cell"><span class="dot" :class="mapState.net.state"></span><span>{{ mapState.net.text }}</span></span>
    </footer>
  </section>
</template>
