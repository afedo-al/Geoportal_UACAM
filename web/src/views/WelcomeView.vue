<script setup>
/* Inicio: portada pública de DeltaMap-CEDESU. El héroe lleva un mapa real que recorre las cabeceras
   municipales de Campeche; el resto explica, sin datos inventados, qué se puede consultar. */
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
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style.js';
import { fromLonLat } from 'ol/proj.js';
import Icon from '../components/Icon.vue';
import { PLACES } from '../lib/datasets.js';

const router = useRouter();

const logoUacam = `${import.meta.env.BASE_URL}img/uacam.webp`;
const logoCedesu = `${import.meta.env.BASE_URL}img/cedesu.webp`;

const herramientas = [
  { icono: 'map', titulo: 'Visor cartográfico', ruta: '/', cta: 'Abrir el mapa', ancho: true,
    descripcion: 'Navega por el territorio, activa capas temáticas, cambia el mapa base y cambia cómo se dibuja cada capa.' },
  { icono: 'book-open', titulo: 'Catálogo de estudios', ruta: '/catalogo', cta: 'Ver estudios',
    descripcion: 'Investigaciones y proyectos territoriales con su ficha de metadatos: autoría, fecha, licencia y procedencia.' },
  { icono: 'search', titulo: 'Búsqueda y localización', ruta: '/', cta: 'Buscar en el mapa',
    descripcion: 'Encuentra municipios, localidades de Campeche, capas y coordenadas desde un solo cuadro.' },
  { icono: 'crosshair', titulo: 'Consulta y medición', ruta: '/', cta: 'Probar herramientas', ancho: true,
    descripcion: 'Identifica los atributos de cualquier elemento del mapa y mide distancias y áreas en tiempo real.' }
];

const pasos = [
  { icono: 'layers', titulo: 'Activa capas', texto: 'Elige qué mostrar: división territorial, clima y los estudios publicados.' },
  { icono: 'crosshair', titulo: 'Identifica y mide', texto: 'Toca un elemento para ver sus atributos; mide distancias y áreas.' },
  { icono: 'file-text', titulo: 'Consulta la ficha', texto: 'Cada capa trae su procedencia, licencia y fecha para citarla bien.' }
];

// Agrega aquí los nombres cuando estén autorizados.
const colaboradores = [
  // { nombre: 'Nombre del integrante', cargo: 'Desarrollador' },
];

function entrarAlMapa() {
  try {
    localStorage.setItem('cedesuWelcomeVisitedV3', '1');
  } catch {
    // La navegación funciona aunque el almacenamiento esté deshabilitado.
  }
  router.push('/');
}

/* ---------------- mapa del héroe ---------------- */
const mapEl = ref(null);
const current = ref(0);
const playing = ref(false);
const place = computed(() => PLACES[current.value]);
const coordText = computed(() => `${place.value[2].toFixed(2)}° N · ${Math.abs(place.value[3]).toFixed(2)}° O`);

let map = null;
let markers = null;
let timer = null;
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const dot = new Style({ image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#214c7e', width: 1.5 }) }) });
const halo = new Style({ image: new CircleStyle({ radius: 15, fill: new Fill({ color: 'rgba(212,166,76,0.28)' }) }) });
const active = new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#d4a64c' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }) });

function fly(i, animate = true) {
  current.value = i;
  markers?.changed();
  const [, , lat, lon] = PLACES[i];
  const view = map?.getView();
  if (!view) return;
  const center = fromLonLat([lon, lat]);
  if (animate && !reduced) view.animate({ center, zoom: 9.4, duration: 2200 });
  else view.setCenter(center);
}

function next() { fly((current.value + 1) % PLACES.length); }
function play() { stop(); playing.value = true; timer = setInterval(() => { if (!document.hidden) next(); }, 6500); }
function stop() { playing.value = false; clearInterval(timer); timer = null; }
function togglePlay() { playing.value ? stop() : play(); }
function pick(i) { fly(i); if (playing.value) play(); }

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
    controls: [],
    interactions: [],
    layers: [
      new TileLayer({ source: new XYZ({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19, crossOrigin: 'anonymous' }) }),
      markers
    ],
    view: new View({ center: fromLonLat([-90.5, 19.2]), zoom: 6.6 })
  });
  fly(0, false);
  setTimeout(() => { if (map) fly(0); }, 400);
  if (!reduced) play();
});

