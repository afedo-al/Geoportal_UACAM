/* Lee los metadatos que traen los propios archivos y los convierte en campos del estudio.
   Formatos: FGDC y ESRI/ArcGIS (.shp.xml, .xml), ISO 19139, KML, GPX, GeoJSON y propiedades de Excel.
   Reglas: solo se toma lo que el archivo declara. Los textos de plantilla sin llenar («REQUIRED: …»),
   los valores vacíos o «No conocido» y las fechas 00000000 se ignoran; nada se rellena por suposición.
   Se ejecuta en la página (necesita DOMParser). El XML nunca se interpreta con entidades ni DOCTYPE. */
import { THEMES } from './study-fields.js';

const MAX_XML = 2 * 1024 * 1024;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;
const EMPTY = /^(?:(?:required|optional)\s*:.*|dataset copied\.?|no conocido|unknown|n\/a|none|sin informaci[oó]n|0+)$/i;

/* Texto limpio de una sola línea; '' si está vacío o es texto de plantilla */
export function clean(value, max = 2000) {
  const s = String(value ?? '').replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  return !s || EMPTY.test(s) ? '' : s.slice(0, max);
}

/* Algunos metadatos guardan HTML escapado (ESRI): se lee como texto en un documento inerte */
function htmlText(value) {
  const s = String(value ?? '');
  if (!/[<&]/.test(s)) return clean(s);
  const body = new DOMParser().parseFromString(s, 'text/html').body;
  body.querySelectorAll('script,style').forEach(n => n.remove());
  return clean(body.textContent);
}

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* Búsqueda por nombre local, sin importar el espacio de nombres: cadena de descendientes */
const byName = (n, name) => [...n.getElementsByTagNameNS('*', name)];
const chain = (n, ...names) => names.reduce((nodes, nm) => nodes.flatMap(x => byName(x, nm)), [n]);
const texts = (n, ...names) => chain(n, ...names).map(x => clean(x.textContent)).filter(Boolean);
const text1 = (n, ...names) => texts(n, ...names)[0] || '';
const kids = (el, name) => [...el.children].filter(c => c.localName === name);
const uniq = list => [...new Set(list)];

/* ---------- normalizaciones ---------- */
/* Solo fechas completas: «2001» o «1995 - 1997» no se convierten en una fecha inventada */
export function isoDate(value) {
  const s = String(value || '').trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:$|[T\s])/.exec(s);
  if (!m) return '';
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function normalizeLicense(...parts) {
  const t = norm(parts.join(' ')).replace(/[_\s]+/g, ' ');
  if (/cc by[ -]nc 2\.5 mx|by-nc\/2\.5\/mx/.test(t)) return 'CC BY-NC 2.5 MX';
  if (/cc by[ -]nc 4\.0|by-nc\/4\.0/.test(t)) return 'CC BY-NC 4.0';
  if (/cc by 4\.0|licenses\/by\/4\.0/.test(t)) return 'CC BY 4.0';
  return '';
}

export function normalizeAccess(...parts) {
  const t = norm(parts.join(' '));
  if (/restring|confidencial|reservad|interno|internal|private|privad/.test(t) && !/sin restricci|no restrict/.test(t)) return 'Interna';
  if (/\bpublic[oa]?\b|sin restricci|no restrictions|libre/.test(t)) return 'Pública';
  return '';
}

const THEME_RULES = [
  [/\bclima|climat|meteorolog|precipitaci|\btemperatura/, 'Clima'],
  [/hidrolog|\bcuenca|\brios?\b|acuifer|\bagua\b|aguas subterraneas|laguna|humedal/, 'Hidrología'],
  [/\bsuelos?\b|edafolog/, 'Suelos'],
  [/\briesgos?\b|\bpeligros?\b|inundaci|huracan|sismic|vulnerab/, 'Riesgos'],
  [/vegetaci|forestal|\bselva|manglar|cobertura/, 'Vegetación'],
  [/topograf|relieve|elevaci|altimetr|curvas de nivel|modelo digital/, 'Topografía'],
  [/\bfauna\b|\bespecies?\b|mamifer|\baves\b|biodiversidad/, 'Fauna'],
  [/municip|entidad|estatal|division|\blimites?\b|localidad|\bageb/, 'División territorial'],
  [/levantamiento|\bgps\b|\bmuestreo/, 'Levantamiento de campo']
];
/* Sugerencia a partir de título y palabras clave (y, si no basta, de la descripción). Siempre se marca como sugerida. */
export function suggestTheme(primary, secondary = '') {
  for (const text of [norm(primary), norm(secondary)]) {
    if (!text) continue;
    const hit = THEME_RULES.find(([re]) => re.test(text));
    if (hit && THEMES.includes(hit[1])) return hit[1];
  }
  return '';
}

