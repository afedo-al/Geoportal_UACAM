"""Piezas comunes de la API: respuestas de error con la forma que espera la interfaz y lectura de JSON.

Todo error lleva `{ "detalle": "texto para la persona" }`; la interfaz lo muestra tal cual.
"""
import json
import logging
from functools import wraps

from django.http import JsonResponse

registro = logging.getLogger('geoportal')


class ErrorApi(Exception):
    """Un error que se responde al cliente con su código y su mensaje."""

    def __init__(self, status, detalle, **extra):
        super().__init__(detalle)
        self.status = status
        self.detalle = detalle
        self.extra = extra


def error(status, detalle, **extra):
    return JsonResponse({'detalle': detalle, **extra}, status=status)


def leer_json(request):
    """Cuerpo JSON de la petición. Rechaza otros tipos de contenido y JSON mal formado."""
    if request.content_type != 'application/json':
        raise ErrorApi(415, 'El cuerpo de la petición debe ser JSON.')
    try:
        return json.loads(request.body or b'null')
    except (ValueError, UnicodeDecodeError):
        raise ErrorApi(400, 'El cuerpo de la petición no es un JSON válido.')


def api(*metodos):
    """Vista de la API: limita los métodos (405 con `Allow`) y convierte `ErrorApi` en una respuesta JSON."""
    def decorador(vista):
        @wraps(vista)
        def envuelta(request, *args, **kwargs):
            if request.method not in metodos:
                respuesta = error(405, 'Método no permitido.')
                respuesta['Allow'] = ', '.join(metodos)
                return respuesta
            try:
                return vista(request, *args, **kwargs)
            except ErrorApi as e:
                return error(e.status, e.detalle, **e.extra)
        return envuelta
    return decorador


# ---------------- manejadores globales (todo el servicio es JSON) ----------------
def solicitud_invalida(request, exception=None):
    return error(400, 'La solicitud no es válida o es demasiado grande.')


def sin_permiso(request, exception=None):
    return error(403, 'No tienes permiso para esta acción.')


def no_encontrado(request, exception=None):
    return error(404, 'No se encontró lo que buscas.')


def error_interno(request):
    return error(500, 'Ocurrió un error en el servidor. Inténtalo de nuevo.')


def csrf_fallo(request, reason=''):
    registro.warning('CSRF rechazado: %s', reason)
    return error(403, 'La solicitud no se pudo verificar. Recarga la página e inténtalo de nuevo.')
