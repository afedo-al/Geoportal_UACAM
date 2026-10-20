/* ==============================================================
   VERIFICACIÓN ESTRUCTURAL DE ARCHIVOS
   Comprueba que cada archivo sea realmente del formato que dice ser,
   leyendo su estructura interna (no solo la extensión ni los primeros
   bytes). Cada verificador devuelve una lista de comprobaciones
   [estado, título, detalle] con estado ok | info | warn | err.
   Es una primera barrera en el navegador; el servidor debe repetir la
   validación (GDAL/OGR, antivirus y cuarentena) antes de publicar.
   ============================================================== */
export const FileCheck = (() => {
  const LIMITS = { maxItems: 60, maxBatchBytes: 400 * 1024 * 1024, maxZipEntries: 300, maxNameLength: 180, maxPrjBytes: 20 * 1024 };
  const EXECUTABLE_EXT = /\.(exe|dll|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|mjs|wsf|wsh|hta|msi|msp|scr|jar|sh|bash|php\d?|phtml|asp|aspx|jsp|py|pl|rb|html?|xhtml|svg|lnk|reg|apk|app|dmg|iso)$/i;
  const ARCHIVE_EXT = /\.(zip|kmz|rar|7z|gz|tgz|bz2|xz|tar|cab)$/i;

  const u8 = (buf, start = 0, len) => new Uint8Array(buf, start, len === undefined ? buf.byteLength - start : Math.max(0, Math.min(len, buf.byteLength - start)));
  const ascii = (buf, start, len) => String.fromCharCode(...u8(buf, start, len));

  /* ---------- firmas de contenido ---------- */
  function signature(buf) {
    const b = u8(buf, 0, 16);
    if (buf.byteLength === 0) return 'empty';
    if (b[0] === 0x4d && b[1] === 0x5a) return 'exe';
    if (b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return 'elf';
    if (b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbe) return 'macho';
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
    if (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21) return 'rar';
    if (b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf) return '7z';
    if (b[0] === 0x1f && b[1] === 0x8b) return 'gzip';
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip';
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x05 && b[3] === 0x06) return 'zip-empty';
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole';
    if (ascii(buf, 0, 15) === 'SQLite format 3') return 'sqlite';
    if ((b[0] === 0x49 && b[1] === 0x49 && (b[2] === 0x2a || b[2] === 0x2b) && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && (b[3] === 0x2a || b[3] === 0x2b))) return 'tiff';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') return 'webp';
    if (buf.byteLength >= 4 && new DataView(buf).getInt32(0, false) === 9994) return 'shp';
    const head = new TextDecoder().decode(u8(buf, 0, 4096)).replace(/^﻿/, '').trimStart();
    const low = head.slice(0, 600).toLowerCase();
    if (low.startsWith('#!')) return 'script';
    if (/^<(!doctype html|html|head|body|script|svg)\b/.test(low) || /<script[\s>]/.test(low)) return 'html';
    if (low.startsWith('{') || low.startsWith('[')) return 'json';
    if (low.startsWith('<')) return /<kml[\s>]/.test(low) ? 'kml' : /<gpx[\s>]/.test(low) ? 'gpx' : 'xml';
    return hasBinary(buf) ? 'binary' : 'text';
  }
  const SIGNATURE_LABEL = {
    empty: 'un archivo vacío', exe: 'un programa ejecutable de Windows', elf: 'un programa ejecutable de Linux', macho: 'un programa ejecutable de macOS',
    pdf: 'un PDF', rar: 'un archivo RAR', '7z': 'un archivo 7-Zip', gzip: 'un archivo GZIP', zip: 'un ZIP', 'zip-empty': 'un ZIP vacío', ole: 'un documento de Office antiguo (OLE)',
    sqlite: 'una base de datos SQLite', tiff: 'una imagen TIFF', png: 'una imagen PNG', jpeg: 'una imagen JPEG', webp: 'una imagen WebP',
    shp: 'un Shapefile', script: 'un script de comandos', html: 'una página HTML o SVG con código', json: 'JSON', kml: 'KML', gpx: 'GPX', xml: 'XML', text: 'texto', binary: 'datos binarios'
  };
  const DANGEROUS = new Set(['exe', 'elf', 'macho', 'script', 'html']);

  function hasBinary(buf, limit = 65536) {
    const b = u8(buf, 0, limit);
    let ctl = 0;
    for (let i = 0; i < b.length; i++) {
      const c = b[i];
      if (c === 0) return true;
      if (c < 9 || (c > 13 && c < 32)) ctl++;
    }
    return b.length > 0 && ctl / b.length > 0.01;
  }

  /* ---------- nombres de archivo ---------- */
  function checkName(name) {
    const out = [];
    if (/[\u0000-\u001f\u007f]/.test(name)) out.push(['err', 'Nombre de archivo con caracteres de control', 'Renombra el archivo usando solo letras, números, guiones y puntos.']);
    if (/[\\/]/.test(name)) out.push(['err', 'El nombre contiene una ruta', 'Se rechaza por seguridad.']);
    if (name.length > LIMITS.maxNameLength) out.push(['err', 'Nombre de archivo demasiado largo', `Máximo ${LIMITS.maxNameLength} caracteres.`]);
    if (/^\./.test(name)) out.push(['err', 'Archivo oculto', 'Los nombres que empiezan con punto no se admiten.']);
    const parts = name.split('.');
    if (parts.length > 2) {
      const inner = parts.slice(1, -1).map(p => `.${p}`);
      const bad = inner.find(p => EXECUTABLE_EXT.test(p));
      if (bad) out.push(['err', `Doble extensión sospechosa (${bad})`, 'El nombre combina una extensión ejecutable con una geográfica. Se rechaza por seguridad.']);
    }
    if (/[‪-‮⁦-⁩]/.test(name)) out.push(['err', 'Nombre con caracteres de dirección de texto', 'Se usan para disfrazar extensiones. Renombra el archivo.']);
    return out;
  }

  /* ---------- huella SHA-256 ---------- */
  async function sha256(buf) {
    if (!crypto?.subtle) return null;
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- Shapefile (.shp / .shx) ---------- */
  const SHP_TYPES = new Set([0, 1, 3, 5, 8, 11, 13, 15, 18, 21, 23, 25, 28, 31]);
  function checkSHP(buf) {
    const out = [];
    if (buf.byteLength < 100) return [['err', 'El .shp está truncado', 'Tiene menos de 100 bytes, el tamaño mínimo de la cabecera.']];
    const dv = new DataView(buf);
    if (dv.getInt32(0, false) !== 9994) return [['err', 'El .shp no tiene la firma de un Shapefile', 'Los primeros bytes deben ser el código 9994.']];
    if (dv.getInt32(28, true) !== 1000) out.push(['err', 'Versión de Shapefile no válida', `Se esperaba la versión 1000 y el archivo declara ${dv.getInt32(28, true)}.`]);
    const declared = dv.getInt32(24, false) * 2;
    if (declared !== buf.byteLength) out.push(['err', 'El tamaño del .shp no coincide con su cabecera', `La cabecera declara ${declared.toLocaleString('es-MX')} bytes y el archivo tiene ${buf.byteLength.toLocaleString('es-MX')}: está truncado o alterado.`]);
    const type = dv.getInt32(32, true);
    if (!SHP_TYPES.has(type) || type === 31) out.push(['err', 'Tipo de geometría no admitido', `Código ${type}. Se admiten puntos, líneas, polígonos y multipuntos.`]);
    const box = [36, 44, 52, 60].map(o => dv.getFloat64(o, true));
    if (!box.every(Number.isFinite) || box[0] > box[2] || box[1] > box[3]) out.push(['err', 'Extensión de la cabecera no válida', 'Los límites del .shp no son números coherentes.']);
    let p = 100, n = 0, mism = 0, badLen = 0;
    while (p + 8 <= buf.byteLength) {
      const num = dv.getInt32(p, false), len = dv.getInt32(p + 4, false) * 2;
      if (num !== n + 1) { out.push(['err', 'Registros del .shp desordenados', `Se esperaba el registro ${n + 1} y apareció el ${num}.`]); break; }
      if (len < 4 || p + 8 + len > buf.byteLength) { badLen++; break; }
      const st = dv.getInt32(p + 8, true);
      if (st !== 0 && st !== type) mism++;
      n++; p += 8 + len;
    }
    if (badLen) out.push(['err', 'Un registro del .shp sale del archivo', `El registro ${n + 1} declara un tamaño mayor al disponible.`]);
    if (mism) out.push(['err', `${mism} registros con un tipo distinto al declarado`, 'Un Shapefile solo puede contener un tipo de geometría.']);
    if (!out.some(c => c[0] === 'err')) out.push(['ok', 'Estructura del .shp íntegra', `Versión 1000 · ${n.toLocaleString('es-MX')} registros · tamaño consistente`]);
    return out;
  }

  function checkSHX(shx, shp) {
    if (shx.byteLength < 100) return [['err', 'El .shx está truncado']];
    const dv = new DataView(shx);
    if (dv.getInt32(0, false) !== 9994) return [['err', 'El .shx no tiene la firma de un Shapefile', 'No corresponde a un índice de Shapefile.']];
    if (dv.getInt32(24, false) * 2 !== shx.byteLength || (shx.byteLength - 100) % 8) return [['err', 'El tamaño del .shx no coincide con su cabecera', 'El índice está truncado o alterado.']];
    if (shp && new DataView(shp).getInt32(32, true) !== dv.getInt32(32, true)) return [['err', 'El .shx es de otro Shapefile', 'Declara un tipo de geometría distinto al del .shp.']];
    if (shp) {
      const sv = new DataView(shp);
      const count = (shx.byteLength - 100) / 8;
      for (let i = 0; i < count; i++) {
        const off = dv.getInt32(100 + i * 8, false) * 2;
        if (off + 8 > shp.byteLength || sv.getInt32(off, false) !== i + 1) return [['err', 'El .shx no apunta a los registros del .shp', `La entrada ${i + 1} no coincide: los archivos no son del mismo conjunto.`]];
      }
    }
    return [['ok', 'Índice .shx consistente con el .shp']];
  }

  /* ---------- dBASE (.dbf) ---------- */
  const DBF_VERSIONS = new Set([0x02, 0x03, 0x04, 0x05, 0x30, 0x31, 0x32, 0x43, 0x63, 0x83, 0x8b, 0x8e, 0xcb, 0xf5, 0xfb]);
  const DBF_TYPES = new Set(['C', 'N', 'F', 'L', 'D', 'M', 'I', 'B', 'O', '@', '+', 'Y', 'T', 'V']);
  /* Un .dbf real tiene bytes binarios en la cabecera; un CSV renombrado es texto plano de principio a fin */
  const FileCheckText = buf => buf.byteLength < 32 || /^[\x09\x0a\x0d\x20-\x7e]+$/.test(String.fromCharCode(...u8(buf, 0, 32)));
  function checkDBF(buf) {
    if (!buf.byteLength) return [['err', 'El .dbf está vacío']];
    const dv = new DataView(buf);
    const out = [];
    const ver = dv.getUint8(0);
    if (!DBF_VERSIONS.has(ver) || FileCheckText(buf)) return [['err', 'El .dbf no es una tabla dBASE', `Byte de versión 0x${ver.toString(16)} no reconocido: el contenido no corresponde a un .dbf.`]];
    if (buf.byteLength < 33) return [['err', 'El .dbf está truncado']];
    const n = dv.getUint32(4, true), hlen = dv.getUint16(8, true), rlen = dv.getUint16(10, true);
    if (hlen < 33 || hlen > buf.byteLength || rlen < 1) return [['err', 'Cabecera del .dbf no válida', 'La longitud de cabecera o de registro no es coherente con el archivo.']];
    let p = 32, sum = 1, fields = 0, terminated = false;
    while (p < hlen) {
      if (dv.getUint8(p) === 0x0d) { terminated = true; break; }
      const t = String.fromCharCode(dv.getUint8(p + 11));
      if (!DBF_TYPES.has(t)) return [['err', 'Tipo de campo no válido en el .dbf', `Campo ${fields + 1} con tipo «${t}».`]];
      sum += dv.getUint8(p + 16); fields++; p += 32;
    }
    if (!terminated) out.push(['err', 'Cabecera del .dbf sin terminador', 'Falta el byte 0x0D que cierra la definición de campos.']);
    if (sum !== rlen) out.push(['err', 'Longitud de registro inconsistente', `Los campos suman ${sum} bytes y la cabecera declara ${rlen}.`]);
    const need = hlen + n * rlen;
    if (buf.byteLength < need) out.push(['err', 'El .dbf está truncado', `Declara ${n.toLocaleString('es-MX')} registros pero faltan ${(need - buf.byteLength).toLocaleString('es-MX')} bytes.`]);
    else if (buf.byteLength > need + 1) out.push(['warn', 'Datos sobrantes al final del .dbf', 'Se ignoran.']);
    if (!out.some(c => c[0] === 'err')) out.push(['ok', 'Estructura del .dbf íntegra', `${fields} campos · ${n.toLocaleString('es-MX')} registros`]);
    return out;
  }

  function checkPRJ(buf) {
    if (buf.byteLength > LIMITS.maxPrjBytes) return [['err', 'El .prj es demasiado grande', 'Un .prj es un texto WKT corto.']];
    if (hasBinary(buf)) return [['err', 'El .prj no es texto', 'Contiene datos binarios: no es una definición de sistema de referencia.']];
    const t = new TextDecoder().decode(buf).trim();
    if (!/^(PROJCS|GEOGCS|GEOCCS|COMPD_CS|PROJCRS|GEOGCRS|GEODCRS|COMPOUNDCRS|BOUNDCRS)\s*\[/i.test(t)) return [['err', 'El .prj no contiene un WKT válido', 'Debe empezar con PROJCS[ o GEOGCS[.']];
    let depth = 0;
    for (const ch of t) { if (ch === '[') depth++; else if (ch === ']') depth--; if (depth < 0) break; }
    if (depth !== 0) return [['err', 'El WKT del .prj está incompleto', 'Los corchetes no están balanceados.']];
    return [];
  }

  /* ---------- GeoPackage / GeoTIFF / Office ---------- */
  function checkGPKG(buf) {
    if (buf.byteLength < 100) return [['err', 'El GeoPackage está truncado']];
    const dv = new DataView(buf);
    const app = dv.getUint32(68, false);
    const tag = String.fromCharCode(app >>> 24, (app >>> 16) & 255, (app >>> 8) & 255, app & 255);
    if (!['GPKG', 'GP10', 'GP11'].includes(tag)) return [['err', 'Es una base SQLite, pero no un GeoPackage', `El identificador de aplicación es «${tag.replace(/[^\x20-\x7e]/g, '?')}» y debe ser «GPKG». Otras bases de datos no se admiten.`]];
    const page = dv.getUint16(16, false);
    if (!(page === 1 || (page >= 512 && page <= 32768 && (page & (page - 1)) === 0))) return [['err', 'Cabecera SQLite no válida', 'El tamaño de página no es válido.']];
    const ver = dv.getUint32(60, false);
    return [['ok', 'GeoPackage auténtico', `Identificador ${tag}${ver ? ` · versión ${Math.floor(ver / 10000)}.${Math.floor(ver / 100) % 100}` : ''}`]];
  }

  function checkTIFF(buf) {
    const dv = new DataView(buf);
    const le = dv.getUint8(0) === 0x49;
    const magic = dv.getUint16(2, le);
    if (magic === 43) return [['info', 'BigTIFF', 'Se valida en el servidor con GDAL.']];
    if (magic !== 42) return [['err', 'Cabecera TIFF no válida']];
    const ifd = dv.getUint32(4, le);
    if (ifd < 8 || ifd + 2 > buf.byteLength) return [['err', 'El TIFF está truncado', 'El directorio de imagen apunta fuera del archivo.']];
    const n = dv.getUint16(ifd, le);
    if (ifd + 2 + n * 12 > buf.byteLength) return [['err', 'El TIFF está truncado']];
    const tags = new Set();
    for (let i = 0; i < n; i++) tags.add(dv.getUint16(ifd + 2 + i * 12, le));
    const geo = [33550, 33922, 34264, 34735].filter(t => tags.has(t));
    if (!geo.length) return [['err', 'El TIFF no está georreferenciado', 'Es una imagen TIFF común: no tiene etiquetas GeoTIFF (GeoKeyDirectory, ModelTiepoint ni ModelTransformation).']];
    return [['ok', 'Imagen GeoTIFF georreferenciada', `${n} etiquetas · ${tags.has(34735) ? 'con GeoKeyDirectory' : 'con transformación de modelo'}`]];
  }

  function checkOfficeZip(names) {
    const set = new Set(names.map(x => x.toLowerCase()));
    if (!set.has('[content_types].xml') || !set.has('xl/workbook.xml')) return [['err', 'El ZIP no es un libro de Excel', 'Le faltan [Content_Types].xml y xl/workbook.xml.']];
    if ([...set].some(x => /vbaproject\.bin$/.test(x))) return [['err', 'El libro contiene macros', 'Los archivos con macros (VBA) no se aceptan. Guárdalo como .xlsx sin macros.']];
    const out = [['ok', 'Libro de Excel auténtico (Office Open XML)']];
    if ([...set].some(x => x.startsWith('xl/externallinks/'))) out.push(['warn', 'El libro tiene vínculos externos', 'No se siguen; solo se leen los valores almacenados.']);
    if ([...set].some(x => x.startsWith('xl/embeddings/') || x.includes('activex'))) out.push(['err', 'El libro contiene objetos incrustados o ActiveX', 'Se rechaza por seguridad.']);
    return out;
  }

  /* ---------- ZIP ---------- */
  function checkZipEntries(entries, { allowOffice = false } = {}) {
    const out = [];
    if (entries.length > LIMITS.maxZipEntries) out.push(['err', 'El ZIP tiene demasiados archivos', `${entries.length} archivos; el máximo es ${LIMITS.maxZipEntries}.`]);
    const names = entries.map(e => e.name);
    if (entries.some(e => /(^|[\\/])\.\.([\\/]|$)/.test(e.name) || /^([\\/]|[a-z]:)/i.test(e.name))) out.push(['err', 'El ZIP contiene rutas peligrosas', 'Rutas absolutas o con «..» (path traversal).']);
    if (entries.some(e => /[\u0000-\u001f\u007f]/.test(e.name))) out.push(['err', 'Nombres con caracteres de control dentro del ZIP']);
    if (entries.some(e => e.encrypted)) out.push(['err', 'El ZIP está cifrado', 'Comprime los archivos sin contraseña.']);
    if (!allowOffice) {
      const exe = names.filter(nm => EXECUTABLE_EXT.test(nm) && !/\.shp\.xml$/i.test(nm));
      if (exe.length) out.push(['err', 'El ZIP contiene archivos ejecutables o de código', exe.slice(0, 5).join(', ')]);
      const nested = names.filter(nm => ARCHIVE_EXT.test(nm));
      if (nested.length) out.push(['err', 'El ZIP contiene otros archivos comprimidos', `${nested.slice(0, 3).join(', ')}. No se admiten archivos anidados.`]);
    }
    const lower = names.map(nm => nm.toLowerCase());
    if (new Set(lower).size !== lower.length) out.push(['err', 'Nombres duplicados dentro del ZIP', 'Dos entradas con el mismo nombre pueden ocultar contenido.']);
    if (entries.some(e => e.method !== 0 && e.method !== 8)) out.push(['err', 'Método de compresión no admitido', 'Usa compresión estándar (Deflate).']);
    return out;
  }

  /* Descompresión con límite: aborta si el contenido supera lo declarado (bombas ZIP con cabeceras falsas) */
  async function inflateBounded(data, declared) {
    const limit = declared + 1;
    const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new Error('El contenido descomprimido supera el tamaño declarado en el ZIP (posible bomba ZIP).'); }
      chunks.push(value);
    }
    if (total !== declared) throw new Error('El tamaño descomprimido no coincide con el declarado: el ZIP está alterado.');
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.byteLength; }
    return out.buffer;
  }

  /* ---------- XML (KML / GPX) ---------- */
  function checkXML(text, kind) {
    const head = text.slice(0, 16384);
    if (/<!DOCTYPE/i.test(head) || /<!ENTITY/i.test(head)) return [['err', 'El XML declara DOCTYPE o entidades', 'Se rechaza por seguridad (XXE y expansión de entidades). Un KML o GPX válido no las necesita.']];
    if (/<\?xml-stylesheet/i.test(head)) return [['err', 'El XML incluye una hoja de estilo externa', 'Se rechaza por seguridad.']];
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return [['err', 'XML mal formado', 'El archivo no es un XML válido.']];
    const root = doc.documentElement;
    const name = (root.localName || '').toLowerCase();
    if (kind === 'kml' && name !== 'kml') return [['err', 'El XML no es un KML', `El elemento raíz es <${root.localName}> y debe ser <kml>.`]];
    if (kind === 'gpx' && name !== 'gpx') return [['err', 'El XML no es un GPX', `El elemento raíz es <${root.localName}> y debe ser <gpx>.`]];
    if (doc.getElementsByTagName('script').length) return [['err', 'El XML contiene elementos <script>', 'Se rechaza por seguridad.']];
    const ns = root.namespaceURI || '';
    const out = [['ok', `Estructura ${kind.toUpperCase()} válida`, ns ? `Espacio de nombres ${ns}` : 'Sin espacio de nombres declarado']];
    if (kind === 'kml' && ns && !/opengis\.net\/kml|earth\.google\.com\/kml/.test(ns)) out.push(['warn', 'Espacio de nombres KML no estándar', ns]);
    if (kind === 'gpx' && ns && !/topografix\.com\/GPX/i.test(ns)) out.push(['warn', 'Espacio de nombres GPX no estándar', ns]);
    return { checks: out, doc };
  }

  /* ---------- GeoJSON ---------- */
  const GEOM_TYPES = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']);
  function checkGeoJSON(fc) {
    let badType = 0, badCoords = 0;
    const validPos = c => Array.isArray(c) && c.length >= 2 && c.length <= 4 && c.every(v => typeof v === 'number' && Number.isFinite(v));
    const depth = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
    const walk = (c, d) => d === 0 ? validPos(c) : Array.isArray(c) && c.every(x => walk(x, d - 1));
    const geomOk = g => {
      if (g === null) return true;
      if (!g || !GEOM_TYPES.has(g.type)) { badType++; return false; }
      if (g.type === 'GeometryCollection') return Array.isArray(g.geometries) && g.geometries.every(geomOk);
      if (!walk(g.coordinates, depth[g.type])) { badCoords++; return false; }
      return true;
    };
    fc.features.forEach(f => {
      if (!f || f.type !== 'Feature') { badType++; return; }
      if (f.properties !== null && f.properties !== undefined && (typeof f.properties !== 'object' || Array.isArray(f.properties))) badType++;
      geomOk(f.geometry);
    });
    const out = [];
    if (badType) out.push(['err', `${badType} entidades con estructura GeoJSON no válida`, 'Tipos de geometría o de entidad desconocidos.']);
    if (badCoords) out.push(['err', `${badCoords} geometrías con coordenadas mal formadas`, 'Cada posición debe ser una lista de 2 a 4 números.']);
    return out;
  }

  /* ---------- Tablas: inyección de fórmulas ---------- */
  function formulaCells(rows) {
    let n = 0;
    for (const r of rows) for (const v of r) if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) && !/^[+-]?\d+([.,]\d+)?$/.test(v.trim())) n++;
    return n;
  }
  /* Neutraliza celdas que una hoja de cálculo interpretaría como fórmula (CSV injection) */
  const safeCell = v => {
    const s = String(v ?? '');
    return /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)?$/.test(s.trim()) ? `'${s}` : s;
  };

  return { LIMITS, signature, SIGNATURE_LABEL, DANGEROUS, hasBinary, checkName, sha256, checkSHP, checkSHX, checkDBF, checkPRJ, checkGPKG, checkTIFF, checkOfficeZip, checkZipEntries, inflateBounded, checkXML, checkGeoJSON, formulaCells, safeCell };
})();
