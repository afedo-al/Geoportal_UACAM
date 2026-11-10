/* Utilidades de formato y almacenamiento local */

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* almacenamiento no disponible */ } }
};

export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const fmtNum = (v, d = 0) => Number.isFinite(+v) ? (+v).toLocaleString('es-MX', { maximumFractionDigits: d }) : String(v ?? '—');

export const fmtDate = iso => {
  if (!iso) return '';
  const d = new Date(`${iso.length === 7 ? iso + '-01' : iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-MX', iso.length === 7 ? { year: 'numeric', month: 'long' } : { year: 'numeric', month: 'short', day: 'numeric' });
};

export const fmtDay = value => {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('es-MX');
};

export const fmtSize = n => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* Fotografía de un punto GPS: https, imagen embebida PNG/JPEG/WebP o la fotografía que sirve el propio
   servicio de publicación (mismo origen, ruta …/puntos/<id>/foto) */
const ownPhoto = url => {
  if (typeof location === 'undefined' || !/^https?:\/\//i.test(url)) return false;
  try { const u = new URL(url); return u.origin === location.origin && /\/puntos\/[A-Za-z0-9._%-]+\/foto$/.test(u.pathname) && !/["'<>\s]/.test(url); } catch { return false; }
};
export const safePhotoURL = (url = '') => typeof url === 'string' && (/^(https:\/\/[^\s"'<>]+|data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+)$/i.test(url) || ownPhoto(url)) ? url : '';
