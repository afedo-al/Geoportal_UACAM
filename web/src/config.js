/* Configuración del despliegue.
   El servicio de publicación aún no existe en este repositorio. Su dirección se define al compilar con
   VITE_API_BASE (por ejemplo «/api»). Sin API configurada, la interfaz lo indica en lugar de simular una publicación. */
export const CFG = Object.freeze({
  apiBase: import.meta.env.VITE_API_BASE || null,
  /* Mapa base sin límites administrativos (MapTiler). Se define al compilar con VITE_MAPTILER_KEY y VITE_MAP_STYLE_ID.
     La clave viaja en el navegador: no es secreta, hay que restringirla a los orígenes autorizados en MapTiler. */
  mapStyle: Object.freeze({
    key: import.meta.env.VITE_MAPTILER_KEY || null,
    id: import.meta.env.VITE_MAP_STYLE_ID || null
  }),
  session: Object.freeze({
    idleMinutes: 30       /* cierre por inactividad (el servidor aplica el suyo; este aviso lo refleja) */
  })
});
