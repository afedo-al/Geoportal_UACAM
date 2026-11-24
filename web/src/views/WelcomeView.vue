<script setup>
/* Inicio: la puerta de entrada de DeltaMap-CEDESU. No es una portada: es un panel de trabajo con un mapa vivo,
   los estudios disponibles y los accesos que le sirven a cada persona (el público o la administración). */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import OLMap from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Zoom from 'ol/control/Zoom.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style.js';
import { fromLonLat } from 'ol/proj.js';
import Icon from '../components/Icon.vue';
import { PLACES } from '../lib/datasets.js';
import { studyList, showLayerInfo } from '../stores/layers.js';
import { session } from '../stores/session.js';
import { fmtDate } from '../lib/format.js';

const router = useRouter();
const logoUacam = `${import.meta.env.BASE_URL}img/uacam.webp`;
const logoCedesu = `${import.meta.env.BASE_URL}img/cedesu.webp`;

function go(path) { router.push(path); }
function focusSearch() { document.querySelector('input[type=search]')?.focus(); }

/* Accesos: todos ven el mapa y el catálogo; con sesión se suman los de trabajo */
const accesos = computed(() => {
  const list = [
    { icon: 'map', titulo: 'Explorar el mapa', texto: 'Activa capas, consulta sus datos y mide distancias y áreas.', run: () => go('/') },
    { icon: 'book-open', titulo: 'Catálogo de estudios', texto: 'Busca por tema o año y abre la ficha de cada estudio.', run: () => go('/catalogo') },
    { icon: 'search', titulo: 'Buscar un lugar o coordenada', texto: 'Escribe un municipio, una localidad o unas coordenadas.', run: focusSearch }
  ];
  if (session.admin) {
    list.push(
      { icon: 'upload', titulo: 'Cargar datos', texto: 'Sube archivos, revisa su vista previa y envíalos a revisión.', run: () => go('/carga'), admin: true },
      { icon: 'satellite-dish', titulo: 'Captura GPS', texto: 'Registra puntos de campo o importa un Excel.', run: () => go('/gps'), admin: true },
      { icon: 'shield-check', titulo: 'Revisión', texto: 'Aprueba, devuelve o publica las capas enviadas.', run: () => go('/revision'), admin: true }
    );
  }
  return list;
});

/* Estudios del catálogo (los publicados primero) */
const estudios = computed(() => studyList().slice(0, 6));
const totalEstudios = computed(() => studyList().length);

/* ---------------- mapa vivo ---------------- */
const mapEl = ref(null);
const current = ref(0);
const playing = ref(false);
const place = computed(() => PLACES[current.value]);
const coordText = computed(() => `${place.value[2].toFixed(2)}° N · ${Math.abs(place.value[3]).toFixed(2)}° O`);

