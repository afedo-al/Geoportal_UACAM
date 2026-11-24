"""Defensas generales de la API."""
from .http import error

SEGURAS = ('GET', 'HEAD', 'OPTIONS')
CABECERA = 'HTTP_X_REQUESTED_WITH'
VALOR = 'GeoportalCEDESU'


class CabeceraAjaxMiddleware:
    """Las peticiones que modifican datos deben traer `X-Requested-With: GeoportalCEDESU`.

    Un formulario de otro sitio no puede añadir esa cabecera sin permiso del navegador, así que es una segunda
    barrera además del token CSRF.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method not in SEGURAS and request.META.get(CABECERA) != VALOR:
            return error(403, 'La solicitud no viene de la aplicación.')
        return self.get_response(request)


class CabecerasRespuestaMiddleware:
    """Ninguna respuesta se guarda en caché compartida salvo que la vista lo pida (las fotografías)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        respuesta = self.get_response(request)
        respuesta.headers.setdefault('Cache-Control', 'no-store')
        respuesta.headers.setdefault('Referrer-Policy', 'no-referrer')
        respuesta.headers.setdefault('Cross-Origin-Resource-Policy', 'same-origin')
        return respuesta
