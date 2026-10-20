import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import { initSession } from './stores/session.js';
import { initDocks } from './stores/ui.js';
import { registerDatasets, loadVisibleDatasets } from './stores/layers.js';
import { initGps } from './stores/gps.js';
/* IBM Plex servida desde el propio sitio (subconjunto latino: cubre el español), sin hoja externa que bloquee el primer pintado */
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-400-italic.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import 'ol/ol.css';
import './styles/main.css';

/* El geoportal no se muestra dentro de otro sitio (protección contra clickjacking) */
if (window.top !== window.self) {
  document.body.textContent = 'El Geoportal CEDESU no puede mostrarse dentro de otro sitio.';
  throw new Error('Geoportal incrustado en un marco: se detiene por seguridad.');
}

initSession();
initDocks();
registerDatasets();
initGps();

createApp(App).use(router).mount('#app');

/* Las capas visibles (~1 MB de GeoJSON) se descargan cuando la página ya pintó, para no
   competir con el mapa base ni con la interfaz. El aviso «Cargando…» se mantiene mientras tanto. */
const whenIdle = window.requestIdleCallback || (fn => setTimeout(fn, 200));
const loadLayers = () => whenIdle(loadVisibleDatasets, { timeout: 1500 });
if (document.readyState === 'complete') loadLayers(); else addEventListener('load', loadLayers, { once: true });
