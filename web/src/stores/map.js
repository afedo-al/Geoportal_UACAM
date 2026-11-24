/* Mapa 2D con OpenLayers: capas base, interacción, medición, ventanas y controles.
   Los objetos de OpenLayers viven fuera del estado reactivo de Vue (son pesados);
   solo el estado que pinta la interfaz está en mapState. */
import { reactive } from 'vue';
import OLMap from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import LineString from 'ol/geom/LineString.js';
import Polygon, { circular } from 'ol/geom/Polygon.js';
import Overlay from 'ol/Overlay.js';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style.js';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj.js';
import { getDistance } from 'ol/sphere.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import Attribution from 'ol/control/Attribution.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import DoubleClickZoom from 'ol/interaction/DoubleClickZoom.js';
import { startTask, showToast, ui } from './ui.js';
import { START_BOUNDS, STATE_BOUNDS, formatCoord, scaleDenominator, niceScale, geodesicArea, fmtLen, fmtArea } from '../lib/geo.js';
import { safePhotoURL, fmtDay } from '../lib/format.js';
import { CFG } from '../config.js';

/* ---------------- mapas base ---------------- */
export const BASEMAPS = {
  /* Fondo discreto de CARTO (sin clave). Sus límites administrativos son tenues y no se pueden quitar. */
  claro: { urls: ['a', 'b', 'c', 'd'].map(s => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`), maxZoom: 19, attributions: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' },
  osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19, attributions: '© colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 19, attributions: '© Esri, Maxar, Earthstar Geographics' },
  topo: { urls: ['a', 'b', 'c'].map(s => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`), maxZoom: 17, attributions: '© <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA), datos © OpenStreetMap' }
};

/* Estilo propio sin límites administrativos, solo si se configuró la clave y el estilo de MapTiler */
if (CFG.mapStyle.key && CFG.mapStyle.id) {
  BASEMAPS.limpio = {
    url: `https://api.maptiler.com/maps/${encodeURIComponent(CFG.mapStyle.id)}/{z}/{x}/{y}.png?key=${encodeURIComponent(CFG.mapStyle.key)}`,
    maxZoom: 19,
    attributions: '© <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>'
  };
}

export const mapState = reactive({
  ready: false,
  active: false,
  base: 'osm',
  tool: 'pan',
  crs: 'wgs84',
  lastCoord: null,
  scale: '—',
  net: { state: '', text: 'Mapa base: conectando…' },
  locating: false,
  measure: { type: null, hint: '', value: '', finished: false }
});

/* Otros módulos registran aquí lo que ocurre al interactuar con el mapa */
export const mapHooks = { featureClick: null, featureTip: null };

let map = null;
let baseLayer = null;
let dblZoom = null;
let netCount = { errors: 0, loaded: 0 };
const sources = {};
const gpsById = new Map();

export const getMap = () => map;

/* Acciones que esperan a que el mapa esté visible (por ejemplo, «Ver en el mapa»
   desde el catálogo: el visor todavía no se ha mostrado o está oculto) */
const queued = [];
let fitted = false;
const visible = () => map && mapState.active && fitted;
const whenVisible = fn => { if (visible()) fn(); else queued.push(fn); };
const flush = () => { if (visible()) queued.splice(0).forEach(fn => fn()); };
export function setMapActive(active) {
  mapState.active = active;
  if (active) { map?.updateSize(); flush(); }
}
export const addLayer = layer => map?.addLayer(layer);
export const removeLayer = layer => map?.removeLayer(layer);

/* ---------------- estilos ---------------- */
const styleCache = new Map();
function rgba(hex, a) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* Convierte {color, weight, opacity, fillColor, fillOpacity} (el formato del prototipo) en un estilo de OpenLayers.
   El relleno nunca es totalmente transparente: así la entidad se puede identificar con un clic en su interior. */
export function vectorStyle(o, pointColor = '#214c7e') {
  const key = [o.color, o.weight, o.opacity ?? 1, o.fillColor, o.fillOpacity, o.pointRadius ?? 5, pointColor].join('|');
  let s = styleCache.get(key);
  if (!s) {
    s = new Style({
      stroke: new Stroke({ color: rgba(o.color, o.opacity ?? 1), width: o.weight }),
      fill: new Fill({ color: rgba(o.fillColor || o.color, Math.max(o.fillOpacity ?? 0, 0.01)) }),
      image: new CircleStyle({ radius: Math.max(2, Math.min(20, Number(o.pointRadius) || 5)), fill: new Fill({ color: pointColor }), stroke: new Stroke({ color: '#ffffff', width: 1.5 }) })
    });
    styleCache.set(key, s);
  }
  return s;
}