/* Claves de campo habituales (INEGI, CONABIO, levantamientos) que delatan el tema aunque el nombre no lo diga */
const FIELD_RULES = [
  [/\b(cve ?mun|nom ?mun|cvegeo|cve ?ent|nom ?ent|cve ?loc|nom ?loc|cve ?ageb)\b/, 'División territorial'],
  [/\b(precip|temp ?med|tmax|tmin|clave ?clim|tipo ?clim)/, 'Clima'],
  [/\b(cuenca|subcuenca|corriente|cauce|caudal|acuifero)/, 'Hidrología'],
  [/\b(edafo|tipo ?suelo|grupo ?suelo|wrb)/, 'Suelos'],
  [/\b(especie|nombre ?cientifico|nom ?cient|genero|familia|taxon)/, 'Fauna'],
  [/\b(cobertura|uso ?suelo|usv|tipo ?veg|comunidad ?veg)/, 'Vegetación'],
  [/\b(elev|altitud|cota|msnm|pendiente)/, 'Topografía'],
  [/\b(peligro|riesgo|vulnerab|inunda)/, 'Riesgos']
];
const words = s => norm(String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2')).replace(/[_\-.]+/g, ' ');
/* Tema sugerido para una capa sin metadatos: primero por su nombre, luego por los nombres de sus campos */
export function themeFromLayer(layerName, fieldNames = []) {
  const byName = suggestTheme(words(layerName));
  if (byName) return byName;
  const fields = fieldNames.map(words).join(' ');
  const hit = FIELD_RULES.find(([re]) => re.test(fields));
  if (hit && THEMES.includes(hit[1])) return hit[1];
  return suggestTheme(fields);
}

const humanize = t => (/\s/.test(t) || !t.includes('_') ? t : t.replace(/_+/g, ' ').trim());
const scaleText = n => (/^\d{4,}$/.test(n) ? `1:${n.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}` : '');

/* Une las piezas leídas en el resultado que consume applyInfo */
function build(source, p) {
  const keywords = uniq((p.keywords || []).map(k => clean(k, 80)).filter(Boolean).filter((k, i, a) => a.findIndex(x => x.toLowerCase() === k.toLowerCase()) === i));
  const license = normalizeLicense(p.licenseKey, p.licenseText);
  const access = normalizeAccess(p.accessKey, p.accessText);
  const theme = suggestTheme([p.title, keywords.join(' ')].join(' '), p.desc);
  const extras = [...(p.extras || [])];
  if (!license && clean(p.licenseText)) extras.push(['Condiciones de uso declaradas', clean(p.licenseText, 700)]);
  const fields = {
    sTitle: p.title ? humanize(p.title) : '', sTheme: theme, sDate: isoDate(p.date), sResp: p.resp || '', sSource: p.source || '',
    sLic: license, sAccess: access, sDesc: p.desc || '', sLineage: p.lineage || '', sKeywords: keywords.join(', ')
  };
  return { source, fields, suggested: theme ? ['sTheme'] : [], extras, scale: p.scale || '' };
}

/* ---------- XML de metadatos (sidecar de un Shapefile o de cualquier capa) ---------- */
export function parseMetadataXML(text, fileName = 'metadatos.xml') {
  if (String(text).length > MAX_XML) return { error: 'El archivo de metadatos es demasiado grande (máximo 2 MB).' };
  const t = String(text).replace(/<!--[\s\S]*?-->/g, '');
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(t)) return { error: 'El XML de metadatos declara DOCTYPE, entidades u hoja de estilo: se ignora por seguridad.' };
  const doc = new DOMParser().parseFromString(t, 'application/xml');
  if (doc.querySelector('parsererror')) return { error: 'El XML de metadatos está mal formado.' };
  const root = doc.documentElement;
  const name = (root.localName || '').toLowerCase();
  let info = null;
  if (name === 'md_metadata' || name === 'mi_metadata') info = fromIso(root, fileName);
  else if (name === 'metadata' && (byName(root, 'idinfo').length || byName(root, 'dataIdInfo').length)) info = fromFgdc(root, fileName);
  if (!info) return { error: 'No se reconoció el formato de metadatos (se esperaba FGDC, ESRI o ISO 19139).' };
  return { info };
}

