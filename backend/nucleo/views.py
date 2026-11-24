from django.db import connection

from django.http import JsonResponse

from .http import api, error


@api('GET')
def salud(request):
    """Responde si el servicio y su base de datos están disponibles (para nginx y el monitoreo)."""
    try:
        connection.ensure_connection()
    except Exception:
        return error(503, 'La base de datos no responde.')
    return JsonResponse({'estado': 'ok'})
