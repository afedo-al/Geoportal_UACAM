import { createRouter, createWebHashHistory } from 'vue-router';
import { checkSession, openLogin, sessionReady } from './stores/session.js';

/* Rutas con «#»: el sitio es estático y no necesita configuración del servidor.
   Las vistas se cargan bajo demanda; carga de datos, captura GPS y revisión exigen sesión.
   (Medido: incluir el mapa en el paquete principal junta todo el arranque en una sola
   tarea larga y empeora el bloqueo del hilo principal; por eso sigue aparte.) */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'mapa', component: () => import('./views/MapView.vue') },
    { path: '/catalogo', name: 'catalogo', component: () => import('./views/CatalogView.vue') },
    { path: '/carga', name: 'carga', component: () => import('./views/UploadView.vue'), meta: { admin: true } },
    { path: '/gps', name: 'gps', component: () => import('./views/GpsView.vue'), meta: { admin: true } },
    { path: '/revision', name: 'revision', component: () => import('./views/ReviewView.vue'), meta: { admin: true } },
    { path: '/:rest(.*)*', redirect: '/' }
  ]
});

router.beforeEach(async (to, from) => {
  if (!to.meta.admin) return true;
  await sessionReady;
  if (checkSession()) return true;
  openLogin(to.fullPath);
  return from.name ? false : '/'; // al abrir directamente una ruta protegida se muestra el mapa y el acceso
});
