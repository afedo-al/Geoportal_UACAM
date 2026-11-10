<script setup>
import { ref, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { ui } from '../stores/ui.js';
import { session, login, AUTH_AVAILABLE } from '../stores/session.js';
import { useDialog } from '../lib/ui-helpers.js';

const router = useRouter();
const logo = `${import.meta.env.BASE_URL}img/cedesu.webp`;
const dlg = ref(null);
const userEl = ref(null);
const passEl = ref(null);
const user = ref('');
const pass = ref('');
const error = ref('');
const busy = ref(false);
const code = ref('');
const needCode = ref(false);
const codeEl = ref(null);

watch(() => ui.loginOpen, open => {
  if (!open) return;
  user.value = ''; pass.value = ''; error.value = ''; code.value = ''; needCode.value = false;
  /* El foco inicial lo pone showModal() con autofocus (el campo de usuario); enfocarlo antes de abrir no tiene efecto */
});
useDialog(dlg, () => ui.loginOpen, () => { ui.loginOpen = false; });

/* Rellena el formulario con la cuenta de demostración que ofrece el servidor */
function useDemo() {
  if (!session.demo) return;
  user.value = session.demo.usuario;
  pass.value = session.demo.contrasena;
  error.value = '';
}

async function submit() {
  if (busy.value) return;
  busy.value = true;
  const err = await login(user.value, pass.value, needCode.value ? code.value : '');
  busy.value = false;
  if (err?.segundoFactor) {
    needCode.value = true;
    error.value = err.error;
    code.value = '';
    nextTick(() => codeEl.value?.focus());
    return;
  }
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
        <div class="field"><label for="username">Usuario o correo</label>
          <input id="username" ref="userEl" v-model="user" class="input" autocomplete="username" required :autofocus="AUTH_AVAILABLE" :disabled="!AUTH_AVAILABLE" :aria-invalid="String(!!error)" aria-describedby="loginError"></div>
        <div class="field"><label for="password">Contraseña</label>
          <input id="password" ref="passEl" v-model="pass" class="input" type="password" autocomplete="current-password" required :disabled="!AUTH_AVAILABLE" :aria-invalid="String(!!error)" aria-describedby="loginError"></div>
        <div v-if="needCode" class="field"><label for="otpCode">Código de verificación</label>
          <input id="otpCode" ref="codeEl" v-model="code" class="input mono" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required aria-describedby="otpHint">
          <span id="otpHint" class="hint">Los 6 dígitos que muestra tu aplicación de autenticación.</span></div>
        <p v-if="error" id="loginError" class="error-text login-error" role="alert"><Icon name="alert-circle" />{{ error }}</p>
        <div v-if="session.demo" class="callout demo">
          <Icon name="shield-check" />
          <span><b>Cuenta de demostración (administración).</b> Usuario <code>{{ session.demo.usuario }}</code> o correo <code>{{ session.demo.correo }}</code>, contraseña <code>{{ session.demo.contrasena }}</code>.
            <template v-if="session.demo.local">Se valida en este navegador porque no hay servidor: solo existe en desarrollo y no protege nada.</template>
            <template v-else>El servidor la ofrece solo cuando arranca en modo demostración.</template>
            <button type="button" class="link-btn" @click="useDemo">Usar esta cuenta</button></span>
        </div>
        <div v-else-if="!AUTH_AVAILABLE" class="callout info">
          <Icon name="cloud-off" />
          <span><b>Servidor no configurado.</b> Esta versión del sitio se compiló sin el servicio de publicación (<code>VITE_API_BASE</code>), así que no hay acceso de administración. La consulta del mapa y del catálogo sigue disponible sin cuenta.</span>
        </div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn btn-quiet" data-close>{{ AUTH_AVAILABLE ? 'Cancelar' : 'Cerrar' }}</button>
        <button type="submit" class="btn btn-primary" :disabled="!AUTH_AVAILABLE || busy" :aria-busy="String(busy)">{{ busy ? 'Entrando…' : 'Entrar' }}</button>
      </div>
    </form>
  </dialog>
</template>
