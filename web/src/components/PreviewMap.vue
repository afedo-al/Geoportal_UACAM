<script setup>
/* Vista previa de las geometrías de un archivo del lote (mapa independiente del visor) */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import OLMap from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Overlay from 'ol/Overlay.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import { fromLonLat } from 'ol/proj.js';
import { BASEMAPS, vectorStyle } from '../stores/map.js';

const props = defineProps({
  geojson: { type: Object, default: null },
  featureStyle: { type: Function, default: null }
});
const el = ref(null);
let map = null, layer = null, tip = null, tipEl = null, drawFrame = 0, drawVersion = 0;
const style = vectorStyle({ color: '#214c7e', weight: 1.4, fillColor: '#214c7e', fillOpacity: 0.18 }, '#214c7e');

function draw() {
  if (!map) return;
  const src = layer.getSource();
  drawVersion++;
  const version = drawVersion;
  if (drawFrame) cancelAnimationFrame(drawFrame);
  drawFrame = 0;
  src.clear();
  if (!props.geojson) return;
  const rawFeatures = props.geojson.features || [];
  const chunkSize = Math.max(1, Math.ceil(rawFeatures.length / 24));
  let index = 0;

  const paintChunk = () => {
    if (version !== drawVersion) return;
    const end = Math.min(index + chunkSize, rawFeatures.length);
    if (end > index) {
      src.addFeatures(new GeoJSON().readFeatures(
        { type: 'FeatureCollection', features: rawFeatures.slice(index, end) },
        { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
      ));
      index = end;
      map.updateSize();
    }
    if (index < rawFeatures.length) {
      drawFrame = requestAnimationFrame(paintChunk);
      return;
    }
    drawFrame = 0;
    const ext = src.getExtent();
    if (src.getFeatures().length && ext.every(Number.isFinite)) map.getView().fit(ext, { padding: [16, 16, 16, 16], maxZoom: 15 });
    else map.getView().setCenter(fromLonLat([-90.5, 19.3]));
  };

  paintChunk();
}

/* Rótulo con el primer atributo descriptivo de la entidad bajo el cursor */
function onMove(e) {
  const f = map.forEachFeatureAtPixel(e.pixel, x => x, { hitTolerance: 3 });
  if (!f) { tip.setPosition(undefined); return; }
  const p = f.getProperties(); delete p.geometry;
  const k = Object.keys(p).find(x => /nom|name|municipio|clave|tipo|id/i.test(x)) || Object.keys(p)[0];
  if (!k) { tip.setPosition(undefined); return; }
  tipEl.textContent = `${k}: ${p[k]}`;
  tip.setPosition(e.coordinate);
}

onMounted(() => {
  const osm = BASEMAPS.osm;
  layer = new VectorLayer({ source: new VectorSource(), style: feature => props.featureStyle ? vectorStyle(props.featureStyle(feature.getProperties()), '#214c7e') : style });
  tipEl = document.createElement('div'); tipEl.className = 'map-tip';
  tip = new Overlay({ element: tipEl, offset: [0, -12], positioning: 'bottom-center', stopEvent: false });
  map = new OLMap({
    target: el.value,
    layers: [new TileLayer({ source: new XYZ({ url: osm.url, maxZoom: osm.maxZoom, attributions: osm.attributions, crossOrigin: 'anonymous' }) }), layer],
    controls: defaultControls({ rotate: false, attributionOptions: { collapsible: false, tipLabel: 'Atribuciones' }, zoomOptions: { zoomInTipLabel: 'Acercar', zoomOutTipLabel: 'Alejar' } }),
    view: new View({ center: fromLonLat([-90.5, 19.3]), zoom: 6, maxZoom: 19 })
  });
  map.addOverlay(tip);
  map.on('pointermove', onMove);
  draw();
});
watch(() => props.geojson, draw);
watch(() => props.featureStyle, () => layer?.changed());
onBeforeUnmount(() => {
  drawVersion++;
  if (drawFrame) cancelAnimationFrame(drawFrame);
  map?.setTarget(undefined);
  map = null;
});
</script>

<template>
  <div ref="el" class="preview-map ol-preview" aria-label="Mapa de vista previa"></div>
</template>