let map = null;
let markers = null;
let timer = null;
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const dot = new Style({ image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#214c7e', width: 2 }) }) });
const halo = new Style({ image: new CircleStyle({ radius: 16, fill: new Fill({ color: 'rgba(212,166,76,0.3)' }) }) });
const active = new Style({ image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#d4a64c' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }) });

function fly(i, animate = true) {
  current.value = i;
  markers?.changed();
  const view = map?.getView();
  if (!view) return;
  const center = fromLonLat([PLACES[i][3], PLACES[i][2]]);
  if (animate && !reduced) view.animate({ center, zoom: 9.2, duration: 1800 });
  else { view.setCenter(center); view.setZoom(9.2); }
}
function next() { fly((current.value + 1) % PLACES.length); }
function play() { stop(); playing.value = true; timer = setInterval(() => { if (!document.hidden) next(); }, 7000); }
function stop() { playing.value = false; clearInterval(timer); timer = null; }
function togglePlay() { playing.value ? stop() : play(); }
function pick(i) { stop(); fly(i); }

onMounted(() => {
  const src = new VectorSource({
    features: PLACES.map(([name, , lat, lon], i) => {
      const f = new Feature({ geometry: new Point(fromLonLat([lon, lat])), name });
      f.set('i', i);
      return f;
    })
  });
  markers = new VectorLayer({ source: src, style: f => (f.get('i') === current.value ? [halo, active] : dot) });
  map = new OLMap({
    target: mapEl.value,
    controls: [new Zoom({ zoomInTipLabel: 'Acercar', zoomOutTipLabel: 'Alejar' })],
    interactions: defaultInteractions({ mouseWheelZoom: false }),   // la rueda sigue desplazando la página
    layers: [new TileLayer({ source: new XYZ({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19, crossOrigin: 'anonymous' }) }), markers],
    view: new View({ center: fromLonLat([-90.5, 19.2]), zoom: 6.8 })
  });
  /* Al tocar un punto, el mapa va a ese lugar; si la persona mueve el mapa, el recorrido se detiene */
  map.on('singleclick', e => {
    const f = map.forEachFeatureAtPixel(e.pixel, ft => ft, { layerFilter: l => l === markers });
    if (f) pick(f.get('i'));
  });
  map.on('pointermove', e => { mapEl.value.style.cursor = map.hasFeatureAtPixel(e.pixel, { layerFilter: l => l === markers }) ? 'pointer' : ''; });
  map.on('movestart', e => { if (e.map.getView().getInteracting()) stop(); });
  fly(0, false);
  setTimeout(() => { if (map) fly(0); }, 400);
  if (!reduced) play();
});

onBeforeUnmount(() => { stop(); map?.setTarget(null); map = null; });
</script>

<template>
  <section class="inicio">
    <div class="inicio-pagina">
      <header class="inicio-cabecera">
        <h1>Bienvenido a DeltaMap-CEDESU</h1>
        <p>
          La información geográfica de los estudios del Centro de Estudios para el Desarrollo Sustentable y
          Aprovechamiento de la Vida Silvestre, en un solo lugar.
        </p>
      </header>

      <div class="inicio-rejilla">
        <!-- Mapa -->
        <section class="caja caja-mapa" aria-labelledby="inicioMapaTitulo">
          <div class="caja-cab">
            <div>
              <h2 id="inicioMapaTitulo">Campeche en el mapa</h2>
              <p>Toca un punto o elige una cabecera municipal.</p>
            </div>
            <button type="button" class="btn btn-quiet btn-sm" :aria-label="playing ? 'Pausar el recorrido' : 'Reanudar el recorrido'" @click="togglePlay">
              <svg v-if="playing" viewBox="0 0 24 24" class="ic ic-play" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              <svg v-else viewBox="0 0 24 24" class="ic ic-play" aria-hidden="true"><path d="M7 5v14l12-7z" /></svg>
              {{ playing ? 'Pausar' : 'Recorrer' }}
            </button>
          </div>
          <div class="mapa-marco">
            <div ref="mapEl" class="mapa-ol" role="img" :aria-label="`Mapa de Campeche centrado en ${place[0]}`"></div>
            <div class="mapa-pie" aria-live="polite">
              <b>{{ place[0] }}</b>
              <span>Municipio de {{ place[1] }}</span>
              <code>{{ coordText }}</code>
            </div>
          </div>
          <div class="chips" role="group" aria-label="Cabeceras municipales">
            <button v-for="(p, i) in PLACES" :key="p[0]" type="button" class="chip" :aria-pressed="String(i === current)" @click="pick(i)">{{ p[0] }}</button>
          </div>
          <div class="caja-pie">
            <button type="button" class="btn btn-primary" @click="go('/')"><Icon name="map" />Abrir el mapa completo</button>
          </div>
        </section>

        <!-- Columna derecha -->
        <div class="columna">
          <section class="caja" aria-labelledby="inicioAccesosTitulo">
            <div class="caja-cab"><h2 id="inicioAccesosTitulo">{{ session.admin ? 'Qué quieres hacer' : 'Empieza aquí' }}</h2></div>
            <ul class="accesos">
              <li v-for="a in accesos" :key="a.titulo">
                <button type="button" class="acceso" :data-admin="String(!!a.admin)" @click="a.run">
                  <span class="acceso-icono"><Icon :name="a.icon" /></span>
                  <span class="acceso-texto"><b>{{ a.titulo }}</b><span>{{ a.texto }}</span></span>
                  <Icon name="chevron-right" class="ic-14 acceso-flecha" />
                </button>
              </li>
            </ul>
          </section>

          <section class="caja" aria-labelledby="inicioEstudiosTitulo">
            <div class="caja-cab">
              <div>
                <h2 id="inicioEstudiosTitulo">Estudios disponibles</h2>
                <p>{{ totalEstudios }} en el catálogo</p>
              </div>
              <button type="button" class="btn btn-quiet btn-sm" @click="go('/catalogo')">Ver todos</button>
            </div>
            <ul v-if="estudios.length" class="estudios">
              <li v-for="e in estudios" :key="e.id">
                <button type="button" class="estudio" :aria-label="`Ficha de ${e.title}`" @click="showLayerInfo(e.id)">
                  <span class="estudio-titulo">{{ e.title }}</span>
                  <span class="estudio-meta">
                    <span class="badge" :class="e.published ? 'badge-ok' : ''">{{ e.published ? 'Publicada' : 'Referencia' }}</span>
                    {{ e.theme }}<template v-if="e.date"> · {{ fmtDate(e.date) }}</template>
                  </span>
                </button>
              </li>
            </ul>
            <p v-else class="vacio">Todavía no hay estudios en el catálogo.</p>
          </section>

          <section class="caja caja-acerca" aria-label="Instituciones participantes">
            <img :src="logoUacam" alt="Universidad Autónoma de Campeche" />
            <img :src="logoCedesu" alt="CEDESU" />
            <p>Desarrollado por la Facultad de Ingeniería de la UACAM en colaboración con el CEDESU.</p>
          </section>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.inicio { height: 100%; min-height: 0; overflow-y: auto; background: var(--ground); color: var(--text); }
.inicio-pagina { max-width: 1240px; margin: 0 auto; padding: var(--s-6) var(--s-6) 56px; }

.inicio-cabecera h1 { margin: 0 0 var(--s-2); font-size: var(--fs-26); letter-spacing: -0.01em; }
.inicio-cabecera p { margin: 0; max-width: 70ch; color: var(--text-2); font-size: var(--fs-15); line-height: 1.6; }

.inicio-rejilla { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: var(--s-4); margin-top: var(--s-5); align-items: start; }
.columna { display: grid; gap: var(--s-4); min-width: 0; }

.caja { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); min-width: 0; }
.caja-cab { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-3); padding: var(--s-4) var(--s-4) var(--s-2); }
.caja-cab h2 { margin: 0; font-size: var(--fs-16); }
.caja-cab p { margin: 2px 0 0; font-size: var(--fs-12); color: var(--text-3); }
.caja-pie { padding: 0 var(--s-4) var(--s-4); }

/* mapa */
.mapa-marco { position: relative; margin: var(--s-2) var(--s-4) 0; height: 400px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--surface-3); }
.mapa-ol { position: absolute; inset: 0; }
.mapa-pie { position: absolute; left: 10px; bottom: 10px; display: grid; gap: 1px; padding: 6px 10px; border-radius: 8px; background: rgb(255 255 255 / 92%); box-shadow: 0 1px 6px rgb(12 30 53 / 18%); pointer-events: none; }
.mapa-pie b { font-size: var(--fs-14); }
.mapa-pie span { font-size: var(--fs-12); color: var(--text-2); }
.mapa-pie code { font-family: var(--mono); font-size: var(--fs-11); color: var(--text-3); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: var(--s-3) var(--s-4); }
.chip { padding: 3px 10px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface); color: var(--text-2); font: inherit; font-size: var(--fs-12); cursor: pointer; }
.chip:hover { background: var(--surface-2); }
.chip[aria-pressed="true"] { background: var(--navy-700); border-color: var(--navy-700); color: var(--text-inverse); }
.ic-play { width: 14px; height: 14px; fill: currentColor; stroke: none; }

