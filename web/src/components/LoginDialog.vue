<script setup>
import { ref, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { ui } from '../stores/ui.js';
import { session, login } from '../stores/session.js';
import { useDialog } from '../lib/ui-helpers.js';

const router = useRouter();
const logo = `${import.meta.env.BASE_URL}img/cedesu.webp`;
const dlg = ref(null);
const userEl = ref(null);
const passEl = ref(null);
const user = ref('');
const pass = ref('');
const error = ref('');

watch(() => ui.loginOpen, open => {
  if (!open) return;
  user.value = ''; pass.value = ''; error.value = '';
  nextTick(() => userEl.value?.focus());
});
useDialog(dlg, () => ui.loginOpen, () => { ui.loginOpen = false; });

function submit() {
  const err = login(user.value, pass.value);
  if (err) {
    error.value = err;
    if (!err.startsWith('Escribe')) { pass.value = ''; passEl.value?.focus(); }
    return;
  }
  dlg.value.close('ok');
  const next = session.pendingRoute;
  session.pendingRoute = null;
  if (next) router.push(next);
}
</script>

<template>
  <dialog ref="dlg" class="dlg" aria-labelledby="loginTitle">
    <form novalidate @submit.prevent="submit">
      <div class="dlg-head">
        <div class="login-brand">
          <img :src="logo" width="40" height="40" loading="lazy" alt="">
          <div><h2 id="loginTitle">Acceso de administración</h2><p>Centro de Estudios de Desarrollo Sustentable y Aprovechamiento de la Vida Silvestre</p></div>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Cerrar"><Icon name="x" /></button>
      </div>
      <div class="dlg-body stack">
        <div class="field"><label for="username">Usuario</label><input id="username" ref="userEl" v-model="user" class="input" autocomplete="username" required></div>
        <div class="field"><label for="password">Contraseña</label><input id="password" ref="passEl" v-model="pass" class="input" type="password" autocomplete="current-password" required></div>
        <p v-if="error" class="error-text login-error" role="alert">{{ error }}</p>
        <div class="callout warn">
          <Icon name="shield-check" />
          <span><b>Acceso de demostración sin servidor.</b> La sesión se valida solo en este navegador (usuario <code>admin</code>, contraseña <code>admin123</code>). La autenticación real dependerá de la API.</span>
        </div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn btn-quiet" data-close>Cancelar</button>
        <button type="submit" class="btn btn-primary">Entrar</button>
      </div>
    </form>
  </dialog>
</template>
