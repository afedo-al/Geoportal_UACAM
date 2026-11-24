"""Ayudas para las pruebas: un cliente que se comporta como la interfaz (cookie CSRF y cabeceras)."""
import json

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import Client

from cuentas.models import ADMIN, INVESTIGADOR, Perfil

CONTRASENA = 'una-contrasena-larga-y-unica-9'


def crear_usuario(usuario='ana', rol=INVESTIGADOR, contrasena=CONTRASENA, correo=None, nombre='Ana Pérez', cargo='Investigadora', perfil=True, activo=True):
    Usuario = get_user_model()
    u = Usuario.objects.create_user(username=usuario, email=correo if correo is not None else f'{usuario}@example.test', password=contrasena, first_name=nombre, is_active=activo)
    if perfil:
        Perfil.objects.create(usuario=u, rol=rol, cargo=cargo)
    return u


class ClienteApi:
    """Lo mismo que hace `api.js`: pide la cookie CSRF con GET /sesion y manda `X-CSRFToken` y `X-Requested-With`."""

    def __init__(self, csrf=True, ajax=True):
        self.http = Client(enforce_csrf_checks=csrf)
        self.ajax = ajax
        self.http.get('/api/sesion')

    def _extra(self):
        extra = {}
        galleta = self.http.cookies.get(settings.CSRF_COOKIE_NAME)
        if galleta:
            extra['HTTP_X_CSRFTOKEN'] = galleta.value
        if self.ajax:
            extra['HTTP_X_REQUESTED_WITH'] = 'GeoportalCEDESU'
        return extra

    def get(self, ruta):
        return self.http.get(ruta, **{k: v for k, v in self._extra().items() if k == 'HTTP_X_REQUESTED_WITH'})

    def enviar(self, metodo, ruta, datos=None):
        cuerpo = json.dumps(datos) if datos is not None else ''
        return getattr(self.http, metodo)(ruta, data=cuerpo, content_type='application/json', **self._extra())

    def post(self, ruta, datos=None):
        return self.enviar('post', ruta, datos)

    def put(self, ruta, datos=None):
        return self.enviar('put', ruta, datos)

    def delete(self, ruta):
        return self.enviar('delete', ruta)

    def entrar(self, usuario='ana', contrasena=CONTRASENA):
        return self.post('/api/sesion', {'usuario': usuario, 'contrasena': contrasena})


def cliente_de(usuario='ana', rol=INVESTIGADOR, **kwargs):
    """Crea la cuenta (si no existe) y devuelve un cliente con la sesión iniciada."""
    if not get_user_model().objects.filter(username=usuario).exists():
        crear_usuario(usuario, rol=rol, **kwargs)
    cliente = ClienteApi()
    respuesta = cliente.entrar(usuario)
    assert respuesta.status_code == 200, respuesta.content
    return cliente
