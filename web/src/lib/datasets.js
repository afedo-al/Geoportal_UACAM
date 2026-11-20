/* Conjuntos de datos de prueba (Shapefile de QGIS convertidos a GeoJSON en public/data/).
   Se reproyectaron a WGS 84 y se simplificaron (Douglas-Peucker) solo para visualización web. */
import { fmtNum } from './format.js';

export const GROUPS = [
  { id: 'publicadas', name: 'Capas publicadas' },
  { id: 'pruebas', name: 'Capas de referencia' },
  { id: 'sesion', name: 'Capas de la sesión' }
];

export const CONTACTO_CEDESU = {
  org: 'CEDESU · Universidad Autónoma de Campeche',
  nombre: 'Unidad de Información Geográfica',
  correo: 'geoportal@cedesu.uacam.mx (dato de ejemplo)',
  dir: 'San Francisco de Campeche, Campeche (dato de ejemplo)'
};

/* Cabeceras municipales de Campeche para la búsqueda de lugares (coordenadas aproximadas). */
export const PLACES = [
  ['San Francisco de Campeche', 'Campeche', 19.845, -90.523], ['Ciudad del Carmen', 'Carmen', 18.649, -91.822],
  ['Champotón', 'Champotón', 19.350, -90.722], ['Escárcega', 'Escárcega', 18.609, -90.739],
  ['Calkiní', 'Calkiní', 20.371, -90.051], ['Hecelchakán', 'Hecelchakán', 20.177, -90.133],
  ['Tenabo', 'Tenabo', 20.040, -90.224], ['Hopelchén', 'Hopelchén', 19.746, -89.845],
  ['Palizada', 'Palizada', 18.255, -92.092], ['Candelaria', 'Candelaria', 18.184, -91.044],
  ['Xpujil', 'Calakmul', 18.507, -89.394], ['Seybaplaya', 'Seybaplaya', 19.643, -90.690],
  ['Dzitbalché', 'Dzitbalché', 20.318, -90.054]
];

