import base64
import io
import tempfile
from pathlib import Path

from django.test import TestCase, override_settings
from PIL import Image

from cuentas.models import ADMIN
from nucleo.models import RegistroBitacora
from nucleo.pruebas import ClienteApi, cliente_de

from .models import Punto

BASE = {'name': 'Muestra de suelo 01', 'lat': 19.8452, 'lon': -90.5231, 'type': 'Muestra de suelo', 'date': '2026-11-20', 'time': '10:30'}


def imagen(formato='PNG', tam=(8, 6), exif=False):
    """Una imagen de prueba como data URL. Con `exif` el JPEG lleva una ubicación GPS incrustada."""
    salida = io.BytesIO()
    im = Image.new('RGB', tam, (200, 30, 30))
    opciones = {}
    if exif:
        datos = Image.Exif()
        datos[0x010F] = 'CamaraDePrueba'
        gps = datos.get_ifd(0x8825)
        gps[1], gps[2], gps[3], gps[4] = 'N', (19.0, 50.0, 40.0), 'W', (90.0, 31.0, 23.0)
        opciones['exif'] = datos
    im.save(salida, format=formato, **opciones)
    mime = {'PNG': 'png', 'JPEG': 'jpeg', 'WEBP': 'webp'}[formato]
    return f'data:image/{mime};base64,' + base64.b64encode(salida.getvalue()).decode()


def leer(cliente, ruta):
    """GET de una fotografía: lee el contenido y cierra la respuesta (en Windows un archivo abierto no se puede borrar)."""
    r = cliente.get(ruta)
    contenido = b''.join(r.streaming_content) if r.status_code == 200 else b''
    r.close()
    return r, contenido


class PuntosBase(TestCase):
    def setUp(self):
        self._carpeta = tempfile.TemporaryDirectory()
        self.addCleanup(self._carpeta.cleanup)
        configuracion = override_settings(DATA_DIR=Path(self._carpeta.name))
        configuracion.enable()
        self.addCleanup(configuracion.disable)
        self.ana = cliente_de('ana')

    def crear(self, cliente=None, **extra):
        return (cliente or self.ana).post('/api/puntos', {**BASE, **extra})


class AccesoTest(PuntosBase):
    def test_sin_sesion_no_hay_acceso_a_nada(self):
        anonimo = ClienteApi()
        self.assertEqual(anonimo.get('/api/puntos').status_code, 401)
        self.assertEqual(anonimo.post('/api/puntos', BASE).status_code, 401)
        self.assertEqual(anonimo.post('/api/puntos/lote', {'puntos': [BASE]}).status_code, 401)
        self.assertEqual(anonimo.get('/api/puntos/P-1/foto').status_code, 401)
        self.assertEqual(Punto.objects.count(), 0)

    def test_metodos_no_permitidos(self):
        self.assertEqual(self.ana.get('/api/puntos/lote').status_code, 405)
        self.assertEqual(self.ana.delete('/api/puntos').status_code, 405)

    def test_sin_la_cabecera_de_la_aplicacion_no_se_crea(self):
        c = ClienteApi(ajax=False)
        c.http.cookies = self.ana.http.cookies
        self.assertEqual(c.post('/api/puntos', BASE).status_code, 403)


