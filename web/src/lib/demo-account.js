/* Cuenta de demostración local: SOLO para desarrollo sin servidor de publicación.
   La contraseña se compara en el navegador y está a la vista en este archivo, así que no protege nada
   (RPT-003, 4.7). Este módulo se carga con import() dinámico únicamente cuando DEMO_LOCAL es verdadero:
   el build de producción no lo incluye (ver stores/session.js). */
export const CUENTA = Object.freeze({
  usuario: 'cedesu.admin',
  correo: 'cedesu@admin.uacam.mx',
  contrasena: 'Cedesu.Geo#2026',
  nombre: 'Administración CEDESU',
  cargo: 'Cuenta de demostración',
  rol: 'admin'
});

export function coincide(usuario, contrasena) {
  const u = String(usuario || '').trim().toLowerCase();
  return (u === CUENTA.usuario || u === CUENTA.correo) && contrasena === CUENTA.contrasena;
}