export function createVectorLayer({ id, zIndex, style, visible = true }) {
  const layer = new VectorLayer({ source: new VectorSource(), style, zIndex, visible, updateWhileAnimating: false, updateWhileInteracting: false });
  layer.set('entryId', id);
  return layer;
}

const highlightStyle = feature => feature.getGeometry()?.getType() === 'Point'
  ? new Style({ image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#d4a64c' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }) })
  : new Style({ stroke: new Stroke({ color: '#d4a64c', width: 2.5 }) });

const measureStyle = feature => feature.get('vertex')
  ? new Style({ image: new CircleStyle({ radius: 3.5, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#0c1e35', width: 1.5 }) }) })
  : new Style({ stroke: new Stroke({ color: '#0c1e35', width: 2.5, lineDash: [6, 5] }), fill: new Fill({ color: 'rgba(212,166,76,0.18)' }) });

const gpsStyle = new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#d4a64c' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }) });
const markerStyle = new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#d4a64c' }), stroke: new Stroke({ color: '#0c1e35', width: 2 }) }) });
const locateStyle = new Style({ stroke: new Stroke({ color: '#214c7e', width: 1.5 }), fill: new Fill({ color: 'rgba(33,76,126,0.12)' }) });

/* ---------------- utilidades ---------------- */
export const lonLatToCoord = (lon, lat) => fromLonLat([lon, lat]);
export const bboxToExtent = ([south, north, west, east]) => transformExtent([west, south, east, north], 'EPSG:4326', 'EPSG:3857');
const boundsToExtent = b => transformExtent([b[0][1], b[0][0], b[1][1], b[1][0]], 'EPSG:4326', 'EPSG:3857');

export function padding() {
  const pl = ui.docks.left && !ui.mobile ? document.getElementById('layersDock')?.offsetWidth || 0 : 0;
  const pr = ui.docks.right && !ui.mobile ? document.getElementById('propsDock')?.offsetWidth || 0 : 0;
  return [40, pr + 40, 40, pl + 40];
}

/* Con «reducir movimiento» activado en el sistema, el mapa salta al destino sin animar */
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motion = ms => (reducedMotion.matches ? 0 : ms);

export function flyToExtent(extent, { maxZoom = 18, duration = 600 } = {}) {
  if (!extent || extent.some(v => !Number.isFinite(v))) return;
  whenVisible(() => map.getView().fit(extent, { padding: padding(), duration: motion(duration), maxZoom }));
}
export const flyToState = () => flyToExtent(boundsToExtent(STATE_BOUNDS));
export const refreshSize = () => map?.updateSize();

export function flyTo(lat, lon, zoom, duration = 900) {
  whenVisible(() => map.getView().animate({ center: fromLonLat([lon, lat]), zoom, duration: motion(duration) }));
}
export function zoomBy(delta) {
  const v = map?.getView();
  if (v) v.animate({ zoom: v.getZoom() + delta, duration: motion(250) });
}

export function mapCoordToLonLat(coord) { const [lon, lat] = toLonLat(coord); return { lat, lon }; }
export function pixelToLonLat(x, y) { const c = map?.getCoordinateFromPixel([x, y]); return c ? mapCoordToLonLat(c) : null; }
export function lonLatToPixel(lon, lat) { return map?.getPixelFromCoordinate(fromLonLat([lon, lat])); }

/* ---------------- estado de la red del mapa base ---------------- */
function setNet(state, text) { mapState.net.state = state; mapState.net.text = text; }
addEventListener('offline', () => setNet('err', 'Sin conexión a internet'));
addEventListener('online', () => setNet('', 'Mapa base: en línea'));

export function setBasemap(name) {
  const def = BASEMAPS[name];
  if (!def || !baseLayer) return;
  mapState.base = name;
  netCount = { errors: 0, loaded: 0 };
  setNet('idle', 'Mapa base: cargando…');
  const source = new XYZ({ url: def.url, urls: def.urls, maxZoom: def.maxZoom, attributions: def.attributions, crossOrigin: 'anonymous' });
  source.on('tileloadend', () => {
    netCount.loaded++;
    if (navigator.onLine) setNet(netCount.errors > netCount.loaded ? 'warn' : '', netCount.errors > 3 ? 'Mapa base: carga parcial' : 'Mapa base: en línea');
  });
  source.on('tileloaderror', () => {
    netCount.errors++;
    if (netCount.errors > 3) setNet(netCount.loaded ? 'warn' : 'err', netCount.loaded ? 'Mapa base: carga parcial' : 'Mapa base: sin respuesta');
  });
  baseLayer.setSource(source);
}

/* ---------------- coordenadas y escala ---------------- */
function updateScale() {
  const v = map?.getView();
  if (!v?.getCenter()) return;
  const [, lat] = toLonLat(v.getCenter());
  mapState.scale = niceScale(scaleDenominator(lat, v.getResolution()));
}
export function updateMapCoordinates(lat, lon) { mapState.lastCoord = [lat, lon]; }
export const coordText = () => mapState.lastCoord ? formatCoord(mapState.lastCoord[0], mapState.lastCoord[1], mapState.crs) : '—';

/* ---------------- ventana emergente y rótulo ---------------- */
let popup = null, popupEl = null, tipOverlay = null, tipEl = null;

function buildPopup({ title, meta = [], description = '', photo = '' }) {
  popupEl.replaceChildren();
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'map-popup-close'; close.setAttribute('aria-label', 'Cerrar'); close.textContent = '×';
  close.addEventListener('click', hidePopup);
  const t = document.createElement('div'); t.className = 'popup-title'; t.textContent = title;
  const m = document.createElement('div'); m.className = 'popup-meta';
  meta.forEach(([text, mono], i) => {
    if (i) m.append(document.createElement('br'));
    const s = document.createElement('span'); if (mono) s.className = 'mono'; s.textContent = text; m.append(s);
  });
  if (description) { m.append(document.createElement('br'), document.createTextNode(description)); }
  if (safePhotoURL(photo)) {
    const img = document.createElement('img'); img.className = 'gps-popup-photo'; img.alt = 'Fotografía del punto'; img.src = safePhotoURL(photo); m.append(img);
  }
  popupEl.append(close, t, m);
}
export function showPopup(coord, content) {
  if (!popup) return;
  buildPopup(content);
  popup.setPosition(coord);
}
export function hidePopup() { popup?.setPosition(undefined); }

export function showSearchMarker(lat, lon, label) {
  if (!sources.marker) return whenVisible(() => showSearchMarker(lat, lon, label));
  sources.marker.clear();
  const f = new Feature(new Point(fromLonLat([lon, lat])));
  sources.marker.addFeature(f);
  const coord = fromLonLat([lon, lat]);
  setTimeout(() => showPopup(coord, { title: label, meta: [[formatCoord(lat, lon, mapState.crs), true]] }), 950);
}

/* ---------------- GPS ---------------- */
export function setGpsMarkers(points) {
  if (!sources.gps) return;
  sources.gps.clear();
  gpsById.clear();
  points.forEach(p => {
    const f = new Feature(new Point(fromLonLat([p.lon, p.lat])));
    f.set('gpsId', p.id);
    gpsById.set(p.id, p);
    sources.gps.addFeature(f);
  });
}
function gpsPopupContent(p) {
  return { title: p.name, meta: [[`${Number(p.lat).toFixed(6)}, ${Number(p.lon).toFixed(6)}`, true], [`${p.type} · ${fmtDay(p.date)} ${p.time || ''}`.trim()]], description: p.description, photo: p.photo };
}
export function focusGpsPoint(p) {
  flyTo(p.lat, p.lon, 15, 800);
  setTimeout(() => showPopup(fromLonLat([p.lon, p.lat]), gpsPopupContent(p)), 850);
}
export function showAllGps(points) {
  if (!points.length) return;
  const lons = points.map(p => p.lon), lats = points.map(p => p.lat);
  const pad = 0.15;
  const dx = (Math.max(...lons) - Math.min(...lons)) * pad || 0.01, dy = (Math.max(...lats) - Math.min(...lats)) * pad || 0.01;
  flyToExtent(transformExtent([Math.min(...lons) - dx, Math.min(...lats) - dy, Math.max(...lons) + dx, Math.max(...lats) + dy], 'EPSG:4326', 'EPSG:3857'), { maxZoom: 15 });
}

/* ---------------- Mi ubicación ---------------- */
export function locate() {
  if (!navigator.geolocation) return showToast('error', 'Ubicación no disponible', 'Este navegador no ofrece geolocalización.');
  mapState.locating = true;
  const done = startTask('Obteniendo ubicación');
  navigator.geolocation.getCurrentPosition(pos => {
    done(); mapState.locating = false;
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    flyTo(lat, lon, 15, 800);
    sources.locate.clear();
    sources.locate.addFeature(new Feature(circular([lon, lat], accuracy, 64).transform('EPSG:4326', 'EPSG:3857')));
    showToast('info', 'Tu ubicación', `Precisión aproximada: ${Math.round(accuracy)} m`);
  }, err => {
    done(); mapState.locating = false;
    const msg = { 1: 'Permiso de ubicación denegado. Actívalo en la configuración del navegador.', 2: 'No se pudo determinar la ubicación.', 3: 'La solicitud de ubicación tardó demasiado.' }[err.code] || err.message;
    showToast('error', 'Sin ubicación', msg);
  }, { enableHighAccuracy: true, timeout: 12000 });
}

/* ---------------- herramientas: identificar y medir ---------------- */
let measurePts = [];

export function setTool(tool) {
  mapState.tool = tool;
  const el = map?.getTargetElement();
  el?.classList.toggle('is-identifying', tool === 'identify');
  el?.classList.toggle('is-measuring', tool === 'distance' || tool === 'area');
  if (tool === 'distance' || tool === 'area') startMeasure(tool); else stopMeasure();
}

function startMeasure(type) {
  stopMeasure(false);
  Object.assign(mapState.measure, {
    type, finished: false, value: '',
    hint: type === 'distance' ? 'Clic para añadir vértices · doble clic para terminar' : 'Dibuja el polígono · doble clic para cerrarlo'
  });
  measurePts = [];
  dblZoom?.setActive(false);
}
function stopMeasure() {
  sources.measure?.clear();
  measurePts = [];
  mapState.measure.type = null;
  mapState.measure.value = '';
  dblZoom?.setActive(true);
}
export function restartMeasure() { if (mapState.measure.type) startMeasure(mapState.measure.type); }

function drawMeasure() {
  const src = sources.measure;
  src.clear();
  const lonlat = measurePts.map(c => toLonLat(c));
  const type = mapState.measure.type;
  if (measurePts.length > 1) {
    src.addFeature(new Feature(type === 'area' && measurePts.length > 2 ? new Polygon([measurePts]) : new LineString(measurePts)));
  }
  measurePts.forEach(c => { const v = new Feature(new Point(c)); v.set('vertex', true); src.addFeature(v); });
  if (type === 'distance') {
    let d = 0; for (let i = 1; i < lonlat.length; i++) d += getDistance(lonlat[i - 1], lonlat[i], 6371000);
    mapState.measure.value = lonlat.length > 1 ? fmtLen(d) : '';
  } else {
    mapState.measure.value = lonlat.length > 2 ? fmtArea(geodesicArea(lonlat)) : '';
  }
}

/* ---------------- eventos del mapa ---------------- */
function hitAt(pixel) {
  return map.forEachFeatureAtPixel(pixel, (feature, layer) => ({ feature, layer }), {
    layerFilter: l => !!l.get('entryId') || l === sources.gpsLayer, hitTolerance: 3
  });
}

let hovered = null, hoverRAF = 0, lastPixel = null;
function hover() {
  hoverRAF = 0;
  if (!map || !lastPixel) return;
  const hit = mapState.measure.type ? null : hitAt(lastPixel);
  const f = hit?.feature || null;
  map.getTargetElement().style.cursor = f ? 'pointer' : '';
  if (f === hovered) return;
  hovered = f;
  sources.highlight.clear();
  if (!f) { tipOverlay.setPosition(undefined); return; }
  sources.highlight.addFeature(new Feature(f.getGeometry()));
  const id = hit.layer.get('entryId');
  const text = id ? mapHooks.featureTip?.(id, f) : f.get('gpsId') ? gpsById.get(f.get('gpsId'))?.name : '';
  if (text) { tipEl.textContent = text; tipOverlay.setPosition(map.getCoordinateFromPixel(lastPixel)); }
  else tipOverlay.setPosition(undefined);
}

function onPointerMove(e) {
  if (e.dragging) { hovered = null; tipOverlay.setPosition(undefined); sources.highlight.clear(); return; }
  const { lat, lon } = mapCoordToLonLat(e.coordinate);
  updateMapCoordinates(lat, lon);
  lastPixel = e.pixel;
  if (hovered && tipOverlay.getPosition()) tipOverlay.setPosition(e.coordinate);
  if (!hoverRAF) hoverRAF = requestAnimationFrame(hover);
}

function onClick(e) {
  const { lat, lon } = mapCoordToLonLat(e.coordinate);
  if (mapState.measure.type) {
    if (mapState.measure.finished) startMeasure(mapState.measure.type);
    measurePts.push(e.coordinate);
    drawMeasure();
    return;
  }
  const hit = hitAt(e.pixel);
  if (hit) {
    const id = hit.layer.get('entryId');
    if (id) { mapHooks.featureClick?.(id, hit.feature); return; }
    const p = gpsById.get(hit.feature.get('gpsId'));
    if (p) { showPopup(fromLonLat([p.lon, p.lat]), gpsPopupContent(p)); return; }
  }
  hidePopup();
  if (mapState.tool === 'identify') {
    showToast('info', 'Sin entidades en este punto', `${formatCoord(lat, lon, mapState.crs)}. Activa una capa y haz clic sobre un elemento.`);
  }
}

function onDblClick() {
  const m = mapState.measure;
  if (!m.type || m.finished) return;
  measurePts.pop(); // el doble clic también registró un clic sencillo
  drawMeasure();
  m.finished = true;
  m.hint = m.type === 'distance' ? 'Distancia total · clic para medir de nuevo' : 'Área del polígono · clic para medir de nuevo';
}

/* ---------------- creación ---------------- */
export function initMap(target, layers = []) {
  if (map) return map;
  const mkSource = (zIndex, style) => {
    const source = new VectorSource();
    const layer = new VectorLayer({ source, style, zIndex, updateWhileAnimating: true });
    return { source, layer };
  };
  baseLayer = new TileLayer({ zIndex: 0 });
  const hi = mkSource(900, highlightStyle), me = mkSource(950, measureStyle), gp = mkSource(960, gpsStyle), mk = mkSource(965, markerStyle), lo = mkSource(955, locateStyle);
  Object.assign(sources, { highlight: hi.source, measure: me.source, gps: gp.source, gpsLayer: gp.layer, marker: mk.source, locate: lo.source });

  map = new OLMap({
    target,
    layers: [baseLayer, ...layers, hi.layer, lo.layer, me.layer, gp.layer, mk.layer],
    controls: [new Attribution({ collapsible: false, tipLabel: 'Atribuciones' }), new ScaleLine({ units: 'metric', minWidth: 100 })],
    interactions: defaultInteractions({ doubleClickZoom: true }),
    view: new View({ center: fromLonLat([-90.53, 19.83]), zoom: 9, minZoom: 2, maxZoom: 19 })
  });
  dblZoom = map.getInteractions().getArray().find(i => i instanceof DoubleClickZoom);

  tipEl = document.createElement('div'); tipEl.className = 'map-tip';
  tipOverlay = new Overlay({ element: tipEl, offset: [0, -12], positioning: 'bottom-center', stopEvent: false });
  popupEl = document.createElement('div'); popupEl.className = 'map-popup';
  popup = new Overlay({ element: popupEl, offset: [0, -12], positioning: 'bottom-center', stopEvent: true, autoPan: { animation: { duration: motion(250) }, margin: 24 } });
  map.addOverlay(tipOverlay);
  map.addOverlay(popup);

  map.on('pointermove', onPointerMove);
  map.on('click', onClick);
  map.on('dblclick', onDblClick);
  map.on('moveend', updateScale);
  map.getView().on('change:resolution', updateScale);
  map.getTargetElement().addEventListener('pointerleave', () => { lastPixel = null; hovered = null; sources.highlight.clear(); tipOverlay.setPosition(undefined); });

  setBasemap('osm');
  updateScale();
  mapState.ready = true;
  if (!navigator.onLine) setNet('err', 'Sin conexión a internet');
  return map;
}

/* Encuadre inicial: todo el estado, respetando los paneles abiertos */
export function fitStart() {
  if (!map) return;
  map.updateSize();
  map.getView().fit(boundsToExtent(START_BOUNDS), { padding: padding(), duration: 0 });
  fitted = true;
  flush();
}