/* accesos */
.accesos, .estudios { list-style: none; margin: 0; padding: 0 var(--s-2) var(--s-2); display: grid; gap: 2px; }
.acceso { display: flex; align-items: center; gap: var(--s-3); width: 100%; padding: var(--s-3) var(--s-2); border: 0; border-radius: 10px; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.acceso:hover { background: var(--surface-2); }
.acceso-icono { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; background: var(--navy-50); color: var(--navy-700); }
.acceso[data-admin="true"] .acceso-icono { background: var(--gold-100); color: var(--demo); }
.acceso-texto { flex: 1; min-width: 0; display: grid; gap: 1px; }
.acceso-texto b { font-size: var(--fs-14); }
.acceso-texto span { font-size: var(--fs-12); color: var(--text-3); line-height: 1.4; }
.acceso-flecha { color: var(--text-3); }

/* estudios */
.estudio { display: grid; gap: 3px; width: 100%; padding: var(--s-2) var(--s-2); border: 0; border-radius: 8px; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.estudio:hover { background: var(--surface-2); }
.estudio-titulo { font-size: var(--fs-14); font-weight: 600; overflow-wrap: anywhere; }
.estudio-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: var(--fs-12); color: var(--text-3); }
.vacio { margin: 0; padding: 0 var(--s-4) var(--s-4); color: var(--text-3); font-size: var(--fs-13); }

/* instituciones */
.caja-acerca { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-4); }
.caja-acerca img { width: 44px; height: 44px; object-fit: contain; flex: none; }
.caja-acerca p { margin: 0; font-size: var(--fs-12); color: var(--text-3); line-height: 1.5; }

@media (max-width: 960px) {
  .inicio-rejilla { grid-template-columns: 1fr; }
  .mapa-marco { height: 320px; }
}
@media (max-width: 650px) {
  .inicio-pagina { padding: var(--s-4) 16px 48px; }
  .mapa-marco { margin-inline: var(--s-3); height: 280px; }
  .chips, .caja-pie, .caja-cab { padding-inline: var(--s-3); }
}
</style>