class CrearYLeerTest(PuntosBase):
    def test_crear_devuelve_el_punto_con_id_del_servidor(self):
        r = self.crear(id='ID-DEL-CLIENTE', **{'altitude': 12.5, 'property': 'Parcela A', 'author': 'Brigada A', 'description': 'Suelo arcilloso'})
        self.assertEqual(r.status_code, 201)
        p = r.json()
        self.assertRegex(p['id'], r'^P-[0-9a-f]{10}$')
        self.assertEqual((p['name'], p['lat'], p['lon'], p['altitude']), ('Muestra de suelo 01', 19.8452, -90.5231, 12.5))
        self.assertEqual((p['property'], p['author'], p['type'], p['description'], p['date'], p['time']), ('Parcela A', 'Brigada A', 'Muestra de suelo', 'Suelo arcilloso', '2026-11-20', '10:30'))
        self.assertEqual((p['photo'], p['creadoPor']), ('', 'ana'))

    def test_la_lista_la_ve_todo_el_equipo(self):
        self.crear()
        luis = cliente_de('luis')
        nombres = [p['name'] for p in luis.get('/api/puntos').json()['puntos']]
        self.assertEqual(nombres, ['Muestra de suelo 01'])

    def test_los_valores_por_omision(self):
        r = self.ana.post('/api/puntos', {'lat': 19.8, 'lon': -90.5})
        p = r.json()
        self.assertEqual((p['name'], p['type'], p['altitude'], p['date'], p['time']), ('Punto sin nombre', 'Punto de referencia', None, '', ''))

    def test_acepta_coma_decimal_y_texto_numerico(self):
        p = self.crear(lat='19,8452', lon='-90,5231', altitude='1 2'.replace(' ', '')).json()
        self.assertEqual((p['lat'], p['lon'], p['altitude']), (19.8452, -90.5231, 12.0))

    def test_los_caracteres_de_control_se_quitan(self):
        p = self.crear(name='Sitio\x00 \x07uno\n').json()
        self.assertEqual(p['name'], 'Sitio   uno')

    def test_queda_en_la_bitacora(self):
        p = self.crear().json()
        r = RegistroBitacora.objects.get(evento='punto_creado')
        self.assertEqual((r.usuario_texto, r.detalle['punto']), ('ana', p['id']))


class ValidacionTest(PuntosBase):
    def assert422(self, respuesta, campo=None):
        self.assertEqual(respuesta.status_code, 422, respuesta.content)
        if campo:
            self.assertEqual(respuesta.json().get('campo'), campo)
        self.assertEqual(Punto.objects.count(), 0)

    def test_coordenadas_fuera_del_area_de_trabajo(self):
        self.assert422(self.crear(lat=40.0), 'lat')
        self.assert422(self.crear(lon=-100.0), 'lon')
        self.assert422(self.crear(lat=13.99), 'lat')

    def test_coordenadas_que_no_son_numeros(self):
        for malo in ('abc', None, True, [], {}, float('nan')):
            self.assertIn(self.crear(lat=malo).status_code, (400, 422), malo)
        self.assertEqual(Punto.objects.count(), 0)

    def test_faltan_coordenadas(self):
        self.assert422(self.ana.post('/api/puntos', {'name': 'x', 'lon': -90.5}), 'lat')
        self.assert422(self.ana.post('/api/puntos', {'name': 'x', 'lat': 19.8}), 'lon')

    def test_altitud_fuera_de_rango_o_no_numerica(self):
        self.assert422(self.crear(altitude=9001), 'altitude')
        self.assert422(self.crear(altitude=-501), 'altitude')
        self.assert422(self.crear(altitude='alta'), 'altitude')

    def test_altitud_en_los_limites_se_acepta(self):
        self.assertEqual(self.crear(altitude=9000).status_code, 201)
        self.assertEqual(self.crear(altitude=-500).status_code, 201)
        self.assertEqual(self.crear(altitude='').json()['altitude'], None)

    def test_fecha_y_hora_invalidas(self):
        self.assert422(self.crear(date='20/11/2026'), 'date')
        self.assert422(self.crear(date='2026-02-30'), 'date')
        self.assert422(self.crear(time='25:00'), 'time')
        self.assert422(self.crear(time='mediodia'), 'time')

    def test_textos_demasiado_largos(self):
        self.assert422(self.crear(name='n' * 121), 'name')
        self.assert422(self.crear(description='d' * 1001), 'description')
        self.assertEqual(self.crear(name='n' * 120).status_code, 201)

    def test_cuerpo_que_no_es_json_o_no_es_un_objeto(self):
        r = self.ana.http.post('/api/puntos', data='no es json', content_type='application/json', HTTP_X_CSRFTOKEN=self.ana._extra()['HTTP_X_CSRFTOKEN'], HTTP_X_REQUESTED_WITH='GeoportalCEDESU')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.ana.post('/api/puntos', [1, 2]).status_code, 400)
        r = self.ana.http.post('/api/puntos', data='lat=1', content_type='application/x-www-form-urlencoded', HTTP_X_CSRFTOKEN=self.ana._extra()['HTTP_X_CSRFTOKEN'], HTTP_X_REQUESTED_WITH='GeoportalCEDESU')
        self.assertEqual(r.status_code, 415)


