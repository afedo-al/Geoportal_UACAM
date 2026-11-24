import os
import subprocess
import sys
import tempfile
from pathlib import Path

from django.test import Client, TestCase

from nucleo.bitacora import registrar
from nucleo.models import RegistroBitacora
from nucleo.pruebas import ClienteApi

BACKEND = Path(__file__).resolve().parent.parent


class SaludYErroresTest(TestCase):
    def test_salud_responde_ok(self):
        r = Client().get('/api/salud')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {'estado': 'ok'})

    def test_metodo_no_permitido_es_json(self):
        r = ClienteApi().post('/api/salud')
        self.assertEqual(r.status_code, 405)
        self.assertIn('detalle', r.json())
        self.assertEqual(r['Allow'], 'GET')

    def test_ruta_inexistente_responde_json(self):
        r = Client().get('/api/no-existe')
        self.assertEqual(r.status_code, 404)
        self.assertIn('detalle', r.json())

    def test_las_respuestas_no_se_guardan_en_cache(self):
        r = Client().get('/api/salud')
        self.assertEqual(r['Cache-Control'], 'no-store')
        self.assertEqual(r['X-Content-Type-Options'], 'nosniff')

    def test_peticion_que_modifica_exige_la_cabecera_de_la_aplicacion(self):
        c = ClienteApi(ajax=False)
        r = c.post('/api/sesion', {'usuario': 'x', 'contrasena': 'y'})
        self.assertEqual(r.status_code, 403)

    def test_sin_token_csrf_se_rechaza(self):
        c = Client(enforce_csrf_checks=True)
        r = c.post('/api/sesion', data='{}', content_type='application/json', HTTP_X_REQUESTED_WITH='GeoportalCEDESU')
        self.assertEqual(r.status_code, 403)
        self.assertIn('detalle', r.json())


class BitacoraTest(TestCase):
    def test_solo_se_agregan_registros(self):
        r = registrar(_PeticionFalsa(), 'prueba', usuario_texto='x')
        r.evento = 'otro'
        with self.assertRaises(PermissionError):
            r.save()
        with self.assertRaises(PermissionError):
            r.delete()
        with self.assertRaises(PermissionError):
            RegistroBitacora.objects.all().delete()
        with self.assertRaises(PermissionError):
            RegistroBitacora.objects.all().update(evento='x')
        self.assertEqual(RegistroBitacora.objects.count(), 1)


class _PeticionFalsa:
    META = {'REMOTE_ADDR': '127.0.0.1'}
    user = None


class ConfiguracionTest(TestCase):
    """En producción el servicio no arranca sin clave secreta ni hosts permitidos."""

    def _comprobar(self, **entorno):
        base = {k: v for k, v in os.environ.items() if not k.startswith('GEOPORTAL_') and k != 'DJANGO_SETTINGS_MODULE'}
        base.update(entorno)
        return subprocess.run([sys.executable, 'manage.py', 'check'], cwd=BACKEND, env=base, capture_output=True, text=True, timeout=120)

    def test_sin_clave_secreta_no_arranca(self):
        r = self._comprobar(GEOPORTAL_ALLOWED_HOSTS='ejemplo.test')
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('GEOPORTAL_SECRET_KEY', r.stderr)

    def test_sin_hosts_permitidos_no_arranca(self):
        r = self._comprobar(GEOPORTAL_SECRET_KEY='x' * 60)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('GEOPORTAL_ALLOWED_HOSTS', r.stderr)

    def test_con_la_configuracion_minima_arranca(self):
        with tempfile.TemporaryDirectory() as carpeta:
            r = self._comprobar(GEOPORTAL_SECRET_KEY='x' * 60, GEOPORTAL_ALLOWED_HOSTS='ejemplo.test', GEOPORTAL_DATA_DIR=carpeta)
        self.assertEqual(r.returncode, 0, r.stderr)
