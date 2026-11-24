import time
from datetime import timedelta
from io import StringIO
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone

from nucleo.models import RegistroBitacora
from nucleo.pruebas import CONTRASENA, ClienteApi, cliente_de, crear_usuario

from .models import ADMIN, INVESTIGADOR


class SesionTest(TestCase):
    def test_sin_sesion_responde_usuario_nulo_y_deja_la_cookie_csrf(self):
        c = ClienteApi()
        r = c.get('/api/sesion')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {'usuario': None})
        self.assertIn(settings.CSRF_COOKIE_NAME, c.http.cookies)

    def test_entrar_con_usuario_devuelve_lo_que_muestra_la_interfaz(self):
        crear_usuario('ana', rol=ADMIN, cargo='Responsable')
        r = ClienteApi().entrar('ana')
        self.assertEqual(r.status_code, 200)
        cuerpo = r.json()
        u = cuerpo['usuario']
        self.assertEqual((u['usuario'], u['nombre'], u['cargo'], u['rol'], u['demo']), ('ana', 'Ana Pérez', 'Responsable', ADMIN, False))
        self.assertEqual(cuerpo['inactividadMinutos'], settings.INACTIVIDAD_MINUTOS)
        self.assertGreater(cuerpo['expira'], time.time() * 1000)
        self.assertLessEqual(cuerpo['expira'], (time.time() + settings.SESION_MAXIMA_HORAS * 3600) * 1000 + 5000)

    def test_entrar_con_el_correo_sin_importar_mayusculas(self):
        crear_usuario('ana', correo='Ana@Ejemplo.Test')
        self.assertEqual(ClienteApi().entrar('ANA@ejemplo.TEST').status_code, 200)

    def test_el_estado_de_la_sesion_persiste(self):
        c = cliente_de('ana')
        self.assertEqual(c.get('/api/sesion').json()['usuario']['usuario'], 'ana')

    def test_contrasena_incorrecta_y_usuario_inexistente_dan_el_mismo_mensaje(self):
        crear_usuario('ana')
        malo = ClienteApi().entrar('ana', 'otra-contrasena')
        inexistente = ClienteApi().entrar('nadie', 'otra-contrasena')
        self.assertEqual(malo.status_code, 401)
        self.assertEqual(malo.json(), inexistente.json())

    def test_faltan_datos(self):
        self.assertEqual(ClienteApi().post('/api/sesion', {'usuario': 'ana'}).status_code, 400)
        self.assertEqual(ClienteApi().post('/api/sesion', {'usuario': 5, 'contrasena': 'x'}).status_code, 400)
        self.assertEqual(ClienteApi().post('/api/sesion', [1, 2]).status_code, 400)

    def test_cuenta_sin_perfil_no_entra(self):
        crear_usuario('sinperfil', perfil=False)
        self.assertEqual(ClienteApi().entrar('sinperfil').status_code, 401)

    def test_cuenta_inactiva_no_entra(self):
        crear_usuario('baja', activo=False)
        self.assertEqual(ClienteApi().entrar('baja').status_code, 401)

    def test_credenciales_enormes_se_rechazan_sin_calcular(self):
        crear_usuario('ana')
        r = ClienteApi().post('/api/sesion', {'usuario': 'ana', 'contrasena': 'x' * 5000})
        self.assertEqual(r.status_code, 401)

    def test_salir_cierra_la_sesion_y_queda_en_la_bitacora(self):
        c = cliente_de('ana')
        self.assertEqual(c.delete('/api/sesion').status_code, 204)
        self.assertEqual(c.get('/api/sesion').json(), {'usuario': None})
        self.assertTrue(RegistroBitacora.objects.filter(evento='cierre_sesion', usuario_texto='ana').exists())

    def test_la_clave_de_sesion_cambia_al_entrar(self):
        crear_usuario('ana')
        c = ClienteApi()
        c.get('/api/sesion')
        antes = c.http.cookies.get(settings.SESSION_COOKIE_NAME)
        c.entrar('ana')
        despues = c.http.cookies.get(settings.SESSION_COOKIE_NAME)
        self.assertIsNotNone(despues)
        self.assertNotEqual(antes.value if antes else None, despues.value)

    def test_la_cookie_de_sesion_no_la_lee_javascript(self):
        c = cliente_de('ana')
        self.assertTrue(c.http.cookies[settings.SESSION_COOKIE_NAME]['httponly'])

    def test_la_sesion_caduca_al_cumplirse_el_maximo(self):
        c = cliente_de('ana')
        sesion = c.http.session
        sesion['inicio'] = time.time() - settings.SESION_MAXIMA_HORAS * 3600 - 10
        sesion.save()
        self.assertEqual(c.get('/api/sesion').json(), {'usuario': None})
        self.assertTrue(RegistroBitacora.objects.filter(evento='sesion_expirada').exists())

    def test_cuenta_demo_no_existe_por_omision(self):
        self.assertEqual(ClienteApi().get('/api/demo').status_code, 404)

    @override_settings(CUENTA_DEMO={'usuario': 'demo.local', 'contrasena': 'solo-para-desarrollo'})
    def test_cuenta_demo_configurada_en_desarrollo(self):
        self.assertEqual(ClienteApi().get('/api/demo').json()['usuario'], 'demo.local')


