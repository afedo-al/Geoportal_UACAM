<script setup>
/* Mapa de la pantalla de captura GPS: un clic toma las coordenadas para el formulario,
   muestra los puntos guardados y resalta el seleccionado. Es independiente del visor principal
   (no comparte selección ni herramientas con él). */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import OLMap from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Overlay from 'ol/Overlay.js';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj.js';
import { BASEMAPS } from '../stores/map.js';
import { STATE_BOUNDS } from '../lib/geo.js';

const props = defineProps({
  points: { type: Array, default: () => [] },
  lat: { type: [String, Number], default: '' },
  lon: { type: [String, Number], default: '' },
  selected: { type: String, default: null }
});
const emit = defineEmits(['pick', 'select']);

const el = ref(null);
let map = null, pointsSrc = null, draftSrc = null, tip = null, tipEl = null;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const dur = ms => (reduce.matches ? 0 : ms);

const pointStyle = new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#d4a64c' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }) });
const selectedStyle = [
  new Style({ image: new CircleStyle({ radius: 12, fill: new Fill({ color: 'rgba(212,166,76,0.22)' }), stroke: new Stroke({ color: '#0c1e35', width: 1.5 }) }) }),
  new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#d4a64c' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }) })
];
/* Punto del formulario: anillo azul con centro blanco, distinto de los puntos ya guardados */
const draftStyle = [
  new Style({ image: new CircleStyle({ radius: 11, fill: new Fill({ color: 'rgba(33,76,126,0.16)' }), stroke: new Stroke({ color: '#214c7e', width: 2 }) }) }),
  new Style({ image: new CircleStyle({ radius: 3, fill: new Fill({ color: '#214c7e' }) }) })
];

function drawPoints() {
  if (!pointsSrc) return;
  pointsSrc.clear();
  props.points.forEach(p => {
    const f = new Feature(new Point(fromLonLat([p.lon, p.lat])));
    f.set('gpsId', p.id); f.set('name', p.name);
    f.setStyle(p.id === props.selected ? selectedStyle : pointStyle);
    pointsSrc.addFeature(f);
  });
}

const num = v => Number(String(v ?? '').replace(',', '.'));
function drawDraft() {
  if (!draftSrc) return;
  draftSrc.clear();
  const lat = num(props.lat), lon = num(props.lon);
  if (String(props.lat).trim() === '' || String(props.lon).trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  draftSrc.addFeature(new Feature(new Point(fromLonLat([lon, lat]))));
}

/* Si el punto del formulario o el seleccionado quedan fuera de la vista, el mapa se desplaza hasta ellos.
   Las animaciones de OpenLayers se cancelan en cuanto la persona arrastra el mapa. */
function reveal(lon, lat) {
  const view = map?.getView();
  if (!view || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const c = fromLonLat([lon, lat]);
  const ext = view.calculateExtent(map.getSize());
  const inside = c[0] > ext[0] && c[0] < ext[2] && c[1] > ext[1] && c[1] < ext[3];
  if (!inside) view.animate({ center: c, duration: dur(450) });
}

function hitAt(pixel) { return map.forEachFeatureAtPixel(pixel, f => (f.get('gpsId') ? f : null), { hitTolerance: 4, layerFilter: l => l.getSource() === pointsSrc }); }

onMounted(() => {
  const osm = BASEMAPS.osm;
  pointsSrc = new VectorSource();
  draftSrc = new VectorSource();
  tipEl = document.createElement('div'); tipEl.className = 'map-tip';
  tip = new Overlay({ element: tipEl, offset: [0, -14], positioning: 'bottom-center', stopEvent: false });
  map = new OLMap({
    target: el.value,
    layers: [
      new TileLayer({ source: new XYZ({ url: osm.url, maxZoom: osm.maxZoom, attributions: osm.attributions, crossOrigin: 'anonymous' }) }),
      new VectorLayer({ source: pointsSrc, zIndex: 2 }),
      new VectorLayer({ source: draftSrc, style: draftStyle, zIndex: 3 })
    ],
    controls: defaultControls({ rotate: false, attributionOptions: { collapsible: false, tipLabel: 'Atribuciones' }, zoomOptions: { zoomInTipLabel: 'Acercar', zoomOutTipLabel: 'Alejar' } }),
    view: new View({ center: fromLonLat([-90.5, 19.3]), zoom: 7, maxZoom: 19 })
  });
  map.addOverlay(tip);
  const [[s, w], [n, e]] = STATE_BOUNDS;
  map.getView().fit(transformExtent([w, s, e, n], 'EPSG:4326', 'EPSG:3857'), { padding: [24, 24, 24, 24] });
  map.on('click', ev => {
    const f = hitAt(ev.pixel);
    if (f) { emit('select', f.get('gpsId')); return; }
    const [lon, lat] = toLonLat(ev.coordinate);
    emit('pick', lat, lon);
  });
  map.on('pointermove', ev => {
    if (ev.dragging) { tip.setPosition(undefined); return; }
    const f = hitAt(ev.pixel);
    el.value.style.cursor = f ? 'pointer' : 'crosshair';
    if (f) { tipEl.textContent = f.get('name'); tip.setPosition(f.getGeometry().getCoordinates()); } else tip.setPosition(undefined);
  });
  drawPoints(); drawDraft();
});
onBeforeUnmount(() => { map?.setTarget(undefined); map = null; });

watch(() => props.points.map(p => `${p.id}:${p.lat}:${p.lon}:${p.name}`).join('|'), drawPoints);
watch(() => props.selected, id => {
  drawPoints();
  const p = props.points.find(x => x.id === id);
  if (p) reveal(p.lon, p.lat);
});
/* Solo se desplaza con una coordenada completa y válida: no persigue cada tecla mientras se escribe */
let typing = 0;
watch(() => [props.lat, props.lon], () => {
  drawDraft();
  clearTimeout(typing);
  if (draftSrc?.getFeatures().length) typing = setTimeout(() => reveal(num(props.lon), num(props.lat)), 350);
});
</script>

<template>
  <div ref="el" class="gps-map ol-preview" role="application"
    aria-label="Mapa para elegir la ubicación del punto: haz clic para tomar latitud y longitud, o escríbelas en el formulario"></div>
</template>
