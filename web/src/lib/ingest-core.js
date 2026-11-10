/* ==============================================================
   NÚCLEO DE LECTURA Y VALIDACIÓN (sin DOM)
   Se ejecuta dentro de un Web Worker (ingest.worker.js) para que los
   Shapefile y ZIP grandes no congelen la página; si el Worker no está
   disponible, la página lo usa directamente.
   Entrada: un trabajo { id, kind, format, parts, hasApi, ... }.
   Salida: mensajes { type: 'progress' | 'stage' | 'result' } vía emit().
   Queda en la página lo que necesita el DOM o bibliotecas externas:
   KML/GPX (DOMParser) y Excel (SheetJS, cargado bajo demanda).
   ============================================================== */
import { FileCheck } from './filecheck.js';

export const IngestCore = (() => {
  const FC = FileCheck;
  const MAX_FILE = 60 * 1024 * 1024;
  const MAX_UNZIPPED = 400 * 1024 * 1024;

  const FORMAT_LABEL = {
    shp: 'Shapefile', zip: 'ZIP', kmz: 'KMZ', geojson: 'GeoJSON', kml: 'KML', gpx: 'GPX',
    csv: 'CSV', xlsx: 'Excel', xls: 'Excel 97-2003', gpkg: 'GeoPackage', geotiff: 'GeoTIFF'
  };
  const SERVER_FORMATS = new Set(['gpkg', 'geotiff']);

  const raws = new Map();      // id -> geometrías y atributos sin reproyectar (para declarar el CRS después)
  const cancelled = new Set();
  class Cancelled extends Error {}
  const alive = id => { if (cancelled.has(id)) throw new Cancelled(); };

  /* ---------------- lectura con progreso ---------------- */
  async function readFile(file, onProgress) {
    if (!file.stream) return file.arrayBuffer();
    const reader = file.stream().getReader();
    const out = new Uint8Array(file.size);
    let off = 0, last = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (off + value.byteLength > out.length) throw new Error('El archivo cambió mientras se leía');
      out.set(value, off);
      off += value.byteLength;
      const now = Date.now();
      if (now - last > 80) { last = now; onProgress(off); }
    }
    onProgress(off);
    return off === out.length ? out.buffer : out.slice(0, off).buffer;
  }

  /* ---------------- texto ---------------- */
  const ascii = (buf, start, len) => String.fromCharCode(...new Uint8Array(buf, start, Math.min(len, buf.byteLength - start)));
  function decodeText(bytes, prefer) {
    if (prefer && !/utf-?8/i.test(prefer)) { try { return { text: new TextDecoder(prefer).decode(bytes), fallback: false }; } catch { /* página no soportada */ } }
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), fallback: false }; }
    catch { return { text: new TextDecoder('windows-1252').decode(bytes), fallback: true }; }
  }
  function cpgToEncoding(txt) {
    const t = (txt || '').trim().toUpperCase();
    if (!t) return null;
    if (/UTF-?8/.test(t)) return 'utf-8';
    if (/^(1252|ANSI 1252|WINDOWS-1252|CP1252)$/.test(t)) return 'windows-1252';
    if (/8859-1|LATIN1/.test(t)) return 'iso-8859-1';
    if (/^\d{3,4}$/.test(t)) return `windows-${t}`;
    return null;
  }

  /* ---------------- ZIP (lectura nativa con DecompressionStream) ---------------- */
  function zipEntries(buf) {
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('El ZIP no tiene directorio central: está dañado o incompleto');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let i = 0; i < count; i++) {
      if (p + 46 > buf.byteLength || dv.getUint32(p, true) !== 0x02014b50) throw new Error('Estructura ZIP no válida');
      const method = dv.getUint16(p + 10, true), flags = dv.getUint16(p + 8, true);
      const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      /* Nombres en UTF-8 (bit 11) o, si no, en la página de códigos local: se prueba UTF-8 y luego Windows-1252 */
      const name = decodeText(new Uint8Array(buf, p + 46, nlen), flags & 0x800 ? 'utf-8' : null).text;
      out.push({ name, method, csize, usize, lho, encrypted: !!(flags & 1) });
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }
  async function zipRead(buf, e) {
    const dv = new DataView(buf);
    if (e.lho + 30 > buf.byteLength || dv.getUint32(e.lho, true) !== 0x04034b50) throw new Error('Entrada ZIP con cabecera local no válida');
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    if (start + e.csize > buf.byteLength) throw new Error('Entrada ZIP fuera del archivo');
    const data = new Uint8Array(buf, start, e.csize);
    if (e.method === 0) { if (e.csize !== e.usize) throw new Error('Entrada ZIP sin compresión con tamaños inconsistentes'); return data.slice().buffer; }
    if (e.method === 8 && typeof DecompressionStream !== 'undefined') return FC.inflateBounded(data, e.usize);
    throw new Error(`Método de compresión ${e.method} no admitido en el navegador`);
  }

  /* ---------------- Shapefile ---------------- */
  const SHAPE_NAMES = { 1: 'puntos', 3: 'líneas', 5: 'polígonos', 8: 'multipuntos', 11: 'puntos con Z', 13: 'líneas con Z', 15: 'polígonos con Z', 18: 'multipuntos con Z', 21: 'puntos con M', 23: 'líneas con M', 25: 'polígonos con M', 28: 'multipuntos con M' };
  const signedArea = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
  const ringBox = r => r.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);

  function readSHP(buf) {
    const dv = new DataView(buf);
    if (buf.byteLength < 100 || dv.getInt32(0, false) !== 9994) throw new Error('El .shp no tiene la firma de un Shapefile');
    const type = dv.getInt32(32, true);
    const shapes = [];
    let p = 100;
    while (p + 12 <= buf.byteLength) {
      const len = dv.getInt32(p + 4, false) * 2;
      const c = p + 8;
      const st = dv.getInt32(c, true);
      let g = null;
      if ([1, 11, 21].includes(st)) g = { type: 'Point', coordinates: [dv.getFloat64(c + 4, true), dv.getFloat64(c + 12, true)] };
      else if ([8, 18, 28].includes(st)) {
        const n = dv.getInt32(c + 36, true), pts = [];
        for (let i = 0; i < n; i++) pts.push([dv.getFloat64(c + 40 + 16 * i, true), dv.getFloat64(c + 48 + 16 * i, true)]);
        g = { type: 'MultiPoint', coordinates: pts };
      } else if ([3, 13, 23, 5, 15, 25].includes(st)) {
        const np = dv.getInt32(c + 36, true), n = dv.getInt32(c + 40, true);
        const parts = []; for (let i = 0; i < np; i++) parts.push(dv.getInt32(c + 44 + 4 * i, true));
        const base = c + 44 + 4 * np, pts = [];
        for (let i = 0; i < n; i++) pts.push([dv.getFloat64(base + 16 * i, true), dv.getFloat64(base + 16 * i + 8, true)]);
        const rings = parts.map((s, i) => pts.slice(s, i + 1 < parts.length ? parts[i + 1] : n));
        if ([3, 13, 23].includes(st)) g = rings.length === 1 ? { type: 'LineString', coordinates: rings[0] } : { type: 'MultiLineString', coordinates: rings };
        else {
          /* Shapefile: anillos exteriores en sentido horario (área negativa), huecos al revés */
          const polys = [];
          rings.forEach(r => {
            if (signedArea(r) <= 0 || !polys.length) polys.push({ box: ringBox(r), rings: [r.slice().reverse()] });
            else {
              const [x, y] = r[0];
              const host = [...polys].reverse().find(pl => x >= pl.box[0] && x <= pl.box[2] && y >= pl.box[1] && y <= pl.box[3]) || polys[polys.length - 1];
              host.rings.push(r.slice().reverse());
            }
          });
          g = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0].rings } : { type: 'MultiPolygon', coordinates: polys.map(pl => pl.rings) };
        }
      }
      shapes.push(g);
      p += 8 + len;
    }
    return { type, typeName: SHAPE_NAMES[type] || `Tipo ${type}`, shapes };
  }

  function readDBF(buf, encoding) {
    const dv = new DataView(buf);
    const n = dv.getUint32(4, true), hlen = dv.getUint16(8, true), rlen = dv.getUint16(10, true);
    const fields = [];
    let fallback = false;
    for (let p = 32; p < hlen - 1 && dv.getUint8(p) !== 0x0d; p += 32) {
      const raw = new Uint8Array(buf, p, 11);
      const end = raw.indexOf(0);
      const d = decodeText(raw.subarray(0, end < 0 ? 11 : end), encoding);
      fallback ||= d.fallback;
      fields.push({ name: d.text.trim(), type: String.fromCharCode(dv.getUint8(p + 11)), len: dv.getUint8(p + 16), dec: dv.getUint8(p + 17) });
    }
    const rows = [];
    for (let r = 0; r < n; r++) {
      let o = hlen + r * rlen;
      if (o + rlen > buf.byteLength) break;
      const deleted = dv.getUint8(o) === 0x2a;
      o += 1;
      const row = {};
      for (const f of fields) {
        const bytes = new Uint8Array(buf, o, f.len);
        o += f.len;
        if (f.type === 'N' || f.type === 'F') { const t = ascii(bytes.buffer, bytes.byteOffset, f.len).trim(); row[f.name] = t === '' || /^\*+$/.test(t) ? null : Number(t); }
        else if (f.type === 'L') { const t = String.fromCharCode(bytes[0]); row[f.name] = /[YyTt]/.test(t) ? true : /[NnFf]/.test(t) ? false : null; }
        else if (f.type === 'D') { const t = ascii(bytes.buffer, bytes.byteOffset, 8).trim(); row[f.name] = t ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : null; }
        else { const d = decodeText(bytes, encoding); fallback ||= d.fallback; row[f.name] = d.text.replace(/\u0000/g, '').trim(); }
      }
      rows.push({ row, deleted });
    }
    return { fields, rows, fallback };
  }

  /* Sistema de referencia a partir del .prj (WKT de ESRI) */
  function parsePRJ(wkt) {
    const t = String(wkt || '');
    const datum = /NAD_?1927|NAD27/i.test(t) ? 'NAD27' : /ITRF_?2008/i.test(t) ? 'ITRF2008' : /ITRF_?1992|ITRF92/i.test(t) ? 'ITRF92' : /WGS_?1984|WGS 84/i.test(t) ? 'WGS84' : /NAD_?1983|NAD83/i.test(t) ? 'NAD83' : 'desconocido';
    if (/^\s*PROJCS/i.test(t)) {
      const cm = t.match(/Central_Meridian"?\s*,\s*(-?\d+(?:\.\d+)?)/i);
      const isTM = /Transverse_Mercator/i.test(t) && /False_Easting"?\s*,\s*500000/i.test(t) && /Scale_Factor"?\s*,\s*0\.9996/i.test(t);
      const named = t.match(/UTM[_ ]?zone[_ ]?(\d{1,2})\s*([NS])?/i);
      let zone = named ? +named[1] : null;
      if (!zone && cm && isTM) zone = Math.round((+cm[1] + 183) / 6);
      const south = named?.[2]?.toUpperCase() === 'S';
      if (zone && isTM && !south) return { kind: 'utm', zone, datum, label: `UTM ${zone}N · ${datum}` };
      const name = (t.match(/PROJCS\["([^"]+)"/i) || [])[1] || 'proyección';
      return { kind: 'unsupported', datum, label: name };
    }
    if (/^\s*GEOGCS/i.test(t)) return { kind: 'geo', datum, label: `Geográficas · ${datum}` };
    return { kind: 'unknown', datum, label: 'No reconocido' };
  }
  const crsLabelFor = c => c.kind === 'utm' ? `EPSG:${c.datum === 'WGS84' ? 32600 + c.zone : '—'} (${c.label})` : c.kind === 'geo' ? `EPSG:4326 (${c.label})` : c.label;

  /* UTM (norte, WGS 84) a grados */
  function fromUTM(x, y, zone) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
    const e2 = f * (2 - f), ep2 = e2 / (1 - e2), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const mu = (y / k0) / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
    const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2), T1 = Math.tan(phi1) ** 2, C1 = ep2 * Math.cos(phi1) ** 2;
    const R1 = a * (1 - e2) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5, D = (x - 500000) / (N1 * k0);
    const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
    const lon = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(phi1);
    return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
  }

  function mapCoords(geom, fn) {
    if (!geom) return geom;
    if (geom.type === 'GeometryCollection') return { ...geom, geometries: geom.geometries.map(g => mapCoords(g, fn)) };
    const walk = c => typeof c[0] === 'number' ? fn(c) : c.map(walk);
    return { ...geom, coordinates: walk(geom.coordinates) };
  }
  function eachCoord(geom, fn) {
    if (!geom) return;
    if (geom.type === 'GeometryCollection') return geom.geometries.forEach(g => eachCoord(g, fn));
    const walk = c => { if (typeof c[0] === 'number') fn(c); else c.forEach(walk); };
    walk(geom.coordinates || []);
  }

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0];
    const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += ch;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(v => String(v).trim() !== ''));
  }

  /* ---------------- comprobaciones compartidas ---------------- */
  function checkCoords(r, declaredGeo) {
    let bad = 0, outside = 0;
    r.geojson.features.forEach(f => {
      let fb = false, fo = false;
      eachCoord(f.geometry, ([x, y]) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > 90 || Math.abs(x) > 180) fb = true;
        else if (y < 14 || y > 33 || x < -119 || x > -86) fo = true;
      });
      if (fb) bad++; else if (fo) outside++;
    });
    if (bad) {
      r.checks.push(['err', `${bad} entidades con coordenadas fuera de rango`, declaredGeo ? 'El sistema de referencia dice grados, pero los valores parecen metros: revísalo.' : 'Revisa el sistema de referencia declarado.']);
      r.issues.push(`${bad} entidades con coordenadas inválidas`);
      r.state = 'blocked';
      return r;
    }
    r.checks.push(['ok', 'Coordenadas dentro de rango']);
    if (outside) r.checks.push(['warn', `${outside} entidades fuera de México`, 'Confirma que el sistema de referencia es el correcto.']);
    r.state = 'ready';
    return r;
  }

  /* Construye la tabla de puntos a partir de las columnas elegidas */
  function tableToGeo(r) {
    const { x: xi, y: yi, crs } = r.mapping;
    const feats = [], issues = [];
    r.table.rows.forEach((row, n) => {
      const xs = String(row[xi] ?? '').trim().replace(',', '.'), ys = String(row[yi] ?? '').trim().replace(',', '.');
      const x = Number(xs), y = Number(ys), line = n + 2;
      if (xs === '' || ys === '' || !Number.isFinite(x) || !Number.isFinite(y)) { issues.push(`Fila ${line}: coordenada vacía o no numérica`); return; }
      let lat, lon;
      if (crs === 'wgs84') {
        if (Math.abs(y) > 90 || Math.abs(x) > 180) { issues.push(`Fila ${line}: latitud o longitud fuera de rango (${y}, ${x})`); return; }
        lat = y; lon = x;
      } else {
        if (x < 100000 || x > 900000 || y < 0 || y > 10000000) { issues.push(`Fila ${line}: valores no válidos para UTM (E ${x}, N ${y})`); return; }
        ({ lat, lon } = fromUTM(x, y, crs === 'utm15' ? 15 : 16));
      }
      const props = {};
      r.table.headers.forEach((h, i) => { const v = row[i]; props[h] = v instanceof Date ? v.toISOString().slice(0, 10) : v; });
      feats.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });
    });
    r.issues = issues;
    r.geojson = { type: 'FeatureCollection', features: feats };
    r.crs = { wgs84: 'EPSG:4326 (WGS 84)', utm15: 'EPSG:32615 (WGS 84 / UTM 15N)', utm16: 'EPSG:32616 (WGS 84 / UTM 16N)' }[crs];
    r.state = issues.length ? 'blocked' : r.mapping.confirmed ? 'ready' : 'input';
    r.checks = r.checks.filter(c => !/^(Confirma las columnas|Columnas confirmadas)/.test(c[1]));
    if (r.mapping.confirmed) r.checks.push(['ok', 'Columnas confirmadas', `X: ${r.table.headers[xi]} · Y: ${r.table.headers[yi]} · ${{ wgs84: 'WGS 84', utm15: 'UTM 15N', utm16: 'UTM 16N' }[crs]}`]);
    else r.checks.push(['info', 'Confirma las columnas de coordenadas', 'Revisa X, Y y el sistema de referencia, y pulsa «Confirmar columnas».']);
    return r;
  }

  /* Tabla ya leída (CSV aquí o Excel en la página): encabezados, fórmulas y columnas propuestas */
  function prepareTable(r, rows, note = '') {
    if (!rows || rows.length < 2) { r.checks.push(['err', 'Tabla vacía', 'Se necesitan encabezados y al menos una fila.']); r.state = 'blocked'; return r; }
    const headers = rows[0].map((h, i) => String(h).trim() || `columna_${i + 1}`);
    r.table = { headers, rows: rows.slice(1) };
    r.checks.push(['ok', 'Tabla legible', `${r.table.rows.length.toLocaleString('es-MX')} filas · ${headers.length} columnas. ${note}`]);
    const formulas = FC.formulaCells(rows);
    if (formulas) r.checks.push(['warn', `${formulas.toLocaleString('es-MX')} celdas parecen fórmulas`, 'Empiezan con =, +, - o @. Se tratarán como texto y se neutralizan al exportar (inyección de fórmulas).']);
    const norm = h => h.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const gx = headers.findIndex(h => /^(lon|lng|longitud|longitude|x|este|easting)$/i.test(norm(h)));
    const gy = headers.findIndex(h => /^(lat|latitud|latitude|y|norte|northing)$/i.test(norm(h)));
    const sample = Number(r.table.rows[0]?.[gx]);
    r.mapping = { x: gx >= 0 ? gx : 0, y: gy >= 0 ? gy : Math.min(1, headers.length - 1), crs: Math.abs(sample) > 1000 ? 'utm16' : 'wgs84', confirmed: false };
    return tableToGeo(r);
  }

  /* ---------------- Shapefile ---------------- */
  function buildShapeGeo(r, raw, crs) {
    const conv = crs.kind === 'utm' ? ([x, y]) => { const p = fromUTM(x, y, crs.zone); return [p.lon, p.lat]; } : c => [c[0], c[1]];
    r.geojson = { type: 'FeatureCollection', features: raw.shapes.map((g, i) => ({ type: 'Feature', properties: raw.rows[i], geometry: g ? mapCoords(g, conv) : null })) };
    r.srcCrs = crs;
    r.crs = crsLabelFor(crs);
    return checkCoords(r, crs.kind === 'geo');
  }

  async function parseShapeBuffers(job, r, { shpBuf, dbfBuf, shxBuf, prjBuf, cpgBuf }) {
    const label = buf => FC.SIGNATURE_LABEL[FC.signature(buf)];
    if (FC.signature(shpBuf) !== 'shp') { r.checks.push(['err', 'El .shp no es un Shapefile', `Su contenido es ${label(shpBuf)}. Cambiar la extensión no lo convierte en un archivo geográfico.`]); r.state = 'blocked'; return r; }
    for (const [ext, buf] of [['dbf', dbfBuf], ['shx', shxBuf], ['prj', prjBuf], ['cpg', cpgBuf]]) {
      if (buf && FC.DANGEROUS.has(FC.signature(buf))) { r.checks.push(['err', `El .${ext} es en realidad ${label(buf)}`, 'Se rechaza por seguridad.']); r.state = 'blocked'; return r; }
    }
    const structural = [...FC.checkSHP(shpBuf), ...FC.checkSHX(shxBuf, shpBuf), ...FC.checkDBF(dbfBuf), ...(prjBuf ? FC.checkPRJ(prjBuf) : [])];
    if (cpgBuf && (cpgBuf.byteLength > 64 || FC.hasBinary(cpgBuf))) structural.push(['err', 'El .cpg no es una declaración de codificación', 'Debe ser un texto corto como «UTF-8».']);
    r.checks.push(...structural);
    if (structural.some(c => c[0] === 'err')) { r.state = 'blocked'; return r; }
    alive(job.id);
    const prjTxt = prjBuf ? new TextDecoder().decode(prjBuf) : null;
    const enc = cpgToEncoding(cpgBuf ? new TextDecoder().decode(cpgBuf) : null);
    const shp = readSHP(shpBuf);
    alive(job.id);
    const dbf = readDBF(dbfBuf, enc);
    const live = dbf.rows.filter(x => !x.deleted).length;
    r.checks.push(['ok', `Geometría de ${shp.typeName}`, `${shp.shapes.length.toLocaleString('es-MX')} registros en el .shp`]);
    if (dbf.rows.length !== shp.shapes.length) { r.checks.push(['err', 'El .dbf no corresponde al .shp', `${dbf.rows.length} filas de atributos frente a ${shp.shapes.length} geometrías: probablemente son de conjuntos distintos.`]); r.state = 'blocked'; return r; }
    r.checks.push(['ok', 'Atributos legibles', `${dbf.fields.length} campos · codificación ${enc || (dbf.fallback ? 'Windows-1252 (deducida)' : 'UTF-8')}`]);
    if (dbf.fallback && !enc) r.checks.push(['warn', 'Textos con acentos sin .cpg', 'Se leyeron como Windows-1252. Revisa en la tabla que los nombres se vean bien.']);
    if (live !== dbf.rows.length) r.checks.push(['info', `${dbf.rows.length - live} registros marcados como borrados en el .dbf`, 'Se conservan en la vista previa y se señalarán al servidor.']);
    const nulls = shp.shapes.filter(s => !s).length;
    if (nulls) r.checks.push(['warn', `${nulls} registros sin geometría`, 'Se conservan como registros sin ubicación.']);
    const raw = { shapes: shp.shapes, rows: dbf.rows.map(x => x.row) };
    if (!prjTxt) {
      raws.set(job.id, raw);
      r.srcCrs = null;
      r.needsCrs = true;
      r.checks.push(['err', 'Falta el archivo .prj', 'Sin él no se conoce el sistema de referencia. Indícalo abajo o agrega el .prj; nunca se deduce el datum solo por la zona.']);
      r.state = 'input';
      return r;
    }
    const crs = parsePRJ(prjTxt);
    if (crs.kind === 'unsupported' || crs.kind === 'unknown') { r.checks.push(['err', `Sistema de referencia no admitido: ${crs.label}`, 'Se admiten WGS 84 geográficas y UTM norte. Reproyecta el archivo o envíalo para conversión en el servidor.']); r.state = 'blocked'; return r; }
    if (crs.datum === 'NAD27') r.checks.push(['warn', 'Datum NAD27', 'Requiere una transformación de datum que se hace en el servidor; la vista previa puede desplazarse unos 200 m.']);
    else if (crs.datum !== 'WGS84') r.checks.push(['info', `Datum ${crs.datum}`, 'Se muestra como WGS 84; la diferencia a esta escala es menor a un metro.']);
    r.checks.push(['ok', 'Sistema de referencia', crs.label]);
    alive(job.id);
    return buildShapeGeo(r, raw, crs);
  }

  async function fingerprint(r, buf) {
    const h = await FC.sha256(buf);
    if (!h) { r.checks.push(['info', 'Huella no calculada', 'El navegador no ofrece SHA-256 en este contexto (se requiere HTTPS o localhost).']); return; }
    r.hash = h;
    r.checks.push(['ok', 'Huella SHA-256', `${h.slice(0, 16)}…${h.slice(-8)}`]);
  }

  async function runShapefile(job, r, emit) {
    const p = job.parts;
    r.checks.push(['ok', 'Componentes recibidos', Object.keys(p).map(k => `.${k}`).join(' · ')]);
    const missing = ['shp', 'shx', 'dbf'].filter(k => !p[k]);
    r.missing = missing;
    if (missing.length) {
      r.checks.push(['err', `Faltan componentes: ${missing.map(m => `.${m}`).join(', ')}`, 'Un Shapefile necesita .shp, .shx y .dbf del mismo conjunto. Añade solo el archivo que falta a esta capa; los demás no hace falta volver a elegirlos.']);
      r.state = 'blocked';
      return r;
    }
    const total = Object.values(p).reduce((s, f) => s + f.size, 0);
    if (total > MAX_FILE * 3) { r.checks.push(['err', 'Conjunto demasiado grande para el navegador', 'Se validará en el servidor cuando esté disponible.']); r.state = 'blocked'; return r; }
    let base = 0;
    const read = async f => { const b0 = base; const buf = await readFile(f, n => emit({ type: 'progress', value: (b0 + n) / total })); base += f.size; alive(job.id); return buf; };
    const bufs = { shpBuf: await read(p.shp), dbfBuf: await read(p.dbf), shxBuf: await read(p.shx), prjBuf: p.prj ? await read(p.prj) : null, cpgBuf: p.cpg ? await read(p.cpg) : null };
    emit({ type: 'stage', state: 'checking' });
    await fingerprint(r, bufs.shpBuf);
    return parseShapeBuffers(job, r, bufs);
  }

  async function runZip(job, r, buf) {
    const entries = zipEntries(buf).filter(e => !e.name.endsWith('/') && !/(^|\/)__MACOSX\//.test(e.name));
    const zc = FC.checkZipEntries(entries);
    if (zc.length) { r.checks.push(...zc); r.state = 'blocked'; return r; }
    const unz = entries.reduce((s, e) => s + e.usize, 0);
    if (unz > MAX_UNZIPPED || entries.some(e => e.csize > 0 && e.usize / e.csize > 200)) { r.checks.push(['err', 'Descompresión desproporcionada', 'El contenido descomprimido es demasiado grande respecto al ZIP. Se rechaza por seguridad.']); r.state = 'blocked'; return r; }
    r.checks.push(['ok', 'ZIP íntegro y seguro', `${entries.length} archivos · ${(unz / 1048576).toFixed(1)} MB descomprimido`]);
    if (job.format === 'kmz') {
      const kml = entries.find(e => /\.kml$/i.test(e.name));
      if (!kml) { r.checks.push(['err', 'El KMZ no contiene un .kml']); r.state = 'blocked'; return r; }
      r.next = { kind: 'xml', xmlKind: 'kml', text: new TextDecoder().decode(await zipRead(buf, kml)) };
      return r;
    }
    const shps = entries.filter(e => /\.shp$/i.test(e.name));
    if (!shps.length) {
      const inner = entries.map(e => e.name.split('.').pop().toLowerCase());
      r.checks.push(['err', 'El ZIP no contiene un Shapefile', inner.includes('gpkg') ? 'Contiene un GeoPackage: súbelo sin comprimir.' : `Contenido: ${[...new Set(inner)].map(x => `.${x}`).join(', ')}.`]);
      r.state = 'blocked'; return r;
    }
    if (shps.length > 1) r.checks.push(['info', `El ZIP contiene ${shps.length} Shapefile`, `Se previsualiza «${shps[0].name}». Para revisarlos por separado, súbelos como capas independientes.`]);
    const stem = shps[0].name.replace(/\.shp$/i, '').toLowerCase();
    const comp = ext => entries.find(e => e.name.toLowerCase() === `${stem}.${ext}`);
    const extra = job.extra || {};                       // componentes que la persona añadió aparte, sin volver a subir el ZIP
    const part = async ext => (comp(ext) ? zipRead(buf, comp(ext)) : extra[ext] ? readFile(extra[ext], () => {}) : null);
    const missing = ['shx', 'dbf'].filter(x => !comp(x) && !extra[x]);
    r.stem = stem.replace(/^.*\//, '');
    r.missing = missing;
    if (Object.keys(extra).length) r.checks.push(['ok', 'Componentes añadidos aparte', Object.keys(extra).map(k => `.${k}`).join(' · ')]);
    if (missing.length) { r.checks.push(['err', `Faltan componentes en el ZIP: ${missing.map(m => `.${m}`).join(', ')}`, 'Un Shapefile necesita .shp, .shx y .dbf del mismo conjunto. Añade solo el archivo que falta a esta capa; no hace falta volver a subir el ZIP.']); r.state = 'blocked'; return r; }
    const side = entries.find(e => [`${stem}.shp.xml`, `${stem}.xml`].includes(e.name.toLowerCase()) && e.usize <= 2 * 1024 * 1024);
    if (side) r.sidecar = { name: side.name.replace(/^.*\//, ''), text: new TextDecoder().decode(await zipRead(buf, side)) };
    r.format = 'shp';
    r.zipped = true;
    r.layerName = shps[0].name.replace(/^.*\//, '').replace(/\.shp$/i, '').replace(/[_-]+/g, ' ');
    alive(job.id);
    return parseShapeBuffers(job, r, {
      shpBuf: await zipRead(buf, shps[0]), dbfBuf: await part('dbf'), shxBuf: await part('shx'),
      prjBuf: await part('prj'), cpgBuf: await part('cpg')
    });
  }

  /* Miembros de primer nivel del GeoJSON que son texto (algunos programas guardan ahí título y licencia) */
  function topMembers(gj) {
    const out = {};
    for (const k of ['name', 'title', 'description', 'license', 'attribution', 'author', 'source', 'date', 'created', 'keywords']) {
      const v = gj?.[k];
      if (typeof v === 'string') out[k] = v.slice(0, 2000);
      else if (k === 'keywords' && Array.isArray(v)) out[k] = v.filter(x => typeof x === 'string').join(', ').slice(0, 500);
    }
    return Object.keys(out).length ? out : null;
  }

  async function runSingle(job, r, emit) {
    const f = job.parts.main;
    if (f.size > MAX_FILE) { r.checks.push(['err', 'Archivo demasiado grande para el navegador', 'El límite local es de 60 MB; los archivos mayores se validarán en el servidor.']); r.state = 'blocked'; return r; }
    const buf = await readFile(f, n => emit({ type: 'progress', value: f.size ? n / f.size : 1 }));
    alive(job.id);
    emit({ type: 'stage', state: 'checking' });
    const s = FC.signature(buf);
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (FC.DANGEROUS.has(s)) { r.checks.push(['err', `El archivo es en realidad ${FC.SIGNATURE_LABEL[s]}`, `Tiene extensión .${ext}, pero su contenido es código o un programa. Se rechaza por seguridad.`]); r.state = 'blocked'; return r; }
    const expect = { geojson: ['json'], kml: ['kml'], gpx: ['gpx'], csv: ['text'], xlsx: ['zip'], xls: ['ole'], zip: ['zip'], kmz: ['zip'], gpkg: ['sqlite'], geotiff: ['tiff'] }[job.format];
    if (!expect.includes(s)) { r.checks.push(['err', 'El contenido no coincide con la extensión', `Dice ser ${FORMAT_LABEL[job.format]}, pero su contenido es ${FC.SIGNATURE_LABEL[s]}. Cambiar la extensión no lo convierte en un archivo geográfico válido.`]); r.state = 'blocked'; return r; }
    r.checks.push(['ok', 'El contenido coincide con la extensión', FORMAT_LABEL[job.format]]);
    await fingerprint(r, buf);
    if (job.format === 'xls') { r.checks.push(['err', 'Formato Excel 97-2003 no admitido', 'Los .xls antiguos pueden contener macros y no se aceptan todavía. Guarda el archivo como .xlsx.']); r.state = 'blocked'; return r; }
    if (job.format === 'gpkg' || job.format === 'geotiff') {
      const c = job.format === 'gpkg' ? FC.checkGPKG(buf) : FC.checkTIFF(buf);
      r.checks.push(...c);
      if (c.some(x => x[0] === 'err')) { r.state = 'blocked'; return r; }
    }
    if (job.format === 'xlsx') {
      const entries = zipEntries(buf);
      const c = [...FC.checkZipEntries(entries, { allowOffice: true }), ...FC.checkOfficeZip(entries.map(e => e.name))];
      r.checks.push(...c);
      if (c.some(x => x[0] === 'err')) { r.state = 'blocked'; return r; }
      r.next = { kind: 'xlsx', buffer: buf };
      return r;
    }
    if (SERVER_FORMATS.has(job.format)) {
      r.checks.push(['info', 'Lectura geográfica en el servidor', `${FORMAT_LABEL[job.format]} se interpreta con GDAL/OGR en un entorno aislado. ${job.hasApi ? 'Se validará al enviarlo.' : 'Sin servidor configurado no puede previsualizarse aquí.'}`]);
      r.checks.push(['pending', 'Antivirus y cuarentena', 'Se aplican en el servidor antes de interpretar el archivo.']);
      r.state = 'server';
      return r;
    }
    if (job.format === 'zip' || job.format === 'kmz') return runZip(job, r, buf);
    if (job.format === 'geojson') {
      let gj;
      try { gj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf)); }
      catch { r.checks.push(['err', 'JSON no válido', 'El archivo no es JSON bien formado en UTF-8.']); r.state = 'blocked'; return r; }
      const fc = gj?.type === 'FeatureCollection' ? gj : gj?.type === 'Feature' ? { type: 'FeatureCollection', features: [gj] } : (gj?.coordinates || gj?.geometries) ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: gj }] } : null;
      if (!fc || !Array.isArray(fc.features)) { r.checks.push(['err', 'Estructura GeoJSON no válida', 'Se esperaba un FeatureCollection, Feature o geometría.']); r.state = 'blocked'; return r; }
      const gc = FC.checkGeoJSON(fc);
      if (gc.length) { r.checks.push(...gc); r.state = 'blocked'; return r; }
      r.checks.push(['ok', 'Estructura GeoJSON válida', `${fc.features.length.toLocaleString('es-MX')} entidades`]);
      if (gj.crs) r.checks.push(['warn', 'El archivo declara un CRS propio', 'GeoJSON (RFC 7946) usa WGS 84; confirma que las coordenadas estén en grados.']);
      r.geojson = fc; r.crs = 'EPSG:4326 (WGS 84)';
      r.top = topMembers(gj);
      return checkCoords(r, true);
    }
    if (job.format === 'kml' || job.format === 'gpx') { r.next = { kind: 'xml', xmlKind: job.format, text: new TextDecoder().decode(buf) }; return r; }
    if (job.format === 'csv') {
      if (FC.hasBinary(buf)) { r.checks.push(['err', 'El CSV contiene datos binarios', 'No es un archivo de texto delimitado.']); r.state = 'blocked'; return r; }
      return prepareTable(r, parseCSV(decodeText(new Uint8Array(buf)).text));
    }
    r.checks.push(['err', 'Formato no admitido']);
    r.state = 'blocked';
    return r;
  }

  /* ---------------- vista previa liviana ----------------
     La validación usa la geometría completa; a la página solo viaja una
     versión simplificada (Douglas-Peucker) para dibujar el mapa. Clonar un
     millón de vértices entre hilos congelaba la página medio segundo. */
  const PREVIEW_BUDGET = 150000;
  function countVertices(fc) {
    let n = 0;
    fc.features.forEach(f => eachCoord(f.geometry, () => { n++; }));
    return n;
  }
  function rdp(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    const tol2 = tol * tol;
    while (stack.length) {
      const [s, e] = stack.pop();
      const [x1, y1] = pts[s], [x2, y2] = pts[e];
      const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1e-30;
      let best = 0, idx = -1;
      for (let i = s + 1; i < e; i++) {
        const [x0, y0] = pts[i];
        const cross = dy * x0 - dx * y0 + x2 * y1 - y2 * x1;
        const d2 = cross * cross / len2;
        if (d2 > best) { best = d2; idx = i; }
      }
      if (best > tol2 && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  function simplifyGeom(g, tol) {
    if (!g) return g;
    /* Un anillo cerrado empieza y termina en el mismo punto: se divide en su vértice más lejano */
    const ring = r => {
      if (r.length < 5) return r;
      const [x0, y0] = r[0];
      let far = 1, best = -1;
      for (let i = 1; i < r.length - 1; i++) { const d = (r[i][0] - x0) ** 2 + (r[i][1] - y0) ** 2; if (d > best) { best = d; far = i; } }
      const s = [...rdp(r.slice(0, far + 1), tol), ...rdp(r.slice(far), tol).slice(1)];
      return s.length >= 4 ? s : r;
    };
    const line = l => { const s = rdp(l, tol); return s.length >= 2 ? s : l; };
    switch (g.type) {
      case 'LineString': return { type: g.type, coordinates: line(g.coordinates) };
      case 'MultiLineString': return { type: g.type, coordinates: g.coordinates.map(line) };
      case 'Polygon': return { type: g.type, coordinates: g.coordinates.map(ring) };
      case 'MultiPolygon': return { type: g.type, coordinates: g.coordinates.map(p => p.map(ring)) };
      case 'GeometryCollection': return { type: g.type, geometries: g.geometries.map(x => simplifyGeom(x, tol)) };
      default: return g;
    }
  }
  function previewGeometry(r) {
    if (!r.geojson) return r;
    const total = countVertices(r.geojson);
    if (total <= PREVIEW_BUDGET) return r;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    r.geojson.features.forEach(f => eachCoord(f.geometry, ([x, y]) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }));
    let tol = Math.hypot(maxX - minX, maxY - minY) / 50000;
    let out = r.geojson, n = total;
    for (let i = 0; i < 8 && n > PREVIEW_BUDGET; i++, tol *= 2) {
      out = { type: 'FeatureCollection', features: r.geojson.features.map(f => ({ type: 'Feature', properties: f.properties, geometry: simplifyGeom(f.geometry, tol) })) };
      n = countVertices(out);
    }
    r.geojson = out;
    r.checks.push(['info', 'Vista previa simplificada', `${total.toLocaleString('es-MX')} → ${n.toLocaleString('es-MX')} vértices para dibujar el mapa con fluidez. La validación usó la geometría completa y los archivos originales se envían sin cambios.`]);
    return r;
  }

  /* ---------------- punto de entrada ---------------- */
  async function run(job, emit) {
    cancelled.delete(job.id);
    const r = { checks: [], issues: [], state: 'reading', geojson: null, table: null, crs: null, srcCrs: null };
    try {
      if (job.kind === 'reproject') {
        const raw = raws.get(job.id);
        if (!raw) throw new Error('Los datos del Shapefile ya no están en memoria: vuelve a cargarlo.');
        r.checks.push(['info', 'Sistema de referencia declarado en la carga', job.crs.label]);
        buildShapeGeo(r, raw, job.crs);
        raws.delete(job.id);
      } else if (job.kind === 'table') {
        Object.assign(r, { checks: job.checks, table: job.table, mapping: job.mapping });
        tableToGeo(r);
      } else if (job.format === 'shp') await runShapefile(job, r, emit);
      else await runSingle(job, r, emit);
    } catch (err) {
      if (err instanceof Cancelled) return null;
      r.checks.push(['err', 'No se pudo interpretar el archivo', err.message]);
      r.state = 'blocked';
    }
    if (r.state === 'reading' || r.state === 'checking') r.state = r.next ? 'checking' : 'blocked';
    if (r.state !== 'blocked') previewGeometry(r);
    return r;
  }

  return {
    run, prepareTable, tableToGeo, checkCoords, FORMAT_LABEL,
    cancel(id) { cancelled.add(id); raws.delete(id); },
    drop(id) { raws.delete(id); }
  };
})();