class EditarYBorrarTest(PuntosBase):
    def setUp(self):
        super().setUp()
        self.id = self.crear(**{'altitude': 10, 'property': 'Parcela A', 'author': 'Brigada A'}).json()['id']

    def test_editar_solo_lo_que_se_manda(self):
        r = self.ana.put(f'/api/puntos/{self.id}', {'name': 'Otro nombre'})
        self.assertEqual(r.status_code, 200)
        p = r.json()
        self.assertEqual((p['name'], p['lat'], p['altitude'], p['property'], p['author'], p['type']), ('Otro nombre', 19.8452, 10.0, 'Parcela A', 'Brigada A', 'Muestra de suelo'))

    def test_editar_con_datos_invalidos_no_cambia_nada(self):
        self.assertEqual(self.ana.put(f'/api/puntos/{self.id}', {'lat': 50}).status_code, 422)
        self.assertEqual(self.ana.get(f'/api/puntos/{self.id}').json()['lat'], 19.8452)

    def test_vaciar_la_altitud(self):
        self.assertIsNone(self.ana.put(f'/api/puntos/{self.id}', {'altitude': None}).json()['altitude'])

    def test_el_id_no_se_puede_cambiar(self):
        self.ana.put(f'/api/puntos/{self.id}', {'id': 'P-otro', 'name': 'x'})
        self.assertEqual(self.ana.get(f'/api/puntos/{self.id}').status_code, 200)
        self.assertEqual(self.ana.get('/api/puntos/P-otro').status_code, 404)

    def test_otra_persona_de_investigacion_no_puede_modificar_ni_borrar(self):
        luis = cliente_de('luis')
        self.assertEqual(luis.put(f'/api/puntos/{self.id}', {'name': 'x'}).status_code, 403)
        self.assertEqual(luis.delete(f'/api/puntos/{self.id}').status_code, 403)
        self.assertEqual(Punto.objects.get(pk=self.id).nombre, 'Muestra de suelo 01')

    def test_la_administracion_si_puede(self):
        admin = cliente_de('maria', rol=ADMIN)
        self.assertEqual(admin.put(f'/api/puntos/{self.id}', {'name': 'Corregido'}).status_code, 200)
        self.assertEqual(admin.delete(f'/api/puntos/{self.id}').status_code, 204)

    def test_borrar_y_volver_a_pedir(self):
        self.assertEqual(self.ana.delete(f'/api/puntos/{self.id}').status_code, 204)
        self.assertEqual(self.ana.get(f'/api/puntos/{self.id}').status_code, 404)
        self.assertEqual(self.ana.delete(f'/api/puntos/{self.id}').status_code, 404)
        self.assertTrue(RegistroBitacora.objects.filter(evento='punto_eliminado').exists())

    def test_ids_con_formato_raro_dan_404(self):
        for malo in ('..%2F..%2Fetc', 'a b', 'x' * 60, '%00'):
            self.assertEqual(self.ana.get(f'/api/puntos/{malo}').status_code, 404, malo)


