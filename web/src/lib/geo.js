/* Cálculos cartográficos sin dependencias del mapa */

export const STATE_BOUNDS = [[17.8, -92.5], [20.9, -89.1]]; // [[sur, oeste], [norte, este]]
export const START_BOUNDS = [[17.6, -92.6], [21.7, -86.6]];

/* UTM (conversión directa sobre el elipsoide WGS 84) */
export function toUTM(lat, lon, zone) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
  const lam0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lam0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const y = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  return { x, y: lat < 0 ? y + 10000000 : y };
}

export function fromUTM(x, y, zone) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const mu = (y / k0) / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2), T1 = Math.tan(phi1) ** 2, C1 = ep2 * Math.cos(phi1) ** 2;
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5, D = (x - 500000) / (N1 * k0);
  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
  const lon = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(phi1);
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}

/* crs: 'wgs84' | 'utm15' | 'utm16' */
export function formatCoord(lat, lon, crs = 'wgs84') {
  if (crs === 'wgs84') return `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(5)}° ${lon <= 0 ? 'O' : 'E'}`;
  const u = toUTM(lat, lon, crs === 'utm15' ? 15 : 16);
  return `E ${Math.round(u.x).toLocaleString('es-MX')}  N ${Math.round(u.y).toLocaleString('es-MX')}`;
}

/* Escala numérica: metros por píxel en el suelo / tamaño del píxel de un monitor (0.26458 mm) */
export function scaleDenominator(lat, resolution3857) {
  return resolution3857 * Math.cos(lat * Math.PI / 180) / 0.00026458;
}
export function niceScale(n) {
  const p = 10 ** Math.floor(Math.log10(n));
  const v = Math.round(n / (p / 10)) * (p / 10);
  return `1 : ${Math.round(v).toLocaleString('es-MX')}`;
}

/* Etiquetas de gratícula: grados y minutos */
export function fmtDM(v, pos, neg) {
  const a = Math.abs(v);
  let d = Math.floor(a), m = Math.round((a - d) * 60);
  if (m === 60) { d++; m = 0; }
  return `${d}°${m ? String(m).padStart(2, '0') + '′' : ''} ${v >= 0 ? pos : neg}`;
}

/* Área sobre el elipsoide a partir de vértices [lon, lat] */
export function geodesicArea(lonlat) {
  const R = 6378137; let area = 0;
  for (let i = 0; i < lonlat.length; i++) {
    const p1 = lonlat[i], p2 = lonlat[(i + 1) % lonlat.length];
    area += (p2[0] - p1[0]) * Math.PI / 180 * (2 + Math.sin(p1[1] * Math.PI / 180) + Math.sin(p2[1] * Math.PI / 180));
  }
  return Math.abs(area * R * R / 2);
}
export const fmtLen = m => m >= 1000 ? `${(m / 1000).toLocaleString('es-MX', { maximumFractionDigits: 2 })} km` : `${Math.round(m).toLocaleString('es-MX')} m`;
export const fmtArea = m2 => m2 >= 1e6 ? `${(m2 / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 2 })} km²` : m2 >= 1e4 ? `${(m2 / 1e4).toLocaleString('es-MX', { maximumFractionDigits: 2 })} ha` : `${Math.round(m2).toLocaleString('es-MX')} m²`;

/* Coordenadas escritas por el usuario: «19.84, -90.53», «19.84 N 90.53 O»… */
export function parseCoord(q) {
  const m = q.trim().replace(/[°]/g, ' ').match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*([NS])?\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*([EOW])?$/i);
  if (!m) return null;
  let lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[3].replace(',', '.'));
  if (m[2] && /s/i.test(m[2])) lat = -Math.abs(lat);
  if (m[4] && /[ow]/i.test(m[4])) lon = -Math.abs(lon);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