const DENS_BREAKS = [10, 25, 100, 500];
const DENS_COLORS = ['#e3e9f3', '#aec2de', '#6f93c5', '#33609d', '#0b1f3a'];
const densColor = d => DENS_COLORS[DENS_BREAKS.filter(b => d >= b).length];
const CLIMA_GROUPS = [
  ['Cálido', '#2f8a4a', t => /^A/.test(t)],
  ['Semicálido', '#9cbf4a', t => /^\(A\)C/.test(t)],
  ['Templado', '#3d8c9a', t => /^C(?!b'|c)/.test(t)],
  ['Semifrío y frío', '#7383c2', t => /^(Cb'|Cc|E)/.test(t)],
  ['Árido y semiárido', '#d6b36a', t => /^BS/.test(t)],
  ['Muy árido', '#c6763f', t => /^BW/.test(t)]
];
const climaGroup = t => CLIMA_GROUPS.find(g => g[2](String(t || ''))) || ['Sin clasificar', '#9aa3ad'];
const testMeta = o => ({ cat: 'Capa de referencia', estatus: 'Referencia', tipo: 'Vector · Polígonos', escala: '—', palabras: [], access: 'Público', ...o });
const DATA = `${import.meta.env.BASE_URL}data/`;

/* style(p) recibe los atributos de la entidad y devuelve el estilo; zIndex fija el orden de dibujo */
export const DATASETS = [
  {
    id: 'qgisMunicipios', name: 'Municipios de Quintana Roo (2015)', url: `${DATA}municipios_qroo_2015.geojson`, visible: false, zIndex: 404, label: 'MUNICIPIO',
    sym: { t: 'ramp', ramp: DENS_COLORS },
    style: p => ({ color: '#ffffff', weight: 1.2, opacity: 1, fillColor: densColor(+p.DEN || 0), fillOpacity: 0.78 }),
    tip: p => `${p.MUNICIPIO} · ${fmtNum(p['POBLACIÓN'])} hab · ${fmtNum(p.DEN, 1)} hab/km²`,
    legend: { title: 'Densidad de población, hab/km² (campo DEN)', items: DENS_COLORS.map((c, i) => [c, i === 0 ? `Menos de ${DENS_BREAKS[0]}` : i === DENS_BREAKS.length ? `${DENS_BREAKS[i - 1]} o más` : `${DENS_BREAKS[i - 1]} a ${DENS_BREAKS[i]}`]) },
    meta: testMeta({
      id: 'QROO-2015', temas: 'División municipal · Población',
      resumen: 'Límites de los 11 municipios de Quintana Roo con población, superficie y densidad.',
      pub: '', act: '', res: 'Simplificado a ~40 m para la web', crs: 'Original EPSG:32616 (WGS 84 / UTM 16N) · se muestra en WGS 84',
      bbox: [17.81, 21.61, -89.42, -86.71], formato: 'Shapefile → GeoJSON', tam: '951 KB (SHP original)', lic: 'Por documentar',
      resp: 'Por documentar', fuente: 'Por documentar (cartografía regional)',
      linaje: '11_municipios_2015_v1.shp reproyectado de UTM 16N a WGS 84 y simplificado (Douglas-Peucker 0.0004°): 59 269 → 13 423 vértices.'
    })
  },
  {
    id: 'qgisEntidades', name: 'Entidades federativas', url: `${DATA}mexico_entidades.geojson`, visible: false, zIndex: 406, label: 'NOM_ENT',
    sym: { t: 'poly', c: '#0b1f3a', f: 'transparent' },
    style: () => ({ color: '#0b1f3a', weight: 1.1, opacity: 0.8, fillColor: '#0b1f3a', fillOpacity: 0 }),
    tip: p => `${p.NOM_ENT} · ${fmtNum(p['áreakm2'])} km²`,
    meta: testMeta({
      id: 'MEX-ENT', temas: 'División estatal',
      resumen: 'Límites de las 32 entidades federativas con superficie y división territorial.',
      pub: '', act: '', res: 'Simplificado a ~400 m para la web', crs: 'EPSG:4326 (WGS 84)',
      bbox: [14.53, 32.72, -118.37, -86.71], formato: 'Shapefile → GeoJSON', tam: '10.7 MB (SHP original)', lic: 'Por documentar',
      resp: 'Por documentar', fuente: 'Por documentar (cartografía nacional)',
      linaje: 'mexico.shp simplificado (Douglas-Peucker 0.004°): 686 147 → 31 428 vértices. Las islas pequeñas se conservan sin simplificar.'
    })
  },
  {
    id: 'qgisClimas', name: 'Climas de México (Köppen-García)', url: `${DATA}climas_conabio_1m.geojson`, visible: false, zIndex: 402, label: 'CLIMA_TIPO',
    sym: { t: 'ramp', ramp: CLIMA_GROUPS.map(g => g[1]) },
    style: p => ({ color: '#ffffff', weight: 0.4, opacity: 0.8, fillColor: climaGroup(p.CLIMA_TIPO)[1], fillOpacity: 0.62 }),
    tip: p => `${p.CLIMA_TIPO} · ${climaGroup(p.CLIMA_TIPO)[0]}`,
    legend: { title: 'Grupo climático, agrupado a partir del campo CLIMA_TIPO', items: CLIMA_GROUPS.map(g => [g[1], g[0]]) },
    meta: testMeta({
      id: 'REF-CONABIO-CLIMAS', temas: 'Clima · Clasificación de Köppen modificada por García',
      resumen: 'Tipos de clima de la República Mexicana según la clasificación de Köppen modificada por García, escala 1:1 000 000.',
      pub: '2001-05-11', act: '2001-05-11', res: 'Escala 1:1 000 000 · simplificado a ~600 m para la web', crs: 'EPSG:4326 (WGS 84)',
      bbox: [14.54, 32.72, -118.4, -86.71], formato: 'Shapefile → GeoJSON', tam: '17.9 MB (SHP original)', lic: 'CC BY-NC 2.5 MX (citar a CONABIO)',
      escala: '1:1 000 000', resp: 'CONABIO', fuente: 'García, E. (1998). Climas, escala 1:1 000 000. CONABIO.',
      linaje: 'clima1mgw.shp simplificado (Douglas-Peucker 0.006°): 1 114 341 → 72 235 vértices, 1 182 polígonos. Textos del DBF recodificados.'
    })
  }
];
