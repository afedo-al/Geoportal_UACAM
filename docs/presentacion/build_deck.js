/* Presentación de DeltaMap-CEDESU para el Centro (sin lenguaje técnico), con capturas reales de la aplicación.
   Uso: NODE_PATH=<carpeta con pptxgenjs, react-icons, react, react-dom y sharp> node build_deck.js */
const path = require('path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const pptxgen = require('pptxgenjs');
const lu = require('react-icons/lu');
const { applyTheme } = require(process.env.APPLY_THEME || './apply_theme.js');

const CAP = path.join(__dirname, 'capturas');
const OUT = path.join(__dirname, 'DeltaMap-CEDESU_Presentacion.pptx');

const THEME = {
  name: 'DeltaMap CEDESU', headFontFace: 'Cambria', bodyFontFace: 'Calibri',
  colors: { dk1: '0C1E35', lt1: 'FFFFFF', dk2: '214C7E', lt2: 'F3F5F6', accent1: 'D4A64C', accent2: '214C7E', accent3: '15724F', accent4: 'B83E3C', accent5: '607084', accent6: 'E9F1FA', hlink: '214C7E', folHlink: '607084' }
};

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';            // 13.33" x 7.5"
pres.title = 'DeltaMap-CEDESU';
pres.author = 'Digital Path · Facultad de Ingeniería, UACAM';
pres.company = 'Facultad de Ingeniería, UACAM';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

const W = 13.333, H = 7.5, MX = 0.6;
const GOLD_HEX = 'D4A64C', NAVY_HEX = '0C1E35', BLUE_HEX = '214C7E';

/* ---------- iconos ---------- */
async function icon(name, color = NAVY_HEX) {
  const Comp = lu[name];
  if (!Comp) throw new Error('Icono no encontrado: ' + name);
  const svg = renderToStaticMarkup(React.createElement(Comp, { color: '#' + color, size: '256' }));
  const buf = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}

/* ---------- layouts ---------- */
pres.defineSlideMaster({
  title: 'CONTENIDO', background: { color: C.background2 },
  objects: [
    { text: { text: 'DeltaMap-CEDESU  ·  Digital Path', options: { x: MX, y: 7.05, w: 6, h: 0.3, fontSize: 11, color: C.accent5, margin: 0, isTextBox: true } } },
    { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 0.85, w: W - 2 * MX, h: 0.85, fontSize: 34, bold: true, color: C.text1, align: 'left', valign: 'top', margin: 0 }, text: '' } }
  ],
  slideNumber: { x: W - MX - 1, y: 7.05, w: 1, h: 0.3, fontSize: 11, color: C.accent5, align: 'right' }
});
pres.defineSlideMaster({
  title: 'OSCURO', background: { color: C.text1 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 1.8, w: 6.4, h: 1.4, fontSize: 44, bold: true, color: C.background1, align: 'left', valign: 'bottom', margin: 0 }, text: '' } }
  ]
});

/* ---------- piezas reutilizables ---------- */
const shadow = () => ({ type: 'outer', color: NAVY_HEX, blur: 14, offset: 3, angle: 90, opacity: 0.16 });