function fromFgdc(root, file) {
  const themes = chain(root, 'idinfo', 'keywords', 'theme').map(th => ({ kt: text1(th, 'themekt'), keys: texts(th, 'themekey') }));
  const ownKt = kt => !/^(CNB\.|ESTRUCTURA$)/i.test(kt);
  const keyOf = re => themes.find(t => re.test(t.kt))?.keys[0] || '';
  const places = texts(root, 'idinfo', 'keywords', 'place', 'placekey');
  const org = text1(root, 'idinfo', 'ptcontac', 'cntorg') || text1(root, 'distinfo', 'distrib', 'cntorg') || text1(root, 'metainfo', 'metc', 'cntorg');
  const proc = uniq(texts(root, 'dataqual', 'lineage', 'procstep', 'procdesc'));
  const src = uniq(texts(root, 'dataqual', 'lineage', 'srcinfo', 'srccontr'));
  let lineage = [proc.length ? `Procesamiento: ${proc.join('; ')}` : '', src.length ? `Fuentes: ${src.join(' ')}` : ''].filter(Boolean).join('. ');
  /* ESRI guarda el historial de geoprocesos con rutas del equipo del autor: solo se resume su alcance */
  const esri = byName(root, 'Process').map(p => ({ d: isoDate(p.getAttribute('Date')) })).filter(p => p.d);
  if (esri.length) {
    const ds = esri.map(p => p.d).sort();
    lineage = [lineage, `Historial de ArcGIS: ${esri.length} ${esri.length === 1 ? 'proceso registrado' : 'procesos registrados'} (${ds[0] === ds.at(-1) ? ds[0] : `de ${ds[0]} a ${ds.at(-1)}`}). Las rutas y herramientas no se importan.`].filter(Boolean).join('. ');
  }
  const abstract = text1(root, 'idinfo', 'descript', 'abstract') || htmlText(text1(root, 'dataIdInfo', 'idAbs'));
  const purpose = text1(root, 'idinfo', 'descript', 'purpose') || htmlText(text1(root, 'dataIdInfo', 'idPurp'));
  const extras = [];
  const current = text1(root, 'idinfo', 'timeperd', 'current');
  if (current) extras.push(['Periodo de los datos', current]);
  const pub = text1(root, 'idinfo', 'citation', 'citeinfo', 'pubdate');
  if (pub && !isoDate(pub)) extras.push(['Fecha declarada', pub]);
  return build(`FGDC · ${file}`, {
    title: text1(root, 'idinfo', 'citation', 'citeinfo', 'title') || text1(root, 'dataIdInfo', 'idCitation', 'resTitle'),
    source: text1(root, 'idinfo', 'citation', 'citeinfo', 'origin') || text1(root, 'dataIdInfo', 'idCredit'),
    date: pub, resp: org,
    desc: [abstract, purpose && purpose !== abstract ? `Propósito: ${purpose}` : ''].filter(Boolean).join(' '),
    lineage, scale: scaleText(text1(root, 'idinfo', 'citation', 'citeinfo', 'othercit')),
    keywords: [...themes.filter(t => ownKt(t.kt)).flatMap(t => t.keys), ...places],
    licenseKey: keyOf(/CNB\.LICENCIA/i), licenseText: text1(root, 'idinfo', 'useconst'),
    accessKey: keyOf(/CNB\.ACCESO/i), accessText: text1(root, 'idinfo', 'accconst'), extras
  });
}

