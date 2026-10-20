/* Configuración del despliegue.
   Sin API configurada, la interfaz lo indica en lugar de simular una publicación.
   En el build se define con la variable VITE_API_BASE (por ejemplo «/api»). */
export const CFG = Object.freeze({
  apiBase: import.meta.env.VITE_API_BASE || null,
  session: Object.freeze({
    maxHours: 8,          /* duración máxima de una sesión */
    idleMinutes: 30,      /* cierre por inactividad */
    maxFailedLogins: 5,   /* intentos fallidos antes de bloquear */
    lockSeconds: 60       /* duración del bloqueo */
  })
});
