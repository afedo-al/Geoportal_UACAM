/* Coordenadas de las filas de un Excel de puntos de campo. Plantilla: Name, X, Y, Autor.
   X e Y se detectan solas: si todas caben en grados son longitud y latitud (WGS 84); si no, son Este y
   Norte en metros (UTM 15N o 16N). Sin dependencias del navegador: se prueba con `npm test`. */
import { fromUTM } from './geo.js';
import { inWorkArea } from './coords.js';

const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[ _-]+/g, '');

export const ALIASES = {
  name: ['name', 'nombre', 'nombrepunto', 'punto'],
  x: ['x', 'longitud', 'longitude', 'lon', 'lng', 'este', 'easting'],
  y: ['y', 'latitud', 'latitude', 'lat', 'norte', 'northing'],
  author: ['autor', 'author', 'responsable']
};

export function cell(row, aliases) {
  const target = aliases.map(norm);
  const key = Object.keys(row).find(k => target.includes(norm(k)));
  return key ? row[key] : '';
}

const num = v => {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};

/* Devuelve { system, needsZone, coords }: coords[i] es { lat, lon } o null si la fila no tiene coordenadas
   válidas para Campeche. `zone` (15 o 16) desempata cuando los metros caben en las dos zonas. */
export function resolveCoords(rows, zone = null) {
  const xy = rows.map(r => [num(cell(r, ALIASES.x)), num(cell(r, ALIASES.y))]);
  const finite = xy.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const degrees = finite.length > 0 && finite.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90);
  if (degrees) {
    return { system: 'wgs84', needsZone: false, coords: xy.map(([x, y]) => (inWorkArea(y, x) ? { lat: y, lon: x } : null)) };
  }
  const convert = z => xy.map(([x, y]) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 100000 || x > 900000 || y < 0 || y > 10000000) return null;
    const p = fromUTM(x, y, z);
    return inWorkArea(p.lat, p.lon) ? { lat: p.lat, lon: p.lon } : null;
  });
  const byZone = { 15: convert(15), 16: convert(16) };
  const complete = z => byZone[z].every((c, i) => c || !Number.isFinite(xy[i][0]) || !Number.isFinite(xy[i][1]));
  const fits = [15, 16].filter(z => finite.length && byZone[z].filter(Boolean).length === finite.length && complete(z));
  if (fits.length === 1) return { system: `utm${fits[0]}`, needsZone: false, coords: byZone[fits[0]] };
  if (fits.length === 2) {
    if (zone === 15 || zone === 16) return { system: `utm${zone}`, needsZone: false, coords: byZone[zone] };
    return { system: 'utm', needsZone: true, coords: [] };
  }
  const best = zone === 16 ? 16 : 15;
  return { system: `utm${best}`, needsZone: false, coords: byZone[best] };
}

/* Plantilla descargable */
export const TEMPLATE_HEADERS = ['Name', 'X', 'Y', 'Autor'];
export const TEMPLATE_EXAMPLE = ['Sitio 1', -90.52283, 19.8453, 'Nombre de quien levantó el punto'];