class LoteTest(PuntosBase):
    def lote(self, filas, cliente=None):
        return (cliente or self.ana).post('/api/puntos/lote', {'puntos': filas})

    def test_importa_varios_puntos(self):
        r = self.lote([{**BASE, 'name': f'P{i}', 'id': 'EXCEL-1'} for i in range(3)])
        self.assertEqual(r.status_code, 201)
        puntos = r.json()['puntos']
        self.assertEqual([p['name'] for p in puntos], ['P0', 'P1', 'P2'])
        self.assertEqual(len({p['id'] for p in puntos}), 3)         # el servidor ignora los ids del cliente
        self.assertEqual(Punto.objects.count(), 3)
        evento = RegistroBitacora.objects.get(evento='puntos_importados')
        self.assertEqual(evento.detalle['cantidad'], 3)

    def test_todo_o_nada(self):
        r = self.lote([BASE, {**BASE, 'lat': 80}, BASE])
        self.assertEqual(r.status_code, 422)
        self.assertIn('Fila 2', r.json()['detalle'])
        self.assertEqual(r.json()['fila'], 2)
        self.assertEqual(Punto.objects.count(), 0)

    def test_limites_del_lote(self):
        self.assertEqual(self.lote([]).status_code, 400)
        self.assertEqual(self.ana.post('/api/puntos/lote', {'puntos': 'no'}).status_code, 400)
        with override_settings(PUNTOS_MAX_POR_LOTE=2):
            self.assertEqual(self.lote([BASE] * 3).status_code, 413)
        self.assertEqual(Punto.objects.count(), 0)

    def test_una_fila_que_no_es_objeto(self):
        self.assertEqual(self.lote([BASE, 'texto']).status_code, 400)
        self.assertEqual(Punto.objects.count(), 0)

    def test_la_foto_invalida_se_descarta_sin_impedir_la_importacion(self):
        r = self.lote([{**BASE, 'photo': imagen()}, {**BASE, 'photo': 'https://externo.test/x.png'}, {**BASE, 'photo': ''}])
        self.assertEqual(r.status_code, 201)
        cuerpo = r.json()
        self.assertEqual(cuerpo['fotosDescartadas'], 1)
        self.assertEqual([bool(p['photo']) for p in cuerpo['puntos']], [True, False, False])