onBeforeUnmount(() => {
  stop();
  map?.setTarget(null);
  map = null;
});
</script>

<template>
  <section class="inicio-cedesu">
    <div class="inicio-contenido">

      <!-- HÉROE -->
      <header class="hero">
        <div class="hero-texto">
          <span class="hero-etiqueta"><Icon name="map-pin" class="ic-14" />DeltaMap-CEDESU · UACAM</span>
          <h1>El territorio de Campeche, <em>a un clic</em>.</h1>
          <p class="hero-sub">
            Información geográfica para conocer, estudiar y comprender nuestro territorio, desarrollada en
            colaboración con la Universidad Autónoma de Campeche.
          </p>
          <div class="hero-botones">
            <button class="btn btn-primary" type="button" @click="entrarAlMapa"><Icon name="map" />Explorar el mapa</button>
            <button class="btn btn-secondary" type="button" @click="router.push('/catalogo')"><Icon name="book-open" />Ver estudios</button>
          </div>
          <div class="hero-logos" aria-label="Instituciones">
            <img :src="logoUacam" alt="Universidad Autónoma de Campeche" />
            <img :src="logoCedesu" alt="CEDESU" />
          </div>
        </div>

        <div class="hero-mapa">
          <div class="mapa-marco">
            <div ref="mapEl" class="mapa-ol" role="img" :aria-label="`Mapa de Campeche centrado en ${place[0]}`"></div>
            <div class="mapa-velo" aria-hidden="true"></div>
            <div class="mapa-pie" aria-live="polite">
              <div>
                <b>{{ place[0] }}</b>
                <span>Municipio de {{ place[1] }}</span>
              </div>
              <code>{{ coordText }}</code>
            </div>
            <button type="button" class="mapa-play" :aria-label="playing ? 'Pausar el recorrido' : 'Reanudar el recorrido'" @click="togglePlay">
              <svg v-if="playing" viewBox="0 0 24 24" class="ic" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              <svg v-else viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M7 5v14l12-7z" /></svg>
            </button>
          </div>
          <div class="mapa-chips" role="group" aria-label="Cabeceras municipales">
            <button v-for="(p, i) in PLACES" :key="p[0]" type="button" class="chip" :aria-pressed="String(i === current)" @click="pick(i)">{{ p[0] }}</button>
          </div>
        </div>
      </header>

      <!-- FINALIDAD -->
      <section class="seccion seccion-finalidad">
        <div>
          <span class="kicker">Propósito institucional</span>
          <h2>Finalidad de la plataforma</h2>
        </div>
        <div class="finalidad-texto">
          <p>
            DeltaMap-CEDESU centraliza, organiza y visualiza la información geográfica de los estudios y proyectos de
            investigación del Centro de Estudios para el Desarrollo Sustentable y Aprovechamiento de la Vida Silvestre.
          </p>
          <p>
            Con herramientas cartográficas interactivas facilita la consulta de datos territoriales y la localización de
            los estudios, con la procedencia de cada capa a la vista.
          </p>
        </div>
      </section>

      <!-- HERRAMIENTAS -->
      <section class="seccion">
        <span class="kicker">Herramientas y servicios</span>
        <h2>Capacidades disponibles para consulta</h2>
        <div class="bento">
          <article v-for="h in herramientas" :key="h.titulo" class="tarjeta" :class="{ ancha: h.ancho }">
            <div class="icono"><Icon :name="h.icono" /></div>
            <h3>{{ h.titulo }}</h3>
            <p>{{ h.descripcion }}</p>
            <button type="button" class="enlace" @click="router.push(h.ruta)">{{ h.cta }}<Icon name="chevron-right" class="ic-14" /></button>
          </article>
        </div>
      </section>

      <!-- CÓMO SE USA -->
      <section class="seccion">
        <span class="kicker">Cómo se usa</span>
        <h2>Del mapa a la ficha, en tres movimientos</h2>
        <ol class="pasos">
          <li v-for="p in pasos" :key="p.titulo">
            <span class="paso-icono"><Icon :name="p.icono" /></span>
            <div>
              <h3>{{ p.titulo }}</h3>
              <p>{{ p.texto }}</p>
            </div>
          </li>
        </ol>
      </section>

      <!-- INSTITUCIONES -->
      <section class="seccion">
        <span class="kicker">Alianza institucional</span>
        <h2>Instituciones participantes</h2>
        <div class="instituciones">
          <article class="tarjeta institucion">
            <img :src="logoUacam" alt="" />
            <div>
              <h3>Facultad de Ingeniería</h3>
              <p>Universidad Autónoma de Campeche</p>
              <p>Desarrollo tecnológico de DeltaMap-CEDESU.</p>
            </div>
          </article>
          <article class="tarjeta institucion">
            <img :src="logoCedesu" alt="" />
            <div>
              <h3>CEDESU</h3>
              <p>Universidad Autónoma de Campeche</p>
              <p>Requerimientos y conocimiento territorial.</p>
            </div>
          </article>
        </div>

        <div v-if="colaboradores.length" class="integrantes">
          <h3>Integrantes del proyecto</h3>
          <div class="instituciones">
            <article v-for="persona in colaboradores" :key="persona.nombre" class="tarjeta">
              <strong>{{ persona.nombre }}</strong>
              <p>{{ persona.cargo }}</p>
            </article>
          </div>
        </div>
      </section>

      <footer class="cierre">
        <div>
          <h2>Empieza a explorar</h2>
          <p>Activa una capa y recorre el territorio.</p>
        </div>
        <button class="btn btn-primary" type="button" @click="entrarAlMapa">Ir al visualizador<Icon name="chevron-right" /></button>
      </footer>

    </div>
  </section>
