/* Cliente del servicio de publicación (pendiente; se activa con VITE_API_BASE). Solo se habla con el mismo origen o con HTTPS.
   Toda petición que cambia datos lleva el token CSRF de Django (cookie «csrftoken», que deja GET /api/sesion). */
import { CFG } from '../config.js';

export class ApiError extends Error {
  constructor(status, detalle, body = {}) { super(detalle); this.status = status; this.detalle = detalle; this.body = body; }
}

/* Dirección base de la API, o null si no hay servidor configurado o no es segura */
export function apiUrl() {
  if (!CFG.apiBase) return null;
  try {
    const url = new URL(CFG.apiBase, location.origin);
    if (url.origin !== location.origin && url.protocol !== 'https:') return null;
    return url.href.replace(/\/$/, '');
  } catch { return null; }
}
export const hasApi = () => !!CFG.apiBase;
export const sameOrigin = () => { const u = apiUrl(); return !!u && new URL(u).origin === location.origin; };

/* Token CSRF de Django: en producción la cookie lleva el prefijo __Host- */
export function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)(?:__Host-)?csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

let onUnauthorized = () => {};
/* La sesión registra aquí qué hacer si el servidor responde 401 (sesión caducada o cerrada en otro lugar) */
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };

/* Petición JSON. Lanza ApiError con el «detalle» del servidor si la respuesta no es 2xx. */
export async function api(path, { method = 'GET', json, body, signal, quiet401 = false } = {}) {
  const base = apiUrl();
  if (!base) throw new ApiError(0, CFG.apiBase ? 'El servidor configurado no es del mismo origen ni usa HTTPS.' : 'No hay servidor de publicación configurado.');
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method, signal,
      credentials: sameOrigin() ? 'same-origin' : 'include',
      headers: {
        'X-Requested-With': 'GeoportalCEDESU', Accept: 'application/json',
        ...(SAFE.has(method) ? {} : { 'X-CSRFToken': csrfToken() }),
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: json !== undefined ? JSON.stringify(json) : body
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'No se pudo conectar con el servidor.');
  }
  let data = null;
  const type = res.headers.get('content-type') || '';
  if (/json/.test(type)) { try { data = await res.json(); } catch { data = null; } }
  if (!res.ok) {
    if (res.status === 401 && !quiet401) onUnauthorized();
    throw new ApiError(res.status, data?.detalle || `El servidor respondió ${res.status}.`, data || {});
  }
  return data;
}

/* Dirección absoluta de un recurso de la API (fotografías, GeoJSON publicados) */
export const apiHref = rel => { const base = apiUrl(); return base ? `${base}/${String(rel).replace(/^\//, '')}` : ''; };
