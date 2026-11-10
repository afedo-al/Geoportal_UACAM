/* Sesión de administración validada por el servidor (cuando exista): cookie HttpOnly, caducidad de 8 horas y
   cierre por inactividad. La interfaz solo guarda quién inició sesión para mostrarlo; quien decide si una
   acción está permitida es siempre el servidor. */
import { reactive } from 'vue';
import { CFG } from '../config.js';
import { api, hasApi, ApiError, setUnauthorizedHandler } from '../lib/api.js';
import { ui, showToast } from './ui.js';

/* Sin servidor, en desarrollo (o con VITE_DEMO_LOCAL=1) hay una cuenta de demostración que se valida en el
   navegador: no protege nada y sirve solo para recorrer las pantallas de administración. En un build de
   producción sin esa variable, DEMO_LOCAL es falso al compilar y la cuenta no se incluye. */
export const DEMO_LOCAL = !hasApi() && (import.meta.env.DEV || import.meta.env.VITE_DEMO_LOCAL === '1');
export const AUTH_AVAILABLE = hasApi() || DEMO_LOCAL;

/* session.admin: { id, usuario, name, email, cargo, rol, demo } · demo: cuenta de demostración que ofrece el servidor */
export const session = reactive({ admin: null, pendingRoute: null, ready: false, demo: null, expira: null, idleMinutes: CFG.session.idleMinutes });

/* Se resuelve cuando ya se sabe si hay sesión (el router espera antes de decidir si abre una ruta protegida) */
let markReady;
export const sessionReady = new Promise(r => { markReady = r; });

const endHooks = [];
const startHooks = [];
export const onSessionEnd = fn => endHooks.push(fn);
export const onSessionStart = fn => { startHooks.push(fn); if (session.admin) fn(session.admin); };

const SESSION_HINT = 'cedesuSessionUser';   // solo para avisar a otras pestañas; no autoriza nada

