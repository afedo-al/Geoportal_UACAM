"""Genera las capturas de pantalla de la presentación a partir de la app local (servidor de desarrollo en :5174).
Carga datos reales de web/public/data, completa los estudios, envía a revisión, publica y captura cada pantalla."""
import re, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
import openpyxl
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'capturas'
OUT.mkdir(exist_ok=True)
DATA = ROOT / 'web' / 'public' / 'data'
URL = 'http://127.0.0.1:5174/'
EXCEL = OUT / 'muestras_campo_ejemplo.xlsx'

# --- Excel de ejemplo con puntos reales de Campeche ---
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Puntos'
ws.append(['Name', 'X', 'Y', 'Autor'])
for r in [
    ('Muestra de suelo 01', -90.5231, 19.8452, 'Brigada de campo A'), ('Muestra de suelo 02', -90.5410, 19.8127, 'Brigada de campo A'),
    ('Muestra de agua 01', -90.7210, 19.3502, 'Brigada de campo B'), ('Muestra de agua 02', -90.7012, 19.3688, 'Brigada de campo B'),
    ('Observación de fauna 01', -89.3944, 18.5072, 'Brigada de campo C'), ('Observación de fauna 02', -89.4210, 18.4890, 'Brigada de campo C'),
    ('Observación de flora 01', -90.7390, 18.6094, 'Brigada de campo C'), ('Punto de referencia 01', -91.8221, 18.6490, 'Brigada de campo B'),
    ('Punto de referencia 02', -90.0510, 20.3710, 'Brigada de campo A'), ('Inicio de transecto 01', -89.8450, 19.7460, 'Brigada de campo A'),
    ('Fin de transecto 01', -89.8120, 19.7710, 'Brigada de campo A'), ('Muestra de suelo 03', -90.1330, 20.1770, 'Brigada de campo B'),
]:
    ws.append(list(r))
wb.save(EXCEL)

def jpg(png_path, quality=88):
    im = Image.open(png_path).convert('RGB'); im.save(png_path.with_suffix('.jpg'), quality=quality, optimize=True); png_path.unlink()

def shot(page, name, **kw):
    p = OUT / f'{name}.png'
    page.screenshot(path=str(p), **kw); jpg(p); print('captura', name)

def wait_tiles(page, ms=4500):
    page.wait_for_timeout(ms)

def login(page):
    page.goto(URL + '#/bienvenida'); page.wait_for_timeout(1500)
    page.get_by_role('button', name='Iniciar sesión').first.click(); page.wait_for_timeout(500)
    page.get_by_role('button', name='Usar esta cuenta').click(); page.wait_for_timeout(300)
    page.get_by_role('button', name='Entrar').click(); page.wait_for_timeout(1500)

def store_url(page, name):
    return page.evaluate("n => performance.getEntriesByType('resource').map(r => r.name).filter(x => new RegExp('/src/' + n + '\\\\.js').test(x)).at(-1)", name)

