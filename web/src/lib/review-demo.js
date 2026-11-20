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

function seed(layers = DEMO_LAYERS) {
  const now = new Date().toISOString();
  return (layers || []).map(([id, titulo, geojsonFile, entidades, tema]) => ({
    id, titulo, capa: titulo, formato: 'geojson', estado: 'en_revision', estadoTexto: STATES.en_revision,
    acceso: 'Público', autor: 'CEDESU', creada: now, actualizada: now,
    revisor: '', publicada: null, crs: 'EPSG:4326 · WGS 84', resolucion: 'Datos para revisión',
    tieneGeometria: true, entidades, geojsonFile, nota: '', transiciones: NEXT.en_revision,
    archivos: [{ nombre: geojsonFile, tam: 1024, sha256: '0'.repeat(64) }],
    estudio: {
      sTitle: titulo, sTheme: tema, sDate: 'No documentada', sResp: 'Equipo CEDESU',
      sSource: 'Repositorio institucional', sLic: 'Uso institucional',
      sAccess: 'Público', sKeywords: tema, sDesc: 'Registro para flujo de revisión.'
    },
    revision: [
      ['ok', 'Validación completada', 'El archivo se puede visualizar en el visor.'],
      ['info', 'Vista previa disponible', 'Geometría disponible para verificación.'],
      ['info', 'En espera de revisión', 'Pendiente de aprobación administrativa.']
    ],
    historial: [{ accion: 'carga_en_revision', fecha: now, usuario: 'Administración', detalle: {} }]
  }));
}

export function createReviewDemo({ initialLayers = DEMO_LAYERS, loadGeoJSON = file => fetch(`data/${file}`).then(response => {
  if (!response.ok) throw new Error('No se pudo cargar la vista previa.');
  return response.json();
}) } = {}) {
  let records = seed(initialLayers);
  const geometries = new Map();
  const get = id => {
    const item = records.find(record => record.id === id);
    if (!item) throw new Error('No se encontró la carga.');
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
      if (!geometries.has(id)) {
        if (item.geojsonFile) geometries.set(id, loadGeoJSON(item.geojsonFile));
        else return null;
      }
      try { return clone(await geometries.get(id)); }
      catch (error) { geometries.delete(id); throw error; }
    },
    add(info, geojson = null) {
      const now = new Date().toISOString();
      const norm = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const prevPublished = records.find(r => r.estado === 'publicada' && (norm(r.titulo) === norm(info.titulo) || norm(r.capa) === norm(info.titulo)));

      const item = {
        id: info.id || `carga-${Date.now()}`,
        titulo: info.titulo,
        capa: info.titulo,
        formato: info.formato || 'geojson',
        estado: 'en_revision',
        estadoTexto: STATES.en_revision,
        acceso: info.estudio?.sAccess || 'Pública',
        autor: info.usuario || 'Administración',
        creada: now,
        actualizada: now,
        revisor: '',
        publicada: null,
        crs: info.crs || 'EPSG:4326 · WGS 84',
        resolucion: 'Cargada desde la plataforma',
        tieneGeometria: !!geojson,
        entidades: info.entidades || (geojson?.features?.length || 0),
        nota: '',
        transiciones: NEXT.en_revision,
        reemplazaId: prevPublished ? prevPublished.id : null,
        reemplazaTitulo: prevPublished ? prevPublished.titulo : null,
        archivos: info.archivos?.length ? info.archivos : [{ nombre: `${info.titulo}.geojson`, tam: 1024, sha256: '0'.repeat(64) }],
        estudio: info.estudio || {},
        revision: [
          ...(prevPublished ? [['info', 'Actualización de capa publicada', `Ya existe una versión previa publicada («${prevPublished.titulo}»). Al publicarse esta nueva versión, la anterior se archivará automáticamente.`]] : []),
          ['ok', 'Validación de estructura completada', 'El archivo cumple con la geometría y esquema requeridos.'],
          ['info', 'Vista previa disponible', 'Geometría validada para visualización cartográfica.'],
          ['info', 'En espera de revisión', 'Esperando aprobación de la persona administradora.']
        ],
        historial: [{ accion: 'carga_en_revision', fecha: now, usuario: info.usuario || 'Administración', detalle: {} }]
      };
      records.unshift(item);
      if (geojson) {
        geometries.set(item.id, Promise.resolve(geojson));
      }
      return clone(item);
    },
    findPublished(titulo, capa, excludeId = null) {
      const norm = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const t = norm(titulo);
      const c = norm(capa);
      return records.find(r => r.id !== excludeId && r.estado === 'publicada' && (norm(r.titulo) === t || norm(r.capa) === c)) || null;
    },
    publishedList() {
      return clone(records.filter(r => r.estado === 'publicada'));
    },
    transition(id, estado, nota = '', usuario = 'Administración · demostración') {
      const item = get(id);
      if (!NEXT[item.estado].includes(estado)) throw new Error('Este cambio de estado no está permitido.');
      if (['requiere_correccion', 'archivada'].includes(estado) && !nota.trim()) throw new Error('Escribe el motivo.');
      const fecha = new Date().toISOString();
      Object.assign(item, { estado, estadoTexto: STATES[estado], transiciones: NEXT[estado], nota: nota.trim(), actualizada: fecha, revisor: usuario });
      if (estado === 'publicada') {
        item.publicada = fecha;
        // Archivar automáticamente versiones anteriores publicadas de la misma capa
        const norm = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const t = norm(item.titulo);
        const c = norm(item.capa);
        records.forEach(prev => {
          if (prev.id !== item.id && prev.estado === 'publicada' && (norm(prev.titulo) === t || norm(prev.capa) === c || prev.id === item.reemplazaId)) {
            prev.estado = 'archivada';
            prev.estadoTexto = STATES.archivada;
            prev.transiciones = NEXT.archivada;
            prev.actualizada = fecha;
            prev.nota = `Archivada automáticamente al publicarse una versión más reciente («${item.titulo}»).`;
            prev.historial.push({
              accion: 'capa_reemplazada',
              fecha,
              usuario,
              detalle: { nota: `Sustituida por nueva versión publicada («${item.titulo}»)` }
            });
          }
        });
      }
      item.historial.push({ accion: EVENTS[estado], fecha, usuario, detalle: { nota: nota.trim() } });
      return clone(item);
    },
    delete(id) {
      const idx = records.findIndex(r => r.id === id);
      if (idx === -1) throw new Error('No se encontró la carga.');
      const item = records[idx];
      if (item.estado !== 'archivada') {
        throw new Error('Solo se pueden eliminar capas que hayan sido archivadas previamente.');
      }
      records.splice(idx, 1);
      geometries.delete(id);
      return true;
    },
    reset() { records = seed(); geometries.clear(); }
  };
}

export const reviewDemo = createReviewDemo({ initialLayers: [] });
