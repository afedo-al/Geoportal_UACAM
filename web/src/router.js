import { createRouter, createWebHashHistory } from 'vue-router';
import {
  checkSession,
  openLogin,
  sessionReady
} from './stores/session.js';

export const router = createRouter({
  history: createWebHashHistory(),

  routes: [
    {
      path: '/bienvenida',
      name: 'bienvenida',
      component: () => import('./views/WelcomeView.vue')
    },
    {
      path: '/',
      name: 'mapa',
      component: () => import('./views/MapView.vue')
    },
    {
      path: '/catalogo',
      name: 'catalogo',
      component: () => import('./views/CatalogView.vue')
    },
    {
      path: '/carga',
      name: 'carga',
      component: () => import('./views/UploadView.vue'),
      meta: { admin: true }
    },
    {
      path: '/gps',
      name: 'gps',
      component: () => import('./views/GpsView.vue'),
      meta: { admin: true }
    },
    {
      path: '/revision',
      name: 'revision',
      component: () => import('./views/ReviewView.vue'),
      meta: { admin: true }
    },
    {
      path: '/:rest(.*)*',
      redirect: '/'
    }
  ]
});

router.beforeEach(async (to, from) => {

  // Mostrar la bienvenida en la primera visita.
  if (to.name === 'mapa' && !from.name) {
    try {
      const revisado = sessionStorage.getItem(
        'cedesuWelcomeChecked'
      );

      if (!revisado) {
        sessionStorage.setItem(
          'cedesuWelcomeChecked',
          '1'
        );

        const visitado = localStorage.getItem(
          'cedesuWelcomeVisitedV3'
        );

        if (!visitado) {
          return '/bienvenida';
        }
      }
    } catch {
      // No bloquear la navegación.
    }
  }

  // Las páginas públicas no requieren sesión.
  if (!to.meta.admin) {
    return true;
  }

  // Mantener protección de rutas administrativas.
  await sessionReady;

  if (checkSession()) {
    return true;
  }

  openLogin(to.fullPath);

  return from.name ? false : '/';
});
