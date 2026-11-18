<script setup>
import { ref, onMounted } from 'vue';
import Icon from './Icon.vue';

const dlg = ref(null);
const STORAGE_KEY = 'cedesuWelcomeSeenV2';

function close() {
  localStorage.setItem(STORAGE_KEY, '1');
  dlg.value?.close();
}

onMounted(() => {
  if (!localStorage.getItem(STORAGE_KEY)) dlg.value?.showModal();
});
</script>

<template>
  <dialog ref="dlg" class="dlg welcome-dlg" aria-labelledby="welcomeTitle">
    <div class="dlg-head">
      <div>
        <p class="welcome-kicker">DELTA·MAP CEDESU</p>
        <h2 id="welcomeTitle">Bienvenido al Geoportal</h2>
        <p>Un espacio para consultar, organizar, revisar y compartir información geográfica del CEDESU.</p>
      </div>
    </div>
    <div class="welcome-body">
      <h3>Finalidad del visualizador cartográfico</h3>
      <p>Desarrollar una plataforma web interactiva que permita centralizar, organizar, validar, visualizar y administrar la información geográfica del CEDESU mediante un visor cartográfico, la gestión de capas, un catálogo de estudios y un proceso de publicación controlada de datos.</p>
      <h3>Colaboración institucional</h3>
      <ul class="welcome-collaborators">
        <li><Icon name="building-2" /><span><b>Facultad de Ingeniería, Universidad Autónoma de Campeche (UACAM)</b><small>Desarrollo e implementación tecnológica</small></span></li>
        <li><Icon name="leaf" /><span><b>Centro de Estudios para el Desarrollo Sustentable y Aprovechamiento de la Vida Silvestre (CEDESU)</b><small>Contexto institucional, requerimientos e información geográfica</small></span></li>
      </ul>
    </div>
    <div class="dlg-foot">
      <button type="button" class="btn btn-primary" @click="close">Comenzar</button>
    </div>
  </dialog>
</template>

<style scoped>
.welcome-dlg { max-width: 620px; }
.welcome-kicker { margin: 0 0 8px; color: var(--gold-700); font-size: var(--fs-12); font-weight: 700; letter-spacing: .12em; }
.welcome-body { padding: 0 24px 20px; }
.welcome-body h3 { margin: 18px 0 6px; font-size: var(--fs-15); }
.welcome-body p { margin: 0; color: var(--text-2); line-height: 1.55; }
.welcome-collaborators { display: grid; gap: 10px; padding: 0; margin: 8px 0 0; list-style: none; }
.welcome-collaborators li { display: flex; gap: 10px; align-items: flex-start; padding: 10px; border: 1px solid var(--line); border-radius: var(--r-2); }
.welcome-collaborators li > svg { flex: 0 0 auto; color: var(--navy-600); }
.welcome-collaborators span { display: grid; gap: 2px; }
.welcome-collaborators small { color: var(--text-2); }
</style>
