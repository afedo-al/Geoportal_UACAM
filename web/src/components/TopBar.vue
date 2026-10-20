<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from './Icon.vue';
import SearchBox from './SearchBox.vue';
import { ui, openMenu } from '../stores/ui.js';
import { session, openLogin, endSession } from '../stores/session.js';

/* Logotipos servidos desde el propio sitio, al tamaño en que se muestran (96 px = 30 px a 3x) */
const logoCedesu = `${import.meta.env.BASE_URL}img/cedesu.webp`;
const logoUacam = `${import.meta.env.BASE_URL}img/uacam.webp`;
const route = useRoute();
const router = useRouter();

const NAV = [
  { name: 'mapa', to: '/', icon: 'map', label: 'Mapa' },
  { name: 'catalogo', to: '/catalogo', icon: 'book-open', label: 'Catálogo', long: ' de estudios' },
  { name: 'carga', to: '/carga', icon: 'upload', label: 'Carga', long: ' de datos', admin: true },
  { name: 'gps', to: '/gps', icon: 'satellite-dish', label: 'Captura GPS', admin: true }
];
const visibleNav = computed(() => NAV.filter(n => !n.admin || session.admin));
const task = computed(() => ui.tasks.at(-1)?.label || '');
const initials = computed(() => session.admin?.name.split(' ').map(w => w[0]).slice(0, 2).join('') || '');

function mobileMenu(e) {
  openMenu(e.currentTarget, visibleNav.value.map(n => ({ act: n.to, icon: n.icon, label: n.label + (n.long || '') })), {
    align: 'right', onSelect: to => router.push(to)
  });
}

function sessionClick(e) {
  if (!session.admin) return openLogin();
  openMenu(e.currentTarget, [{ act: 'logout', icon: 'log-out', label: 'Cerrar sesión' }], {
    align: 'right', header: { title: session.admin.name, sub: session.admin.email },
    onSelect: () => endSession('Hasta pronto.')
  });
}
</script>

<template>
  <header class="topbar">
    <a class="brand" href="#/" aria-label="Geoportal CEDESU, ir al mapa" @click.prevent="router.push('/')">
      <span class="brand-logos">
        <img class="uacam" :src="logoUacam" width="30" height="30" alt="">
        <img class="logo-cedesu" :src="logoCedesu" width="30" height="30" alt="">
      </span>
      <span class="brand-text">
        <span class="brand-name">CEDESU</span>
        <span class="brand-space">Geoportal · <b>Cartografía de Campeche</b></span>
      </span>
    </a>

    <nav class="topnav" aria-label="Secciones">
      <button v-for="n in NAV" :key="n.name" type="button" :data-admin="n.admin ? '' : null" :hidden="n.admin && !session.admin"
        :aria-current="route.name === n.name ? 'page' : null" :aria-label="n.label + (n.long || '')" @click="router.push(n.to)">
        <Icon :name="n.icon" /><span class="lbl">{{ n.label }}<span v-if="n.long" class="lbl-long">{{ n.long }}</span></span>
      </button>
    </nav>

    <SearchBox />

    <div class="topbar-actions">
      <span class="task-indicator" :class="{ 'is-on': ui.tasks.length }" role="status" aria-live="polite">
        <Icon name="loader-2" class="ic-14 ic-spin" /><span>{{ task }}</span>
      </span>
      <button type="button" class="icon-btn mobile-nav-btn" aria-label="Secciones" aria-haspopup="menu" @click="mobileMenu">
        <Icon name="more-horizontal" class="ic-20" />
      </button>
      <button type="button" class="session-btn" :aria-haspopup="session.admin ? 'menu' : 'dialog'"
        :aria-label="session.admin ? `Sesión de ${session.admin.name}` : 'Iniciar sesión'" @click="sessionClick">
        <template v-if="session.admin">
          <span class="avatar" aria-hidden="true">{{ initials }}</span><span class="lbl">{{ session.admin.name }}</span>
        </template>
        <template v-else><Icon name="log-in" /><span class="lbl">Iniciar sesión</span></template>
      </button>
    </div>
  </header>
</template>