</template>

<style scoped>
.inicio-cedesu { height: 100%; min-height: 0; overflow-y: auto; background: var(--ground); color: var(--text); }
.inicio-contenido { max-width: 1180px; margin: 0 auto; padding: var(--s-6) var(--s-6) 72px; }

/* ----- héroe ----- */
.hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
  align-items: center;
  gap: 40px;
  padding: 48px;
  border-radius: 24px;
  color: var(--text-inverse);
  background:
    radial-gradient(900px 420px at 85% -10%, rgb(212 166 76 / 18%), transparent 60%),
    radial-gradient(700px 500px at 0% 110%, rgb(43 94 152 / 55%), transparent 60%),
    linear-gradient(135deg, var(--navy-950), var(--navy-800));
  overflow: hidden;
}
.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.07;
  pointer-events: none;
  background: repeating-radial-gradient(circle at 78% 30%, #fff 0 1px, transparent 1px 22px);
}
.hero > * { position: relative; }
.hero-etiqueta { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border: 1px solid rgb(255 255 255 / 22%); border-radius: 999px; color: var(--gold-400); font-size: var(--fs-12); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.hero h1 { margin: 18px 0 14px; font-size: clamp(32px, 4.2vw, 52px); line-height: 1.08; letter-spacing: -0.02em; }
.hero h1 em { font-style: normal; color: var(--gold-400); }
.hero-sub { max-width: 46ch; margin: 0; font-size: var(--fs-16); line-height: 1.7; color: var(--text-inverse-2); }
.hero-botones { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-top: 28px; }
.hero-logos { display: flex; align-items: center; gap: var(--s-3); margin-top: 32px; }
.hero-logos img { width: 52px; height: 52px; object-fit: contain; padding: 6px; border-radius: 12px; background: var(--surface); }

.hero-mapa { display: grid; gap: var(--s-3); min-width: 0; }
.mapa-marco { position: relative; aspect-ratio: 4 / 3; border-radius: 18px; overflow: hidden; border: 1px solid rgb(255 255 255 / 25%); box-shadow: 0 24px 60px rgb(3 10 20 / 45%); background: var(--navy-900); }
.mapa-ol { position: absolute; inset: 0; filter: saturate(0.75) contrast(0.95); }
.mapa-velo { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to top, rgb(7 20 35 / 78%), transparent 45%); }
.mapa-pie { position: absolute; left: 16px; right: 64px; bottom: 14px; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--s-2); }
.mapa-pie b { display: block; font-size: var(--fs-18); }
.mapa-pie span { font-size: var(--fs-12); color: var(--text-inverse-2); }
.mapa-pie code { font-family: var(--mono); font-size: var(--fs-12); color: var(--gold-400); }
.mapa-play { position: absolute; right: 12px; bottom: 12px; width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid rgb(255 255 255 / 30%); border-radius: 50%; background: rgb(7 20 35 / 70%); color: #fff; cursor: pointer; }
.mapa-play:hover { background: rgb(7 20 35 / 90%); }
.mapa-play .ic { width: 16px; height: 16px; fill: currentColor; stroke: none; }
.mapa-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { padding: 4px 10px; border: 1px solid rgb(255 255 255 / 22%); border-radius: 999px; background: rgb(255 255 255 / 6%); color: var(--text-inverse-2); font: inherit; font-size: var(--fs-12); cursor: pointer; transition: background 120ms, color 120ms; }
.chip:hover { background: rgb(255 255 255 / 14%); color: #fff; }
.chip[aria-pressed="true"] { background: var(--gold-500); border-color: var(--gold-500); color: var(--navy-950); font-weight: 600; }

/* ----- secciones ----- */
.seccion { padding-top: 64px; }
.kicker { display: inline-block; padding: 4px 12px; border-radius: 999px; background: var(--navy-50); color: var(--navy-700); font-size: var(--fs-11); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.seccion h2 { margin: 10px 0 0; font-size: clamp(24px, 2.8vw, 34px); letter-spacing: -0.01em; }
.seccion-finalidad { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.2fr); gap: 40px; align-items: start; }
.finalidad-texto p { margin: 0 0 var(--s-3); font-size: var(--fs-16); line-height: 1.8; color: var(--text-2); }

.bento { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--s-4); margin-top: 28px; }
.tarjeta { position: relative; display: flex; flex-direction: column; grid-column: span 2; padding: 24px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); transition: transform 160ms, box-shadow 160ms, border-color 160ms; }
.tarjeta.ancha { grid-column: span 4; }
.bento .tarjeta:hover { transform: translateY(-3px); border-color: var(--line-strong); box-shadow: 0 14px 30px rgb(12 30 53 / 10%); }
.icono { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 13px; background: var(--navy-50); color: var(--navy-700); }
.tarjeta h3 { margin: 18px 0 8px; font-size: var(--fs-16); }
.tarjeta p { margin: 0; color: var(--text-2); line-height: 1.6; font-size: var(--fs-14); }
.enlace { display: inline-flex; align-items: center; gap: 4px; margin-top: auto; padding: 18px 0 0; border: 0; background: none; color: var(--navy-700); font: inherit; font-size: var(--fs-14); font-weight: 600; cursor: pointer; }
.enlace:hover { text-decoration: underline; }