class BloqueoTest(TestCase):
    def _fallar(self, veces, usuario='ana'):
        for _ in range(veces):
            self.assertEqual(ClienteApi().entrar(usuario, 'mala-contrasena').status_code, 401)

    def test_tras_cinco_fallos_se_bloquea_aunque_la_contrasena_sea_correcta(self):
        crear_usuario('ana')
        self._fallar(settings.INTENTOS_MAX)
        r = ClienteApi().entrar('ana', CONTRASENA)
        self.assertEqual(r.status_code, 429)
        self.assertIn('Demasiados intentos', r.json()['detalle'])
        self.assertGreater(int(r['Retry-After']), 0)

    def test_el_bloqueo_de_una_cuenta_no_afecta_a_otra(self):
        crear_usuario('ana')
        crear_usuario('luis')
        self._fallar(settings.INTENTOS_MAX)
        self.assertEqual(ClienteApi().entrar('luis').status_code, 200)

    def test_el_bloqueo_termina_con_el_tiempo(self):
        crear_usuario('ana')
        self._fallar(settings.INTENTOS_MAX)
        futuro = timezone.now() + timedelta(minutes=settings.INTENTOS_VENTANA_MIN + 1)
        with mock.patch('cuentas.views.timezone.now', return_value=futuro):
            self.assertEqual(ClienteApi().entrar('ana').status_code, 200)

    def test_un_acceso_correcto_reinicia_la_cuenta(self):
        crear_usuario('ana')
        self._fallar(settings.INTENTOS_MAX - 1)
        self.assertEqual(ClienteApi().entrar('ana').status_code, 200)
        self._fallar(settings.INTENTOS_MAX - 1)
        self.assertEqual(ClienteApi().entrar('ana').status_code, 200)

    def test_el_bloqueo_cuenta_igual_con_usuario_que_con_correo(self):
        crear_usuario('ana', correo='ana@ejemplo.test')
        for i in range(settings.INTENTOS_MAX):
            ClienteApi().entrar('ana' if i % 2 else 'ana@ejemplo.test', 'mala-contrasena')
        self.assertEqual(ClienteApi().entrar('ana', CONTRASENA).status_code, 429)

    @override_settings(INTENTOS_MAX_POR_IP=3)
    def test_una_direccion_que_falla_mucho_se_bloquea(self):
        for i in range(3):
            ClienteApi().entrar(f'inexistente{i}', 'x')
        self.assertEqual(ClienteApi().entrar('otro', 'x').status_code, 429)

    def test_los_fallos_y_los_accesos_quedan_en_la_bitacora(self):
        crear_usuario('ana')
        ClienteApi().entrar('ana', 'mala')
        ClienteApi().entrar('ana')
        self.assertTrue(RegistroBitacora.objects.filter(evento='acceso_fallido', usuario_texto='ana').exists())
        self.assertTrue(RegistroBitacora.objects.filter(evento='acceso_exitoso', usuario_texto='ana').exists())
        # La contraseña nunca se registra.
        for r in RegistroBitacora.objects.all():
            self.assertNotIn('mala', str(r.detalle))
            self.assertNotIn(CONTRASENA, str(r.detalle))


class CrearUsuarioTest(TestCase):
    def _crear(self, *args, contrasena=CONTRASENA, **opciones):
        with mock.patch('sys.stdin', StringIO(contrasena + '\n')):
            salida = StringIO()
            call_command('crear_usuario', *args, '--password-stdin', stdout=salida, **opciones)
        return salida.getvalue()

    def test_crea_la_cuenta_con_su_rol(self):
        self._crear('maria', rol=ADMIN, correo='maria@ejemplo.test', nombre='María López', cargo='Coordinación')
        u = get_user_model().objects.get(username='maria')
        self.assertEqual((u.perfil.rol, u.perfil.cargo, u.email), (ADMIN, 'Coordinación', 'maria@ejemplo.test'))
        self.assertTrue(u.check_password(CONTRASENA))
        self.assertEqual(ClienteApi().entrar('maria').status_code, 200)

    def test_el_rol_por_omision_es_investigacion(self):
        self._crear('pedro')
        self.assertEqual(get_user_model().objects.get(username='pedro').perfil.rol, INVESTIGADOR)

    def test_rechaza_una_contrasena_debil(self):
        with self.assertRaises(CommandError):
            self._crear('pedro', contrasena='12345678')
        self.assertFalse(get_user_model().objects.filter(username='pedro').exists())

    def test_rechaza_usuario_o_correo_repetidos(self):
        self._crear('pedro', correo='p@ejemplo.test')
        with self.assertRaises(CommandError):
            self._crear('PEDRO')
        with self.assertRaises(CommandError):
            self._crear('otro', correo='P@ejemplo.test')
