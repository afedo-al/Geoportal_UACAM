import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import { initSession } from './stores/session.js';
import { initDocks } from './stores/ui.js';
import { registerDatasets, loadPublished } from './stores/layers.js';
import { initGps } from './stores/gps.js';
/* Inter Variable para la interfaz e IBM Plex Mono para datos técnicos, servidas desde el propio sitio (subconjunto latino) */
import './styles/fonts.css';
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
loadPublished();
initGps();

createApp(App).use(router).mount('#app');

/* Las capas visibles (~1 MB de GeoJSON) no se descargan al arrancar: las pide el mapa cuando se muestra
   (MapView) o el buscador cuando se usa (SearchBox). Así el catálogo y las demás pantallas no las cargan. */
