/* Presentación con los mapas aportados desde QGIS. Este módulo solo se importa en modo DEMO_LOCAL.
   Los cambios viven en memoria durante la sesión de la página; nunca publica datos. */
import { QGIS_FILES } from './review-qgis-data.js';

const STATES = {
  recibida: 'En proceso', en_revision: 'En revisión', aprobada: 'Aprobada',
  requiere_correccion: 'Requiere corrección', publicada: 'Publicada', archivada: 'Archivada'
};
const NEXT = {
  recibida: [], en_revision: ['aprobada', 'requiere_correccion', 'archivada'],
  aprobada: ['publicada', 'requiere_correccion', 'archivada'],
  requiere_correccion: ['en_revision', 'archivada'], publicada: ['archivada'], archivada: ['en_revision']
};
const EVENTS = {
  aprobada: 'carga_aprobada', publicada: 'capa_publicada', requiere_correccion: 'carga_devuelta',
  archivada: 'carga_archivada', en_revision: 'carga_reabierta'
};
const clone = value => JSON.parse(JSON.stringify(value));

const DESCRIPTIONS = {
  qgisMunicipios: {
    titulo: 'Municipios de Quintana Roo (2015)', tema: 'División municipal · Población',
    crs: 'Original EPSG:32616 · vista web EPSG:4326',
    descripcion: 'Límites de los 11 municipios de Quintana Roo con población, superficie y densidad. Versión web reproyectada de UTM 16N a WGS 84 y simplificada para visualización.',
    fuente: 'No documentada en los metadatos; título original: Municipios_de_Quintana_Roo_M2.',
    fecha: 'No documentada; 2015 figura en el nombre del archivo', responsable: 'No documentado', licencia: 'No documentada',
    acceso: 'No documentado', resolucion: 'Simplificación para la web: 0.0004° (aprox. 40 m)'
  },
  qgisEntidades: {
    titulo: 'Entidades federativas de México', tema: 'División estatal', crs: 'EPSG:4326 · WGS 84',
    descripcion: 'Límites de las 32 entidades federativas. Incluye los atributos de superficie, toneladas 2022 y cultivo presentes en mexico.shp. Geometrías simplificadas para la web; se conservan las islas pequeñas.',
    fuente: 'mexico.shp · no incluye metadatos de procedencia', fecha: 'No documentada',
    responsable: 'No documentado', licencia: 'No documentada', acceso: 'No documentado',
    resolucion: 'Simplificación para la web: 0.004° (aprox. 400 m)'
  },
  qgisClimas: {
    titulo: 'Climas de México (Köppen-García)', tema: 'Clima', crs: 'EPSG:4326 · WGS 84',
    descripcion: 'Tipos de clima de la República Mexicana según la clasificación de Köppen modificada por García, escala 1:1 000 000. Procedencia y licencia leídas de clima1mgw.xml. Versión simplificada para visualización web.',
    fuente: 'García, E. (1998). Climas, escala 1:1 000 000. CONABIO.', fecha: '2001-05-11 (publicación)',
    responsable: 'García, E. · CONABIO', licencia: 'CC BY-NC 2.5 MX · citar la fuente y a CONABIO', acceso: 'Público',
    resolucion: 'Escala 1:1 000 000 · simplificación web: 0.006° (aprox. 600 m)'
  }
};

function seed() {
  const creada = new Date().toISOString();
  return QGIS_FILES.map(file => {
    const meta = DESCRIPTIONS[file.id];
    const documented = file.id === 'qgisClimas';
    return {
      ...clone(file), titulo: meta.titulo, capa: file.source, tema: meta.tema, formato: 'shp',
      estado: 'en_revision', estadoTexto: STATES.en_revision, acceso: meta.acceso,
      autor: 'Archivos locales · QGIS', creada, actualizada: creada, revisor: '', publicada: null,
      crs: meta.crs, resolucion: meta.resolucion, nota: '', tieneGeometria: true, transiciones: NEXT.en_revision,
      estudio: { sTitle: meta.titulo, sTheme: meta.tema, sDate: meta.fecha, sResp: meta.responsable,
        sSource: meta.fuente, sLic: meta.licencia, sAccess: meta.acceso, sDesc: meta.descripcion },
      revision: [
        ['ok', 'Componentes del Shapefile presentes', 'Se encontraron SHP, SHX, DBF y PRJ en la carpeta QGIS.'],
        ['ok', 'Conteo de entidades comprobado', `${file.entidades.toLocaleString('es-MX')} registros en el DBF y en la versión GeoJSON para la web.`],
        ['info', 'Vista previa en WGS 84', meta.resolucion],
        [documented ? 'info' : 'warn', documented ? 'Procedencia y licencia documentadas' : 'Metadatos pendientes',
          documented ? meta.licencia : 'No se documentan responsable, licencia y clasificación de acceso. Completar antes de una publicación real.'],
        ['info', 'Revisión local para presentación', 'No se ha ejecutado antivirus ni validación en el servidor. Aprobar y publicar solo simulan el flujo.']
      ],
      historial: [{ accion: 'demo_abierta', fecha: creada, usuario: 'Sesión local', detalle: { nota: `Archivo: ${file.source}` } }]
    };
  });
}

export function createReviewDemo({ loadGeoJSON = async file => {
  const response = await fetch(`${import.meta.env?.BASE_URL || '/'}data/${file}`);
  if (!response.ok) throw new Error('No se pudo cargar el mapa. Vuelve a seleccionar la capa para reintentar.');
  return response.json();
} } = {}) {
  let records = seed();
  const geometries = new Map();
  function get(id) {
    const item = records.find(r => r.id === id);
    if (!item) throw new Error('No se encontró esta capa de QGIS.');
    return item;
  }
  return {
    list(estado = '') {
      return clone({ cargas: records.filter(r => !estado || r.estado === estado),
        totales: Object.fromEntries(Object.keys(STATES).map(s => [s, records.filter(r => r.estado === s).length])) });
    },
    detail: id => clone(get(id)),
    async geometry(id) {
      const item = get(id);
      if (item.localGeojson) return clone(item.localGeojson);
      if (!geometries.has(id)) {
        const pending = Promise.resolve().then(() => loadGeoJSON(item.geojsonFile)).then(data => {
          if (data?.type !== 'FeatureCollection' || data.features?.length !== item.entidades) {
            throw new Error('La versión web no coincide con el inventario de esta capa.');
          }
          return data;
        }).catch(error => { geometries.delete(id); throw error; });
        geometries.set(id, pending);
      }
      return geometries.get(id);
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
    addUpload(upload) {
      if (records.some(r => r.id === upload.id)) return;
      const fecha = new Date().toISOString();
      records.push({
        ...clone(upload),
        estado: 'en_revision', estadoTexto: STATES.en_revision, acceso: upload.estudio?.sAccess || '',
        autor: upload.estudio?.sResp || 'Carga manual', creada: fecha, actualizada: fecha, revisor: '', publicada: null,
        nota: '', tieneGeometria: true, transiciones: NEXT.en_revision,
        estudio: { ...upload.estudio },
        revision: [
          ['ok', 'Validación local completada', 'La capa fue leída y validada en este navegador.'],
          ['info', 'Carga manual para presentación', 'La revisión y publicación se simulan mientras no haya servidor.']
        ],
        historial: [{ accion: 'carga_en_revision', fecha, usuario: 'Carga manual', detalle: {} }],
        localGeojson: upload.geojson
      });
    },
    reset() { records = seed(); }
  };
}

export const reviewDemo = createReviewDemo();