function kicker(slide, text) {
  slide.addText(text, { x: MX, y: 0.45, w: 9, h: 0.3, fontSize: 12, bold: true, color: C.accent1, charSpacing: 3, margin: 0, isTextBox: true, objectName: 'Etiqueta de sección' });
}
function card(slide, x, y, w, h, fill = C.background1) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: C.background2, width: 0.75 }, shadow: shadow(), objectName: 'Tarjeta' });
}
/* Captura de pantalla con marco blanco; w manda y la altura sale de la proporción 16:9 */
function shot(slide, file, x, y, w, alt) {
  const h = (w * 9) / 16;
  slide.addShape(pres.ShapeType.roundRect, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, rectRadius: 0.08, fill: { color: C.background1 }, line: { color: C.background2, width: 0.75 }, shadow: shadow(), objectName: 'Marco de captura' });
  slide.addImage({ path: path.join(CAP, file), x, y, w, h, altText: alt, objectName: alt });
  return h;
}
function phone(slide, file, x, y, h, alt) {
  const w = h * (390 / 844), pad = 0.07;
  slide.addShape(pres.ShapeType.roundRect, { x: x - pad, y: y - pad, w: w + 2 * pad, h: h + 2 * pad, rectRadius: 0.22, fill: { color: C.text1 }, shadow: shadow(), objectName: 'Marco de celular' });
  slide.addImage({ path: path.join(CAP, file), x, y, w, h, altText: alt, objectName: alt });
  return w + 2 * pad;
}
async function iconBadge(slide, name, x, y, size = 0.62, on = 'light') {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w: size, h: size, rectRadius: 0.14, fill: { color: on === 'dark' ? C.accent1 : C.accent6 }, objectName: 'Fondo de icono' });
  const pad = size * 0.22;
  slide.addImage({ data: await icon(name, on === 'dark' ? NAVY_HEX : BLUE_HEX), x: x + pad, y: y + pad, w: size - 2 * pad, h: size - 2 * pad, altText: '', objectName: 'Icono' });
}
function numberDot(slide, n, x, y) {
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: 0.42, h: 0.42, fill: { color: C.accent1 }, objectName: 'Número' });
  slide.addText(String(n), { x, y, w: 0.42, h: 0.42, fontSize: 14, bold: true, color: C.text1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
}
/* Lista numerada vertical: título en negrita y texto debajo */
function steps(slide, items, x, y, w, gap = 1.35) {
  items.forEach(([t, d], i) => {
    const yy = y + i * gap;
    numberDot(slide, i + 1, x, yy);
    slide.addText(t, { x: x + 0.65, y: yy - 0.02, w: w - 0.65, h: 0.4, fontSize: 18, bold: true, color: C.text1, margin: 0, valign: 'middle', isTextBox: true });
    slide.addText(d, { x: x + 0.65, y: yy + 0.4, w: w - 0.65, h: gap - 0.5, fontSize: 14, color: C.accent5, margin: 0, valign: 'top', isTextBox: true });
  });
}
function caption(slide, title, text, x, y, w) {
  slide.addText(title, { x, y, w, h: 0.35, fontSize: 16, bold: true, color: C.text1, margin: 0, isTextBox: true });
  slide.addText(text, { x, y: y + 0.38, w, h: 0.62, fontSize: 14, color: C.accent5, margin: 0, valign: 'top', isTextBox: true });
}

(async () => {
  let s;

  /* ===== 1. Portada ===== */
  pres.addSection({ title: 'Apertura' });
  s = pres.addSlide({ masterName: 'OSCURO', sectionTitle: 'Apertura' });
  s.addImage({ path: path.join(CAP, 'portada.jpg'), x: 7.3, y: 0, w: W - 7.3, h: H, altText: 'Mapa de Quintana Roo y la península de Yucatán en DeltaMap-CEDESU', objectName: 'Imagen de portada' });
  s.addImage({ path: path.join(__dirname, 'logo_uacam.png'), x: MX, y: 0.6, w: 0.62, h: 0.62, altText: 'Escudo de la Universidad Autónoma de Campeche', objectName: 'Logo UACAM' });
  s.addImage({ path: path.join(__dirname, 'logo_cedesu.png'), x: MX + 0.8, y: 0.6, w: 0.62, h: 0.62, altText: 'Logotipo del CEDESU', objectName: 'Logo CEDESU' });
  s.addText('Facultad de Ingeniería · UACAM\nCentro de Estudios para el Desarrollo Sustentable (CEDESU)', { x: MX + 1.6, y: 0.6, w: 5.2, h: 0.62, fontSize: 12, color: C.background2, margin: 0, valign: 'middle', isTextBox: true });
  s.addText('DeltaMap-CEDESU', { placeholder: 'title' });
  s.addText('Todos los mapas del Centro, en un solo lugar', { x: MX, y: 3.25, w: 6.4, h: 0.6, fontSize: 22, color: C.accent1, margin: 0, isTextBox: true });
  s.addText('Reunir, revisar y publicar con control la información geográfica de los estudios del Centro.', { x: MX, y: 3.95, w: 6.2, h: 0.9, fontSize: 16, color: C.background2, margin: 0, valign: 'top', isTextBox: true });
  s.addText([
    { text: 'Equipo Digital Path', options: { bold: true, color: C.accent1, breakLine: true } },
    { text: 'Miranda Amaro Hernández', options: { breakLine: true } },
    { text: 'Adalberto Pech Us', options: { breakLine: true } },
    { text: 'Alfredo J. Cruz Miss', options: { breakLine: true } },
    { text: 'Cristian G. Carballo Padilla' }
  ], { x: MX, y: 5.2, w: 6, h: 1.6, fontSize: 13, color: C.background2, margin: 0, valign: 'top', isTextBox: true });
  s.addNotes('Presentar al equipo y el propósito: un lugar único para guardar, revisar y compartir la información geográfica del CEDESU. Todo lo que se verá son capturas de la aplicación funcionando.');

  /* ===== 2. Lo que escuchamos ===== */
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Apertura' });
  kicker(s, 'LO QUE ESCUCHAMOS DEL CENTRO');
  s.addText('Un solo lugar para toda su información geográfica', { placeholder: 'title' });
  const dolores = [
    ['LuFolders', 'Dispersa', 'Los mapas, coordenadas y fotos de un mismo estudio están en distintas computadoras y carpetas.'],
    ['LuSearchX', 'Difícil de consultar', 'Abrir un mapa exige programas especializados que no todo el personal tiene ni domina.'],
    ['LuTriangleAlert', 'Sin revisión', 'Un archivo incompleto o mal ubicado se descubre cuando ya causó un error.'],
    ['LuCircleHelp', 'Sin contexto', 'No siempre se sabe quién elaboró una capa, de cuándo es o con qué permiso se puede usar.']
  ];
  const cw = 2.85, cg = 0.2, cy = 2.2, ch = 3.7;
  for (let i = 0; i < dolores.length; i++) {
    const x = MX + i * (cw + cg);
    card(s, x, cy, cw, ch);
    await iconBadge(s, dolores[i][0], x + 0.3, cy + 0.35, 0.8);
    s.addText(dolores[i][1], { x: x + 0.3, y: cy + 1.35, w: cw - 0.6, h: 0.45, fontSize: 20, bold: true, color: C.text1, margin: 0, isTextBox: true });
    s.addText(dolores[i][2], { x: x + 0.3, y: cy + 1.9, w: cw - 0.6, h: 2.1, fontSize: 16, color: C.accent5, margin: 0, valign: 'top', isTextBox: true });
  }
  s.addNotes('Cuatro problemas que el Centro nos describió: la información está dispersa, es difícil de abrir, no se revisa antes de usarse y no siempre se sabe de dónde viene.');

  /* ===== 3. Hoy vs con DeltaMap ===== */
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Apertura' });
  kicker(s, 'LO QUE EL CENTRO VA A LOGRAR');
  s.addText('De buscar entre carpetas a tenerlo todo en un mapa', { placeholder: 'title' });
  const cambios = [
    ['Buscar un estudio entre carpetas, correos y memorias', 'Encontrarlo en el catálogo y verlo en el mapa en segundos'],
    ['Abrir mapas solo con programas especializados', 'Consultarlos desde cualquier computadora, incluso el celular'],
    ['Descubrir un archivo dañado cuando ya causó un error', 'Detectarlo al subirlo, con una explicación de cómo corregirlo'],
    ['Que cada quien anote sus datos de campo a su manera', 'Registrar puntos con el mismo formato para todos, foto incluida'],
    ['Compartir información sin un filtro claro', 'Publicar solo lo que el responsable del Centro aprueba']
  ];
  s.addText('HOY', { x: MX, y: 1.95, w: 5.3, h: 0.3, fontSize: 12, bold: true, color: C.accent5, charSpacing: 3, margin: 0, isTextBox: true });
  s.addText('CON DELTAMAP-CEDESU', { x: 7.1, y: 1.95, w: 5.6, h: 0.3, fontSize: 12, bold: true, color: C.text2, charSpacing: 3, margin: 0, isTextBox: true });
  const arrow = await icon('LuArrowRight', GOLD_HEX);
  cambios.forEach(([a, b], i) => {
    const y = 2.35 + i * 0.88;
    s.addShape(pres.ShapeType.roundRect, { x: MX, y, w: 5.9, h: 0.72, rectRadius: 0.08, fill: { color: C.background1 }, line: { color: C.background2, width: 0.75 }, objectName: 'Situación actual' });
    s.addText(a, { x: MX + 0.25, y, w: 5.45, h: 0.72, fontSize: 14, color: C.accent5, margin: 0, valign: 'middle', isTextBox: true });
    s.addImage({ data: arrow, x: 6.7, y: y + 0.2, w: 0.32, h: 0.32, altText: '', objectName: 'Flecha' });
    s.addShape(pres.ShapeType.roundRect, { x: 7.1, y, w: 5.63, h: 0.72, rectRadius: 0.08, fill: { color: C.accent6 }, objectName: 'Con DeltaMap' });
    s.addText(b, { x: 7.35, y, w: 5.2, h: 0.72, fontSize: 14, bold: true, color: C.text1, margin: 0, valign: 'middle', isTextBox: true });
  });
  s.addNotes('Cinco cambios concretos. Insistir en el último: nada se hace público sin la aprobación de la persona que el Centro designe.');

  /* ===== 4. Quién lo usa ===== */
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Apertura' });
  kicker(s, 'QUIÉN LO USA Y PARA QUÉ');
  s.addText('Pensado para cada persona del Centro', { placeholder: 'title' });
  const roles = [
    ['LuGlobe', 'Público', 'SIN CUENTA', ['Ven el mapa y activan la información que les interesa', 'Consultan el catálogo de estudios publicados', 'Miden distancias y áreas']],
    ['LuFlaskConical', 'Investigadores', 'CON ACCESO', ['Suben sus capas y archivos de estudio', 'Registran puntos de campo desde el celular', 'Importan y exportan sus puntos en Excel']],
    ['LuShieldCheck', 'Administración', 'CON ACCESO', ['Revisa cada capa antes de que sea pública', 'La aprueba o la regresa con comentarios', 'Decide qué ve el público y qué se queda interno']]
  ];
  const rw = 3.9, rg = 0.2, ry = 2.15, rh = 4.0;
  for (let i = 0; i < roles.length; i++) {
    const x = MX + i * (rw + rg), dark = i === 2;
    card(s, x, ry, rw, rh, dark ? C.text1 : C.background1);
    await iconBadge(s, roles[i][0], x + 0.35, ry + 0.35, 0.7, dark ? 'dark' : 'light');
    s.addText(roles[i][2], { x: x + 1.25, y: ry + 0.38, w: rw - 1.5, h: 0.3, fontSize: 11, bold: true, color: dark ? C.accent1 : C.accent5, charSpacing: 3, margin: 0, isTextBox: true });
    s.addText(roles[i][1], { x: x + 1.25, y: ry + 0.66, w: rw - 1.5, h: 0.45, fontSize: 22, bold: true, color: dark ? C.background1 : C.text1, margin: 0, isTextBox: true });
    s.addText(roles[i][3].map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < roles[i][3].length - 1 } })), { x: x + 0.35, y: ry + 1.5, w: rw - 0.7, h: 2.7, fontSize: 15, color: dark ? C.background2 : C.text1, margin: 0, valign: 'top', paraSpaceAfter: 12, isTextBox: true });
  }
  s.addNotes('Tres tipos de persona. El público no necesita cuenta; investigadores y administración entran con acceso.');

  /* ===== 5. Mapa ===== */
  pres.addSection({ title: 'Así se ve hoy' });
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Así se ve hoy' });
  kicker(s, 'ASÍ SE VE HOY · MAPA');
  s.addText('Consultar el mapa, sin instalar nada', { placeholder: 'title' });
  shot(s, '02_mapa_consulta.jpg', MX + 0.06, 1.95, 8.3, 'Mapa de Quintana Roo con un municipio seleccionado y sus datos');
  steps(s, [
    ['Capas a elección', 'Cada conjunto de datos se enciende o se apaga sobre el mapa de calles o el de satélite.'],
    ['Un clic, sus datos', 'Al tocar un municipio se muestran su nombre, población y superficie.'],
    ['Búsqueda y medición', 'Se busca un lugar o una coordenada y se miden distancias y áreas.']
  ], 9.35, 2.05, 3.4, 1.65);
  s.addNotes('Demo sugerida: encender la capa de municipios, tocar uno y mostrar sus datos. Luego buscar un lugar y medir una distancia.');

  /* ===== 6. Capas combinadas ===== */
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Así se ve hoy' });
  kicker(s, 'ASÍ SE VE HOY · MAPA');
  s.addText('Combine la información que necesite', { placeholder: 'title' });
  shot(s, '02_mapa_capas.jpg', MX + 0.06, 1.95, 5.95, 'Capa de municipios de Quintana Roo sobre el mapa');
  shot(s, '02_mapa_clima.jpg', 6.85 + 0.06, 1.95, 5.95, 'Capas de clima y municipios combinadas');
  caption(s, 'Los estudios del Centro', 'Cada estudio publicado se activa con un clic y se acerca solo a su zona.', MX + 0.06, 5.5, 5.9);
  caption(s, 'Una capa sobre otra', 'Clima, municipios y más, para ver cómo se relacionan en el territorio.', 6.91, 5.5, 5.9);
  s.addNotes('Mostrar que se pueden combinar capas: por ejemplo, el clima sobre los municipios.');

  /* ===== 7. Catálogo ===== */
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Así se ve hoy' });
  kicker(s, 'ASÍ SE VE HOY · CATÁLOGO');
  s.addText('Cada estudio, con su ficha', { placeholder: 'title' });
  shot(s, '04_catalogo.jpg', MX + 0.06, 1.95, 5.95, 'Catálogo de estudios publicados');
  shot(s, '05_ficha.jpg', 6.85 + 0.06, 1.95, 5.95, 'Ficha de un estudio con su autoría, fecha y licencia');
  caption(s, 'Ficha completa', 'Título, descripción, tema, fecha, autoría y licencia de uso.', MX + 0.06, 5.5, 3.7);
  caption(s, 'Encontrar rápido', 'Búsqueda por nombre y filtros por tema y año.', 4.7, 5.5, 3.7);
  caption(s, 'Del catálogo al mapa', 'Con un botón se abre la capa del estudio en el mapa.', 8.85, 5.5, 3.9);
  s.addNotes('La ficha responde: qué es, quién lo hizo, de cuándo es y con qué permiso se puede usar.');

  /* ===== 8. Subir información ===== */
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Así se ve hoy' });
  kicker(s, 'ASÍ SE VE HOY · SUBIR INFORMACIÓN');
  s.addText('Subir información con tranquilidad', { placeholder: 'title' });
  shot(s, '03_carga.jpg', MX + 0.06, 1.95, 8.3, 'Pantalla de carga con la revisión del archivo y la vista previa en el mapa');
  steps(s, [
    ['Sus archivos de siempre', 'Mapas, hojas de Excel y datos de GPS, sin convertirlos antes.'],
    ['Avisa qué falta', 'Si un archivo está incompleto o no es lo que dice ser, lo explica y dice cómo corregirlo.'],
    ['Vista previa', 'Se ve cómo quedará en el mapa antes de enviarlo a revisión.']
  ], 9.35, 2.05, 3.4, 1.65);
  s.addNotes('Cada archivo se revisa al subirlo. El sistema avisa si falta algo o si el archivo no es lo que dice ser, y propone cómo corregirlo.');

  /* ===== 9. Trabajo de campo ===== */
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Así se ve hoy' });
  kicker(s, 'ASÍ SE VE HOY · TRABAJO DE CAMPO');
  s.addText('Registrar puntos de campo desde el celular', { placeholder: 'title' });
  phone(s, 'm2_gps.jpg', MX + 0.1, 1.95, 4.85, 'Registro de puntos de campo en un celular, con el mapa y los puntos guardados');
  phone(s, 'm3_gps_puntos.jpg', MX + 2.75, 1.95, 4.85, 'Lista de puntos de campo registrados en un celular');
  steps(s, [
    ['Ubicación al instante', 'Con el GPS del teléfono, tocando el mapa o escribiendo las coordenadas.'],
    ['Todo en un registro', 'Nombre, fecha, tipo de muestra, descripción, predio, autor y fotografía.'],
    ['Listo para Excel', 'Los puntos se exportan e importan para seguir trabajándolos.']
  ], 6.9, 2.05, 5.8, 1.65);
  s.addNotes('Pensado para usarse en el sitio: abrir desde el celular, tomar la ubicación, llenar el registro y guardar.');

  /* ===== 10. Excel -> capa ===== */
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Así se ve hoy' });
  kicker(s, 'ASÍ SE VE HOY · DEL EXCEL A LA CAPA');
  s.addText('Del Excel de campo a una capa, en un paso', { placeholder: 'title' });
  shot(s, '08_gps_excel.jpg', MX + 0.06, 1.95, 5.95, 'Puntos de un Excel importado, en una tabla que se puede corregir');
  shot(s, '10_carga_capa_gps.jpg', 6.85 + 0.06, 1.95, 5.95, 'La capa creada a partir del Excel, lista para revisar');
  caption(s, 'Se ve y se corrige ahí mismo', 'Los puntos del Excel aparecen en una tabla: se cambian o se eliminan fila por fila.', MX + 0.06, 5.5, 5.9);
  caption(s, 'Se convierte en una capa', 'Con un clic queda lista para revisar y publicar como cualquier otro estudio.', 6.91, 5.5, 5.9);
  s.addNotes('Mostrar la plantilla de Excel con las columnas Nombre, X, Y y Autor. Al importarla, los puntos se pueden corregir y se crea una capa lista para revisión.');

  /* ===== 11. Control ===== */
  pres.addSection({ title: 'Control y alcance' });
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Control y alcance' });
  kicker(s, 'CONTROL DEL CENTRO');
  s.addText('Nada se publica sin su aprobación', { placeholder: 'title' });
  const flow = [['Subido', C.accent6, C.text1], ['En revisión', C.accent6, C.text1], ['Aprobado', C.accent6, C.text1], ['Publicado', C.text1, C.background1]];
  const fw = 1.75, fg = 0.38, fx = MX, fy = 1.95;
  const arr = await icon('LuChevronRight', GOLD_HEX);
  flow.forEach(([t, fill, col], i) => {
    const x = fx + i * (fw + fg);
    s.addShape(pres.ShapeType.roundRect, { x, y: fy, w: fw, h: 0.55, rectRadius: 0.1, fill: { color: fill }, objectName: 'Paso: ' + t });
    s.addText(t, { x, y: fy, w: fw, h: 0.55, fontSize: 15, bold: true, color: col, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    if (i < flow.length - 1) s.addImage({ data: arr, x: x + fw + 0.05, y: fy + 0.13, w: 0.28, h: 0.28, altText: '', objectName: 'Flecha' });
  });
  s.addText('o', { x: 9.4, y: fy, w: 0.4, h: 0.55, fontSize: 15, color: C.accent5, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
  s.addShape(pres.ShapeType.roundRect, { x: 9.85, y: fy, w: 2.88, h: 0.55, rectRadius: 0.1, fill: { color: C.accent1 }, objectName: 'Paso: Regresa con comentarios' });
  s.addText('Regresa con comentarios', { x: 9.85, y: fy, w: 2.88, h: 0.55, fontSize: 15, bold: true, color: C.text1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
  shot(s, '06_revision.jpg', MX + 0.06, 2.9, 6.6, 'Pantalla de revisión con la capa, su mapa y su ficha');
  steps(s, [
    ['Una persona decide', 'El responsable que el Centro designe revisa cada capa con su mapa y su ficha.'],
    ['Correcciones claras', 'Si algo falta, la capa regresa a quien la subió con un comentario.'],
    ['Todo queda registrado', 'Cada decisión queda en el historial de la capa.']
  ], 7.75, 2.95, 5.0, 1.3);
  s.addNotes('Insistir en que el Centro decide: nadie publica por su cuenta. Mostrar la pantalla de revisión con el mapa y la ficha de la capa.');

  /* ===== 12. Lo que reciben ===== */
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Control y alcance' });
  kicker(s, 'LO QUE RECIBEN');
  s.addText('Lo que ya pueden usar y lo que llega al ponerlo en línea', { placeholder: 'title' });
  const cols = [
    ['Ya funciona hoy', 'LuCircleCheck', C.accent3, ['Mapa con búsqueda, consulta y medición', 'Catálogo de estudios con su ficha', 'Subida de archivos con revisión y vista previa', 'Registro de puntos de campo con foto', 'Importación de Excel con tabla editable', 'Pantalla de revisión y aprobación']],
    ['Al ponerlo en línea en el Centro', 'LuRocket', C.text2, ['Cuentas para el personal autorizado', 'Información guardada de forma permanente', 'Puntos de campo compartidos entre el equipo', 'Publicación abierta al público', 'Historial permanente de lo que se sube y se aprueba']],
    ['No incluye en esta etapa', 'LuCircleMinus', C.accent4, ['Análisis especializados sobre los mapas', 'Registro de recorridos de campo', 'Conexión con sistemas de otras instituciones', 'El geoportal organiza la información; las conclusiones siguen siendo de sus especialistas']]
  ];
  const colw = 3.9, colg = 0.2, coly = 2.05, colh = 4.75;
  for (let i = 0; i < cols.length; i++) {
    const x = MX + i * (colw + colg);
    card(s, x, coly, colw, colh);
    await iconBadge(s, cols[i][1], x + 0.3, coly + 0.3, 0.6);
    s.addText(cols[i][0], { x: x + 1.05, y: coly + 0.3, w: colw - 1.3, h: 0.6, fontSize: 17, bold: true, color: cols[i][2], margin: 0, valign: 'middle', isTextBox: true });
    s.addText(cols[i][3].map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < cols[i][3].length - 1 } })), { x: x + 0.3, y: coly + 1.15, w: colw - 0.6, h: colh - 1.35, fontSize: 14, color: C.text1, margin: 0, valign: 'top', paraSpaceAfter: 8, isTextBox: true });
  }
  s.addNotes('Dejar claro el alcance: qué funciona hoy, qué llega al ponerlo en línea y qué no se incluye en esta etapa.');

  /* ===== 13. Apuesta segura ===== */
  s = pres.addSlide({ masterName: 'CONTENIDO', sectionTitle: 'Control y alcance' });
  kicker(s, 'POR QUÉ ES UNA APUESTA SEGURA');
  s.addText('No es una idea en papel: ya funciona', { placeholder: 'title' });
  const razones = [
    ['LuCirclePlay', 'Funciona hoy', 'Las secciones que vieron se pueden usar ya, con datos públicos de ejemplo.'],
    ['LuBadgeDollarSign', 'Sin pago de licencias', 'No hay costos por usuario ni renovaciones anuales de software.'],
    ['LuHouse', 'Su información es suya', 'Vivirá en un equipo del Centro, no en un servicio externo.'],
    ['LuSmile', 'Fácil de adoptar', 'Se abre desde cualquier computadora o celular y habla en español claro.']
  ];
  const zw = 5.95, zh = 2.05, zg = 0.2;
  for (let i = 0; i < razones.length; i++) {
    const x = MX + (i % 2) * (zw + zg), y = 2.1 + Math.floor(i / 2) * (zh + zg);
    card(s, x, y, zw, zh);
    await iconBadge(s, razones[i][0], x + 0.35, y + 0.4, 0.8);
    s.addText(razones[i][1], { x: x + 1.5, y: y + 0.35, w: zw - 1.8, h: 0.5, fontSize: 20, bold: true, color: C.text1, margin: 0, isTextBox: true });
    s.addText(razones[i][2], { x: x + 1.5, y: y + 0.9, w: zw - 1.8, h: 1.0, fontSize: 15, color: C.accent5, margin: 0, valign: 'top', isTextBox: true });
  }
  s.addNotes('Cuatro razones: ya funciona, no genera pagos de licencias, la información queda en el Centro y es sencillo de usar.');

  /* ===== 14. Siguiente paso ===== */
  pres.addSection({ title: 'Cierre' });
  s = pres.addSlide({ masterName: 'OSCURO', sectionTitle: 'Cierre' });
  s.addText('SIGUIENTE PASO', { x: MX, y: 0.8, w: 6, h: 0.3, fontSize: 12, bold: true, color: C.accent1, charSpacing: 3, margin: 0, isTextBox: true });
  s.addText('Con su aprobación, lo ponemos en línea', { placeholder: 'title' });
  s.addText('DeltaMap-CEDESU, funcionando para el Centro.', { x: MX, y: 3.5, w: 6.2, h: 0.5, fontSize: 18, color: C.accent1, margin: 0, isTextBox: true });
  s.addText('Gracias. ¿Preguntas?', { x: MX, y: 5.0, w: 6.4, h: 0.6, fontSize: 24, color: C.background2, margin: 0, isTextBox: true });
  s.addImage({ path: path.join(__dirname, 'logo_uacam.png'), x: MX, y: 5.95, w: 0.7, h: 0.7, altText: 'Escudo de la Universidad Autónoma de Campeche', objectName: 'Logo UACAM' });
  s.addImage({ path: path.join(__dirname, 'logo_cedesu.png'), x: MX + 0.9, y: 5.95, w: 0.7, h: 0.7, altText: 'Logotipo del CEDESU', objectName: 'Logo CEDESU' });
  s.addText('Lo que necesitamos del Centro', { x: 7.7, y: 0.9, w: 5, h: 0.4, fontSize: 16, bold: true, color: C.accent1, margin: 0, isTextBox: true });
  const needs = [
    ['Aprobar la siguiente etapa', 'Para instalar el geoportal y abrirlo a su personal.'],
    ['Definir dónde vivirá', 'El equipo o servidor del Centro o de la Universidad.'],
    ['Designar responsables', 'Quién revisa y aprueba lo que se publica.'],
    ['Compartir los primeros estudios', 'Para cargarlos y que el Centro vea su propia información.']
  ];
  needs.forEach(([t, d], i) => {
    const y = 1.6 + i * 1.35;
    numberDot(s, i + 1, 7.7, y);
    s.addText(t, { x: 8.35, y: y - 0.02, w: 4.4, h: 0.4, fontSize: 18, bold: true, color: C.background1, margin: 0, valign: 'middle', isTextBox: true });
    s.addText(d, { x: 8.35, y: y + 0.4, w: 4.4, h: 0.7, fontSize: 14, color: C.background2, margin: 0, valign: 'top', isTextBox: true });
  });
  s.addNotes('Cerrar con las cuatro decisiones que necesitamos del Centro para pasar a la siguiente etapa.');

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('Presentación escrita:', OUT);
})().catch(e => { console.error(e); process.exit(1); });
