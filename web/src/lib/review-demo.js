/* Flujo de revisión local para demostraciones. No sustituye al servicio de publicación. */
const STATES = {
  en_revision: 'En revisión',
  aprobada: 'Aprobada',
  requiere_correccion: 'Requiere corrección',
  publicada: 'Publicada',
  archivada: 'Archivada'
};
const NEXT = {
  en_revision: ['aprobada', 'requiere_correccion', 'archivada'],
  aprobada: ['publicada', 'requiere_correccion', 'archivada'],
  requiere_correccion: ['en_revision', 'archivada'],
  publicada: ['archivada'],
  archivada: ['en_revision']
};
const EVENTS = {
  aprobada: 'carga_aprobada',
  publicada: 'capa_publicada',
  requiere_correccion: 'carga_devuelta',
  archivada: 'carga_archivada',
  en_revision: 'carga_reabierta'
};
const clone = value => JSON.parse(JSON.stringify(value));

const DEMO_LAYERS = [
  ['demo-municipios', 'Municipios de Quintana Roo (2015)', 'municipios_qroo_2015.geojson', 11, 'División municipal'],
  ['demo-entidades', 'Entidades federativas de México', 'mexico_entidades.geojson', 32, 'División estatal'],
  ['demo-climas', 'Climas de México (CONABIO)', 'climas_conabio_1m.geojson', 1182, 'Clima']
];

function seed() {
  const now = new Date().toISOString();
  return DEMO_LAYERS.map(([id, titulo, geojsonFile, entidades, tema]) => ({
    id, titulo, capa: titulo, formato: 'geojson', estado: 'en_revision', estadoTexto: STATES.en_revision,
    acceso: 'Público', autor: 'Carga de demostración', creada: now, actualizada: now,
    revisor: '', publicada: null, crs: 'EPSG:4326 · WGS 84', resolucion: 'Datos de prueba para demostración',
    tieneGeometria: true, entidades, geojsonFile, nota: '', transiciones: NEXT.en_revision,
    archivos: [{ nombre: geojsonFile, tam: 1024, sha256: '0'.repeat(64) }],
    estudio: {
      sTitle: titulo, sTheme: tema, sDate: 'No documentada', sResp: 'Equipo DeltaMap-CEDESU',
      sSource: 'Datos de prueba incluidos en el repositorio', sLic: 'Uso de demostración',
      sAccess: 'Público', sKeywords: tema, sDesc: 'Registro local para demostrar el flujo de revisión.'
    },
    revision: [
      ['ok', 'Validación local completada', 'El archivo de prueba se puede visualizar en el navegador.'],
      ['info', 'Vista previa disponible', 'La geometría se carga desde los datos públicos de prueba.'],
      ['warn', 'Revisión de demostración', 'No se ha ejecutado antivirus ni validación en un servidor.']
    ],
    historial: [{ accion: 'carga_en_revision', fecha: now, usuario: 'Sesión local', detalle: {} }]
  }));
}

export function createReviewDemo({ loadGeoJSON = file => fetch(`data/${file}`).then(response => {
  if (!response.ok) throw new Error('No se pudo cargar la vista previa de demostración.');
  return response.json();
}) } = {}) {
  let records = seed();
  const geometries = new Map();
  const get = id => {
    const item = records.find(record => record.id === id);
    if (!item) throw new Error('No se encontró la carga de demostración.');
    return item;
  };
  return {
    list(estado = '') {
      return clone({
        cargas: records.filter(record => !estado || record.estado === estado),
        totales: Object.fromEntries(Object.keys(STATES).map(state => [state, records.filter(record => record.estado === state).length]))
      });
    },
    detail: id => clone(get(id)),
    async geometry(id) {
      const item = get(id);
      if (!geometries.has(id)) geometries.set(id, loadGeoJSON(item.geojsonFile));
      try { return clone(await geometries.get(id)); }
      catch (error) { geometries.delete(id); throw error; }
    },
    transition(id, estado, nota = '', usuario = 'Administración · demostración') {
      const item = get(id);
      if (!NEXT[item.estado].includes(estado)) throw new Error('Este cambio de estado no está permitido.');
      if (['requiere_correccion', 'archivada'].includes(estado) && !nota.trim()) throw new Error('Escribe el motivo.');
      const fecha = new Date().toISOString();
      Object.assign(item, { estado, estadoTexto: STATES[estado], transiciones: NEXT[estado], nota: nota.trim(), actualizada: fecha, revisor: usuario });
      if (estado === 'publicada') item.publicada = fecha;
      item.historial.push({ accion: EVENTS[estado], fecha, usuario, detalle: { nota: nota.trim() } });
      return clone(item);
    },
    reset() { records = seed(); geometries.clear(); }
  };
}

export const reviewDemo = createReviewDemo();
