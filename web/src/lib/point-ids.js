/* Identificadores de los puntos de campo: solo letras, números, punto, guion y guion bajo; nunca nombres
   reservados de objetos. Los que faltan o se repiten se reemplazan, para que editar o borrar un punto no
   afecte a otro. Sin dependencias del navegador: se prueba con `npm test`. */
export const ID_OK = /^(?!__proto__$|constructor$|prototype$)[\w.-]{1,40}$/;

let seq = 0;
export function normalizeIds(points, taken = []) {
  const seen = new Set(taken);
  return points.map(p => {
    let id = p.id;
    while (!id || !ID_OK.test(id) || seen.has(id)) id = `P-${Date.now().toString(36)}-${(++seq).toString(36)}`;
    seen.add(id);
    return id === p.id ? p : { ...p, id };
  });
}