HIDE = "(() => { const s = document.createElement('style'); s.textContent = '.mode-banner, .toast-host, [data-toast], .toasts { display: none !important; }'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); })();"

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1600, 'height': 900}, device_scale_factor=1.5, locale='es-MX')
    ctx.add_init_script(HIDE)
    page = ctx.new_page()
    page.on('pageerror', lambda e: print('PAGEERROR', e))

    # 1. Portada pública
    page.goto(URL + '#/bienvenida'); wait_tiles(page, 7000)
    shot(page, '01_inicio')

    # 2. Acceso
    login(page)

    # 3. Carga: dos capas reales
    page.goto(URL + '#/carga'); page.wait_for_timeout(1500)
    page.locator('input[type=file]').first.set_input_files([str(DATA / 'municipios_qroo_2015.geojson'), str(DATA / 'mexico_entidades.geojson')])
    page.wait_for_timeout(6000)
    up0 = store_url(page, 'stores/upload')
    page.evaluate("""async (up) => { const U = await import(up);
      for (const it of U.batch.items) { it.layerName = /municipios/i.test(it.layerName) ? 'Municipios de Quintana Roo (2015)' : 'Entidades federativas de México'; } }""", up0)
    page.wait_for_timeout(800)
    # completar el estudio de cada capa
    up = store_url(page, 'stores/upload'); st = store_url(page, 'stores/studies')
    page.evaluate("""async ([up, st]) => {
      const S = await import(st);
      const info = {
        'municipios de quintana roo (2015)': { sTitle: 'Municipios de Quintana Roo (2015)', sTheme: 'División territorial', sResp: 'CEDESU · UACAM', sSource: 'Cartografía regional', sLic: 'CC BY 4.0', sAccess: 'Pública', sDesc: 'Límites de los 11 municipios de Quintana Roo con población, superficie y densidad.' },
        'entidades federativas de méxico': { sTitle: 'Entidades federativas de México', sTheme: 'División territorial', sResp: 'CEDESU · UACAM', sSource: 'Cartografía nacional', sLic: 'CC BY 4.0', sAccess: 'Pública', sDesc: 'Límites de las 32 entidades federativas con su superficie.' }
      };
      for (const r of S.studies.list) { const v = info[r.layerName.toLowerCase()]; if (v) S.saveStudy(r.id, { sDate: '2026-10-18', sLineage: 'Datos oficiales simplificados para su consulta en pantalla.', sKeywords: 'municipios, límites, territorio', ...v }); }
    }""", [up, st])
    page.wait_for_timeout(1200)
    page.get_by_text('Municipios de Quintana Roo (2015)').first.click(); page.wait_for_timeout(2500)
    shot(page, '03_carga')

    # 4. Enviar a revisión
    page.get_by_role('button', name=re.compile('Enviar a revisión')).first.click(); page.wait_for_timeout(700)
    page.locator('dialog[open]').get_by_role('button', name='Enviar', exact=True).click(); page.wait_for_timeout(1500)
    page.get_by_role('button', name='Revisión').first.click(); page.wait_for_timeout(2500)
    page.locator('.review-list li').filter(has_text='Municipios').first.click(); page.wait_for_timeout(5000)
    shot(page, '06_revision')

    # 5. Aprobar y publicar ambas
    for _ in range(2):
        page.locator('.review-list li').first.click(); page.wait_for_timeout(1200)
        page.get_by_role('button', name='Aprobar', exact=True).click(); page.wait_for_timeout(1000)
        page.locator('input[name=revFilter][value=aprobada]').check(force=True); page.wait_for_timeout(1000)
        page.locator('.review-list li').first.click(); page.wait_for_timeout(1000)
        page.get_by_role('button', name='Publicar', exact=True).click(); page.wait_for_timeout(600)
        page.locator('dialog[open]').get_by_role('button', name='Publicar', exact=True).click(); page.wait_for_timeout(1500)
        page.locator('input[name=revFilter][value=en_revision]').check(force=True); page.wait_for_timeout(800)

    # 6. Catálogo y ficha
    page.get_by_role('button', name=re.compile('Catálogo')).first.click(); page.wait_for_timeout(2500)
    page.evaluate("document.querySelectorAll('.cat-row').forEach(r => { if (/Referencia/.test(r.querySelector('h2')?.innerText || '')) r.remove(); })")
    page.wait_for_timeout(300)
    shot(page, '04_catalogo')
    page.locator('[data-act=meta]').first.click(); page.wait_for_timeout(1500)
    shot(page, '05_ficha')
    page.keyboard.press('Escape'); page.wait_for_timeout(600)

    # 7. Mapa con la capa publicada y un clic
    page.locator('.cat-row').filter(has_text='Publicada').filter(has_text='Municipios de Quintana Roo').first.locator('[data-act=map]').click(); page.wait_for_timeout(6000)
    shot(page, '02_mapa_capas')
    # clic sobre un municipio
    box = page.locator('#olMap').bounding_box()
    page.mouse.click(box['x'] + box['width'] * 0.50, box['y'] + box['height'] * 0.55); page.wait_for_timeout(2500)
    shot(page, '02_mapa_consulta')
    # capa de clima sobre la península
    lay = store_url(page, 'stores/layers')
    page.evaluate("async (u) => { const L = await import(u); L.toggleLayer('qgisClimas', true); }", lay)
    page.wait_for_timeout(1500)
    page.locator('input[type=search]').first.fill('Campeche'); page.wait_for_timeout(1200)
    page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); page.wait_for_timeout(5000)
    for _ in range(4):
        page.mouse.move(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5); page.mouse.wheel(0, 500); page.wait_for_timeout(700)
    page.wait_for_timeout(4500)
    shot(page, '02_mapa_clima')

    # 8. Captura GPS con Excel
    page.goto(URL + '#/gps'); page.wait_for_timeout(2500)
    shot(page, '07_gps_formulario')
    page.locator('.gps-import input[type=file]').set_input_files(str(EXCEL)); page.wait_for_timeout(3500)
    page.locator('.gps-points').scroll_into_view_if_needed(); page.wait_for_timeout(500)
    page.locator('.gps-sources .chip-btn').filter(has_text='muestras_campo').first.click(); page.wait_for_timeout(800)
    page.locator('.gps-points').scroll_into_view_if_needed(); page.wait_for_timeout(400)
    page.evaluate("window.scrollBy(0, -160)"); page.wait_for_timeout(300)
    shot(page, '08_gps_excel')
    # mapa de puntos arriba
    page.evaluate("document.querySelectorAll('.page, .screen, main').forEach(e => e.scrollTo && e.scrollTo(0, 0)); window.scrollTo(0, 0)"); page.wait_for_timeout(2000)
    shot(page, '09_gps_mapa')

    # 9. Capa creada desde el Excel en Carga
    page.goto(URL + '#/carga'); page.wait_for_timeout(2500)
    shot(page, '10_carga_capa_gps')
    ctx.storage_state(path=str(OUT / 'estado.json'))
    browser.close()

    # 10. Celular
    browser = pw.chromium.launch(channel='chrome', headless=True)
    iphone = {'width': 390, 'height': 844}
    mctx = browser.new_context(viewport=iphone, device_scale_factor=3, is_mobile=True, has_touch=True, locale='es-MX')
    mctx.add_init_script(HIDE)
    m = mctx.new_page()
    m.goto(URL + '#/bienvenida'); m.wait_for_timeout(1000)
    m.evaluate("localStorage.setItem('cedesuWelcomeVisitedV3','1')")
    m.goto(URL + '#/'); m.wait_for_timeout(5000)
    lay = store_url(m, 'stores/layers')
    m.evaluate("async (u) => { const L = await import(u); L.toggleLayer('qgisClimas', true); }", lay)
    m.wait_for_timeout(7000)
    shot(m, 'm1_mapa')
    login(m)
    m.goto(URL + '#/gps'); m.wait_for_timeout(3000)
    m.locator('.gps-import input[type=file]').set_input_files(str(EXCEL)); m.wait_for_timeout(3500)
    m.evaluate("document.querySelectorAll('.page, .screen, main').forEach(e => e.scrollTo && e.scrollTo(0, 0)); window.scrollTo(0, 0)"); m.wait_for_timeout(800)
    shot(m, 'm2_gps')
    m.locator('.gps-points').scroll_into_view_if_needed(); m.wait_for_timeout(800)
    shot(m, 'm3_gps_puntos')
    browser.close()
print('LISTO')