function fromIso(root, file) {
  const ident = chain(root, 'identificationInfo')[0];
  if (!ident) return null;
  const org = text1(ident, 'pointOfContact', 'organisationName', 'CharacterString') || text1(root, 'contact', 'organisationName', 'CharacterString');
  const person = text1(ident, 'pointOfContact', 'individualName', 'CharacterString');
  const dates = chain(ident, 'citation', 'CI_Date').map(d => ({ type: text1(d, 'dateType', 'CI_DateTypeCode') || chain(d, 'dateType')[0]?.textContent || '', v: text1(d, 'date', 'Date') || text1(d, 'date', 'DateTime') }));
  const pickDate = dates.find(d => /publication/i.test(d.type))?.v || dates[0]?.v || '';
  const kw = chain(ident, 'descriptiveKeywords', 'keyword').map(k => clean(k.textContent)).filter(Boolean);
  const limits = texts(ident, 'resourceConstraints', 'useLimitation', 'CharacterString');
  const other = texts(ident, 'resourceConstraints', 'otherConstraints', 'CharacterString');
  const access = texts(ident, 'resourceConstraints', 'accessConstraints', 'MD_RestrictionCode').join(' ');
  const abstract = text1(ident, 'abstract', 'CharacterString');
  const purpose = text1(ident, 'purpose', 'CharacterString');
  const denom = text1(ident, 'equivalentScale', 'denominator', 'Integer');
  return build(`ISO 19139 · ${file}`, {
    title: text1(ident, 'citation', 'title', 'CharacterString'), source: text1(ident, 'credit', 'CharacterString'),
    date: pickDate, resp: org || person,
    desc: [abstract, purpose && purpose !== abstract ? `Propósito: ${purpose}` : ''].filter(Boolean).join(' '),
    lineage: text1(root, 'dataQualityInfo', 'lineage', 'statement', 'CharacterString'), scale: scaleText(denom), keywords: kw,
    licenseText: [...limits, ...other].join(' '), accessText: [access, ...other].join(' ')
  });
}

/* ---------- formatos con metadatos propios ---------- */
export function fromKml(doc, file = 'archivo KML') {
  const d = byName(doc, 'Document')[0];
  if (!d) return null;
  const name = clean(kids(d, 'name')[0]?.textContent);
  const title = name && !/\.kml$/i.test(name) && !/^doc$/i.test(name) ? name : '';
  const author = clean(byName(d, 'author').map(a => kids(a, 'name')[0]?.textContent)[0]);
  const desc = htmlText(kids(d, 'description')[0]?.textContent);
  if (!title && !author && !desc) return null;
  return build(`KML · ${file}`, { title, resp: author, desc });
}

export function fromGpx(doc, file = 'archivo GPX') {
  const root = doc.documentElement;
  const meta = kids(root, 'metadata')[0] || root;
  const get = n => clean(kids(meta, n)[0]?.textContent);
  const author = clean(kids(kids(meta, 'author')[0] || meta, 'name')[0]?.textContent) || (kids(meta, 'author')[0] && !kids(kids(meta, 'author')[0], 'name').length ? clean(kids(meta, 'author')[0].textContent) : '');
  const copyright = kids(meta, 'copyright')[0];
  const title = get('name');
  const desc = get('desc');
  const keywords = get('keywords').split(',');
  const licenseText = clean(kids(copyright || meta, 'license')[0]?.textContent);
  if (!title && !desc && !author && !licenseText) return null;
  return build(`GPX · ${file}`, { title, desc, resp: author || clean(copyright?.getAttribute('author')), date: get('time'), keywords, licenseText });
}

/* top: miembros de primer nivel del GeoJSON que el lector dejó como texto */
export function fromGeoJSON(top, layerName = '', file = 'archivo GeoJSON') {
  if (!top) return null;
  const title = clean(top.title) || (clean(top.name) && norm(top.name).replace(/[\s_-]+/g, '') !== norm(layerName).replace(/[\s_-]+/g, '') ? clean(top.name) : '');
  const keywords = String(top.keywords || '').split(',');
  const p = { title, desc: clean(top.description), resp: clean(top.author) || clean(top.attribution), source: clean(top.source), date: clean(top.date) || clean(top.created), licenseText: clean(top.license), keywords };
  if (!p.title && !p.desc && !p.resp && !p.source && !p.date && !p.licenseText) return null;
  return build(`GeoJSON · ${file}`, p);
}

/* props: propiedades del documento de SheetJS (wb.Props) */
export function fromOffice(props, file = 'libro de Excel') {
  if (!props) return null;
  const keywords = String(props.Keywords || '').split(/[,;]/);
  const p = { title: clean(props.Title), desc: clean(props.Comments), resp: clean(props.Company) || clean(props.Author), keywords: [...keywords, clean(props.Subject), clean(props.Category)] };
  if (!p.title && !p.desc && !p.resp && !p.keywords.some(clean)) return null;
  return build(`Excel · ${file}`, p);
}

/* Resumen legible de lo que se leyó, para el aviso de validación */
export function summarize(fields, labels) {
  return Object.keys(fields).filter(k => fields[k]).map(k => labels[k]).filter(Boolean).join(', ').toLowerCase();
}
