/* Sesión de administración de DEMOSTRACIÓN: se valida solo en este navegador.
   La autenticación real (cuenta personal y segundo factor) dependerá de la API. */
import { reactive } from 'vue';
import { store } from '../lib/format.js';
import { CFG } from '../config.js';
import { ui, showToast } from './ui.js';

const DEMO_USERS = { admin: { password: 'admin123', email: 'admin@cedesu.uacam.mx', name: 'Administrador CEDESU' } };
const LIMITS = CFG.session || { maxHours: 8, idleMinutes: 30, maxFailedLogins: 5, lockSeconds: 60 };
const SESSION_KEY = 'cedesuSession';
const FAIL_KEY = 'cedesuLoginFail';

export const session = reactive({ admin: null, pendingRoute: null });

const endHooks = [];
export const onSessionEnd = fn => endHooks.push(fn);

export function readSession() {
  const s = store.get(SESSION_KEY, null);
  if (!s || typeof s !== 'object' || !Object.prototype.hasOwnProperty.call(DEMO_USERS, s.user) || typeof s.exp !== 'number' || typeof s.last !== 'number') return null;
  const now = Date.now();
  if (now > s.exp || now - s.last > LIMITS.idleMinutes * 60000) { store.set(SESSION_KEY, null); return null; }
  return s;
}

function setSession(user) {
  session.admin = user ? { id: user, ...DEMO_USERS[user] } : null;
}

export function endSession(reason) {
  store.set(SESSION_KEY, null);
  setSession(null);
  endHooks.forEach(fn => fn());
  if (reason) showToast('info', 'Sesión cerrada', reason);
}

/* Si la sesión guardada caducó, la cierra; devuelve si hay una sesión vigente */
export function checkSession() {
  if (session.admin && !readSession()) endSession('La sesión caducó.');
  return !!session.admin;
}

const failState = () => { try { return JSON.parse(sessionStorage.getItem(FAIL_KEY)) || { count: 0, until: 0 }; } catch { return { count: 0, until: 0 }; } };
const saveFail = v => { try { sessionStorage.setItem(FAIL_KEY, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export function openLogin(nextRoute = null) {
  session.pendingRoute = nextRoute;
  ui.loginOpen = true;
}

/* Devuelve null si entró o el mensaje de error */
export function login(user, pass) {
  user = user.trim();
  if (!user || !pass) return 'Escribe el usuario y la contraseña.';
  const fail = failState();
  if (Date.now() < fail.until) return `Demasiados intentos fallidos. Espera ${Math.ceil((fail.until - Date.now()) / 1000)} segundos.`;
  if (!Object.prototype.hasOwnProperty.call(DEMO_USERS, user) || DEMO_USERS[user].password !== pass) {
    fail.count += 1;
    if (fail.count >= LIMITS.maxFailedLogins) { fail.until = Date.now() + LIMITS.lockSeconds * 1000; fail.count = 0; }
    saveFail(fail);
    return fail.until > Date.now() ? `Demasiados intentos fallidos. Espera ${LIMITS.lockSeconds} segundos.` : 'Usuario o contraseña incorrectos.';
  }
  saveFail({ count: 0, until: 0 });
  const now = Date.now();
  store.set(SESSION_KEY, { user, exp: now + LIMITS.maxHours * 3600000, last: now });
  setSession(user);
  showToast('success', 'Sesión iniciada', `${DEMO_USERS[user].name}. Acceso de demostración sin servidor.`);
  return null;
}

/* Actividad del usuario: renueva el tiempo de inactividad (como máximo cada 30 s) */
let lastTouch = 0;
function touchSession() {
  const now = Date.now();
  if (!session.admin || now - lastTouch < 30000) return;
  lastTouch = now;
  const s = readSession();
  if (s) { s.last = now; store.set(SESSION_KEY, s); }
}

export function initSession() {
  store.set('cedesuUser', null); // clave antigua sin caducidad
  const s = readSession();
  setSession(s ? s.user : null);
  ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, touchSession, { passive: true }));
  setInterval(() => { if (session.admin && !readSession()) endSession('Por inactividad o porque se alcanzó la duración máxima de la sesión.'); }, 30000);
  addEventListener('storage', e => { if (e.key === SESSION_KEY && session.admin && !readSession()) endSession('Se cerró la sesión en otra pestaña.'); });
}