class FotosTest(PuntosBase):
    def test_crear_con_foto_y_servirla_de_forma_segura(self):
        p = self.crear(photo=imagen('PNG')).json()
        self.assertEqual(p['photo'], f"puntos/{p['id']}/foto")
        r, contenido = leer(self.ana, '/api/' + p['photo'])
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'image/png')
        self.assertEqual(r['Content-Security-Policy'], 'sandbox')
        self.assertEqual(r['X-Content-Type-Options'], 'nosniff')
        self.assertTrue(r['Cache-Control'].startswith('private'))
        Image.open(io.BytesIO(contenido)).verify()

    def test_las_fotos_solo_las_ve_quien_tiene_sesion(self):
        p = self.crear(photo=imagen()).json()
        self.assertEqual(ClienteApi().get('/api/' + p['photo']).status_code, 401)

    def test_se_aceptan_jpeg_y_webp(self):
        for formato, tipo in (('JPEG', 'image/jpeg'), ('WEBP', 'image/webp')):
            p = self.crear(photo=imagen(formato)).json()
            self.assertEqual(leer(self.ana, '/api/' + p['photo'])[0]['Content-Type'], tipo)

    def test_se_quitan_los_metadatos_de_ubicacion(self):
        original = imagen('JPEG', exif=True)
        crudo = base64.b64decode(original.split(',', 1)[1])
        self.assertTrue(Image.open(io.BytesIO(crudo)).getexif().get_ifd(0x8825))      # la imagen de prueba sí trae GPS
        p = self.crear(photo=original).json()
        guardado = leer(self.ana, '/api/' + p['photo'])[1]
        exif = Image.open(io.BytesIO(guardado)).getexif()
        self.assertFalse(exif.get_ifd(0x8825))
        self.assertNotIn(0x010F, exif)

    def test_el_tipo_declarado_debe_coincidir_con_el_contenido(self):
        jpeg_como_png = imagen('JPEG').replace('image/jpeg', 'image/png')
        self.assertEqual(self.crear(photo=jpeg_como_png).status_code, 422)

    def test_no_se_aceptan_svg_html_ni_otros_tipos(self):
        svg = 'data:image/svg+xml;base64,' + base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').decode()
        html = 'data:text/html;base64,' + base64.b64encode(b'<script>alert(1)</script>').decode()
        gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
        for malo in (svg, html, gif, 'https://externo.test/x.png', 'javascript:alert(1)', 'puntos/P-1/foto'):
            self.assertEqual(self.crear(photo=malo).status_code, 422, malo[:40])
        self.assertEqual(Punto.objects.count(), 0)

    def test_contenido_que_no_es_una_imagen(self):
        falso = 'data:image/png;base64,' + base64.b64encode(b'MZ\x90\x00 esto no es un png').decode()
        self.assertEqual(self.crear(photo=falso).status_code, 422)
        self.assertEqual(self.crear(photo='data:image/png;base64,@@@@').status_code, 422)
        self.assertEqual(self.crear(photo=12345).status_code, 422)

    def test_limite_de_2_mb(self):
        grande = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG' + b'0' * (2 * 1024 * 1024 + 10)).decode()
        r = self.crear(photo=grande)
        self.assertEqual(r.status_code, 422)
        self.assertIn('2 MB', r.json()['detalle'])

    @override_settings(FOTO_MAX_PIXELES=10)
    def test_limite_de_resolucion(self):
        self.assertEqual(self.crear(photo=imagen(tam=(8, 6))).status_code, 422)

    def test_una_foto_invalida_no_deja_el_punto_a_medias(self):
        self.crear(photo='data:image/png;base64,@@@')
        self.assertEqual(Punto.objects.count(), 0)
        self.assertEqual(list((Path(self._carpeta.name) / 'fotos').glob('*')) if (Path(self._carpeta.name) / 'fotos').exists() else [], [])

    def test_conservar_quitar_y_reemplazar_la_foto(self):
        p = self.crear(photo=imagen('PNG')).json()
        carpeta = Path(self._carpeta.name) / 'fotos'
        self.assertEqual(len(list(carpeta.glob('*.png'))), 1)

        # sin la clave «photo» se conserva
        self.assertTrue(self.ana.put(f"/api/puntos/{p['id']}", {'name': 'x'}).json()['photo'])
        # imagen nueva de otro formato: reemplaza y borra el archivo anterior
        r = self.ana.put(f"/api/puntos/{p['id']}", {'photo': imagen('JPEG')})
        self.assertEqual(leer(self.ana, '/api/' + r.json()['photo'])[0]['Content-Type'], 'image/jpeg')
        self.assertEqual((len(list(carpeta.glob('*.png'))), len(list(carpeta.glob('*.jpg')))), (0, 1))
        # vacía: la quita
        self.assertEqual(self.ana.put(f"/api/puntos/{p['id']}", {'photo': ''}).json()['photo'], '')
        self.assertEqual(list(carpeta.glob('*.*')), [])
        self.assertEqual(self.ana.get(f"/api/puntos/{p['id']}/foto").status_code, 404)

    def test_una_foto_invalida_al_editar_no_cambia_la_actual(self):
        p = self.crear(photo=imagen('PNG')).json()
        self.assertEqual(self.ana.put(f"/api/puntos/{p['id']}", {'photo': 'data:image/png;base64,@@@'}).status_code, 422)
        self.assertEqual(leer(self.ana, '/api/' + p['photo'])[0].status_code, 200)

    def test_borrar_el_punto_borra_su_foto(self):
        p = self.crear(photo=imagen()).json()
        carpeta = Path(self._carpeta.name) / 'fotos'
        self.assertEqual(len(list(carpeta.glob('*.png'))), 1)
        self.ana.delete(f"/api/puntos/{p['id']}")
        self.assertEqual(list(carpeta.glob('*.*')), [])

    def test_las_fotos_se_guardan_con_el_id_del_servidor(self):
        p = self.crear(photo=imagen()).json()
        nombres = [f.name for f in (Path(self._carpeta.name) / 'fotos').glob('*.*')]
        self.assertEqual(nombres, [f"{p['id']}.png"])