/* ---------------- modo demostración local (sin servidor) ---------------- */
const DEMO_KEY = 'cedesuDemoSesion';       // sessionStorage: se pierde al cerrar la pestaña
const DEMO_FAIL = 'cedesuDemoFallos';
const MAX_HORAS = 8, MAX_FALLIDOS = 5, BLOQUEO_MS = 60_000;
let demoAccount = null;
const loadDemo = async () => (demoAccount ||= await import('../lib/demo-account.js'));
const leerJSON = (store, key) => { try { return JSON.parse(store.getItem(key) || 'null'); } catch { return null; } };
const guardarJSON = (store, key, v) => { try { v == null ? store.removeItem(key) : store.setItem(key, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

function demoUser(c) {
  return { usuario: { id: 'demo', usuario: c.usuario, nombre: c.nombre, correo: c.correo, cargo: c.cargo, rol: c.rol, demo: true } };
}
/* Restaura la sesión local si sigue vigente (8 h máximo y cierre por inactividad) */
function demoRestore() {
  const s = leerJSON(sessionStorage, DEMO_KEY);
  if (!s || !demoAccount) return false;
  const now = Date.now();
  if (now > s.expira || now - s.ultima > session.idleMinutes * 60_000) { guardarJSON(sessionStorage, DEMO_KEY, null); return false; }
  setUser({ ...demoUser(demoAccount.CUENTA), expira: s.expira });
  return true;
}
function demoTouch() {
  const s = leerJSON(sessionStorage, DEMO_KEY);
  if (s && session.admin) guardarJSON(sessionStorage, DEMO_KEY, { ...s, ultima: Date.now() });
}
async function demoLogin(user, pass) {
  const f = leerJSON(sessionStorage, DEMO_FAIL) || { n: 0, hasta: 0 };
  if (Date.now() < f.hasta) return `Demasiados intentos. Espera ${Math.ceil((f.hasta - Date.now()) / 1000)} s.`;
  const { CUENTA, coincide } = await loadDemo();
  if (!coincide(user, pass)) {
    const n = f.n + 1;
    guardarJSON(sessionStorage, DEMO_FAIL, n >= MAX_FALLIDOS ? { n: 0, hasta: Date.now() + BLOQUEO_MS } : { n, hasta: 0 });
    return n >= MAX_FALLIDOS ? 'Demasiados intentos. El acceso se bloqueó un minuto.' : 'Usuario o contraseña incorrectos.';
  }
  guardarJSON(sessionStorage, DEMO_FAIL, null);
  const expira = Date.now() + MAX_HORAS * 3_600_000;
  guardarJSON(sessionStorage, DEMO_KEY, { expira, ultima: Date.now() });
  setUser({ ...demoUser(CUENTA), expira });
  showToast('success', 'Sesión iniciada', `${CUENTA.nombre} · modo demostración sin servidor.`);
  return null;
}

function setUser(body) {
  const u = body?.usuario;
  const wasIn = !!session.admin;
  session.admin = u ? { id: u.id, usuario: u.usuario, name: u.nombre, email: u.correo, cargo: u.cargo, rol: u.rol, demo: u.demo } : null;
  session.expira = body?.expira ?? null;
  if (body?.inactividadMinutos) session.idleMinutes = body.inactividadMinutos;
  if (session.admin && !wasIn) startHooks.forEach(fn => fn(session.admin));
}

function clearLocal() {
  const wasIn = !!session.admin;
  session.admin = null;
  session.expira = null;
  if (wasIn) endHooks.forEach(fn => fn());
}

export async function endSession(reason, { remote = true } = {}) {
  if (DEMO_LOCAL) guardarJSON(sessionStorage, DEMO_KEY, null);
  else if (remote && session.admin) { try { await api('/sesion', { method: 'DELETE', quiet401: true }); } catch { /* ya no había sesión */ } }
  try { localStorage.setItem(SESSION_HINT, String(Date.now())); localStorage.removeItem(SESSION_HINT); } catch { /* sin almacenamiento */ }
  clearLocal();
  if (reason) showToast('info', 'Sesión cerrada', reason);
}

/* Devuelve si hay una sesión vigente según lo último que dijo el servidor (y la cierra si ya caducó) */
export function checkSession() {
  if (session.admin && session.expira && Date.now() > session.expira) endSession('Se alcanzó la duración máxima de la sesión.', { remote: false });
  return !!session.admin;
}

export function openLogin(nextRoute = null) {
  session.pendingRoute = nextRoute;
  ui.loginOpen = true;
}

/* Devuelve null si entró, el mensaje de error o { segundoFactor: true, error } si la cuenta pide el código */
export async function login(user, pass, code = '') {
  user = user.trim();
  if (!AUTH_AVAILABLE) return 'El acceso de administración necesita el servidor de publicación, que no está configurado en esta versión.';
  if (!user || !pass) return 'Escribe el usuario y la contraseña.';
  if (DEMO_LOCAL) return demoLogin(user, pass);
  try {
    const body = await api('/sesion', { method: 'POST', json: { usuario: user, contrasena: pass, ...(code ? { codigo: code } : {}) }, quiet401: true });
    setUser(body);
    showToast('success', 'Sesión iniciada', `${session.admin.name}${session.admin.cargo ? ` · ${session.admin.cargo}` : ''}.`);
    return null;
  } catch (err) {
    if (err instanceof ApiError && err.body?.segundoFactor) return { segundoFactor: true, error: code ? err.detalle : '' };
    return err instanceof ApiError ? err.detalle : 'No se pudo iniciar sesión.';
  }
}

/* Comprueba con el servidor si la sesión sigue vigente (al volver a la pestaña, por ejemplo) */
async function refresh({ announce = false } = {}) {
  if (!AUTH_AVAILABLE) return;
  let body;
  try { body = await api('/sesion', { quiet401: true }); }
  catch { return; }   // sin conexión: se conserva lo que había y se vuelve a intentar más tarde
  if (body?.usuario) { setUser(body); return; }
  if (session.admin) {
    clearLocal();
    if (announce) showToast('info', 'Sesión cerrada', 'Por inactividad, porque caducó o porque se cerró en otra pestaña.');
  }
}

/* Actividad: la sesión del servidor se renueva sola con cada petición; si la persona solo mira el mapa,
   se confirma con el servidor como máximo cada 5 minutos para que no caduque mientras trabaja. */
let lastPing = Date.now();
function touchSession() {
  const now = Date.now();
  if (!session.admin || now - lastPing < 5 * 60_000) return;
  lastPing = now;
  refresh({ announce: true });
}

export async function initSession() {
  try { localStorage.removeItem('cedesuSession'); localStorage.removeItem('cedesuUser'); sessionStorage.removeItem('cedesuLoginFail'); } catch { /* claves del modo local anterior */ }
  setUnauthorizedHandler(() => {
    if (session.admin) { clearLocal(); showToast('info', 'Sesión cerrada', 'La sesión caducó. Vuelve a iniciar sesión para continuar.'); }
  });
  if (!AUTH_AVAILABLE) { session.ready = true; markReady(); return; }
  if (DEMO_LOCAL) {
    const { CUENTA } = await loadDemo();
    session.demo = { usuario: CUENTA.usuario, correo: CUENTA.correo, contrasena: CUENTA.contrasena, local: true };
    demoRestore();
    ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, demoTouch, { passive: true }));
    setInterval(() => {
      if (!session.admin) return;
      const s = leerJSON(sessionStorage, DEMO_KEY);
      if (!s || Date.now() - s.ultima > session.idleMinutes * 60_000) endSession('Por inactividad.');
      else checkSession();
    }, 30_000);
    session.ready = true;
    markReady();
    return;
  }
  ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, touchSession, { passive: true }));
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && session.admin) refresh({ announce: true }); });
  addEventListener('storage', e => { if (e.key === SESSION_HINT && session.admin) refresh({ announce: true }); });
  setInterval(() => checkSession(), 30_000);
  await refresh();
  session.ready = true;
  markReady();
  /* Cuenta de demostración: solo existe si el servidor arrancó en ese modo */
  api('/demo', { quiet401: true }).then(d => { session.demo = d?.usuario ? d : null; }).catch(() => { session.demo = null; });
}