.pasos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-4); margin: 28px 0 0; padding: 0; list-style: none; position: relative; }
.pasos li { display: flex; gap: var(--s-3); padding: 20px; border-radius: 16px; background: var(--surface-2); border: 1px dashed var(--line-strong); }
.paso-icono { flex: none; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 50%; background: var(--navy-700); color: #fff; }
.pasos h3 { margin: 0 0 4px; font-size: var(--fs-15); }
.pasos p { margin: 0; color: var(--text-2); font-size: var(--fs-13); line-height: 1.6; }

.instituciones { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-4); margin-top: 28px; }
.institucion { flex-direction: row; align-items: center; gap: 20px; grid-column: auto; }
.institucion img { width: 72px; height: 72px; object-fit: contain; flex: none; }
.institucion h3 { margin: 0 0 4px; }
.integrantes { margin-top: 30px; }

.cierre { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s-4); margin-top: 64px; padding: 32px 36px; border-radius: 20px; color: var(--text-inverse); background: linear-gradient(120deg, var(--navy-900), var(--navy-700)); }
.cierre h2 { margin: 0 0 4px; font-size: var(--fs-22); }
.cierre p { margin: 0; color: var(--text-inverse-2); }

/* ----- adaptación ----- */
@media (max-width: 960px) {
  .hero { grid-template-columns: 1fr; padding: 32px 24px; }
  .seccion-finalidad { grid-template-columns: 1fr; gap: var(--s-3); }
  .bento { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tarjeta, .tarjeta.ancha { grid-column: span 1; }
  .pasos { grid-template-columns: 1fr; }
}
@media (max-width: 650px) {
  .inicio-contenido { padding: var(--s-4) 16px 56px; }
  .bento, .instituciones { grid-template-columns: 1fr; }
  .cierre { padding: 24px; }
  .cierre .btn { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .tarjeta, .chip { transition: none; }
  .bento .tarjeta:hover { transform: none; }
}
</style>
