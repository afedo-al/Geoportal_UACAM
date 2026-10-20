<script setup>
import { watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TopBar from './components/TopBar.vue';
import ToastHost from './components/ToastHost.vue';
import PopoverMenu from './components/PopoverMenu.vue';
import TooltipHost from './components/TooltipHost.vue';
import LoginDialog from './components/LoginDialog.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import MetaDialog from './components/MetaDialog.vue';
import { ui, closeMenu, setDock } from './stores/ui.js';
import { session } from './stores/session.js';
import { mapState, setTool } from './stores/map.js';

const route = useRoute();
const router = useRouter();

/* Al cerrar la sesión, las secciones de administración dejan de estar disponibles */
watch(() => session.admin, admin => { if (!admin && route.meta.admin) router.replace('/'); });

function onKey(e) {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    document.getElementById('globalSearch')?.focus();
    return;
  }
  if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  if (ui.menu.open) { closeMenu(); return; }
  if (mapState.measure.type) { setTool('pan'); return; }
  if (ui.mobile && route.name === 'mapa') { setDock('left', false); setDock('right', false); }
}
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="app" id="mapApp">
    <TopBar />
    <main>
      <RouterView v-slot="{ Component }">
        <KeepAlive include="MapView">
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>
  </div>

  <LoginDialog />
  <MetaDialog />
  <ConfirmDialog />
  <PopoverMenu />
  <TooltipHost />
  <ToastHost />
</template>
