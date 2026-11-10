/* Reglas de las coordenadas de los puntos de campo (WGS 84, grados decimales). Sin dependencias del mapa
   ni del navegador: se prueban con `npm test`. */

export const LAT = [14, 22], LON = [-93, -86]; // área de trabajo: Campeche y alrededores

/* Mensaje de error de una latitud o longitud escrita, o '' si es válida.
   Primero el rango del globo y después el área de trabajo; acepta coma decimal. */
export function coordError(value, axis) {
  const [lo, hi] = axis === 'lat' ? LAT : LON;
  const [glo, ghi] = axis === 'lat' ? [-90, 90] : [-180, 180];
  const name = axis === 'lat' ? 'latitud' : 'longitud';
  const txt = String(value ?? '').trim().replace(',', '.');
  if (!txt) return `Escribe la ${name} o elige el punto en el mapa.`;
  const n = Number(txt);
  if (!Number.isFinite(n)) return `La ${name} debe ser un número en grados decimales (por ejemplo ${axis === 'lat' ? '19.84530' : '-90.52283'}).`;
  if (n < glo || n > ghi) return `Una ${name} válida está entre ${glo} y ${ghi}.`;
  if (n < lo || n > hi) return `Fuera del área de trabajo: la ${name} de Campeche y alrededores va de ${lo} a ${hi}.`;
  return '';
}

export const inWorkArea = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= LAT[0] && lat <= LAT[1] && lon >= LON[0] && lon <= LON[1];
