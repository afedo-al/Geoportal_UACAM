import time

from django.conf import settings
from django.contrib.auth import logout

from nucleo.bitacora import registrar


class SesionAcotadaMiddleware:
    """Cierra la sesión al cumplirse su duración máxima, aunque la persona siga activa.

    La inactividad la controla la propia cookie de sesión (se renueva con cada petición); este límite es absoluto.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            inicio = request.session.get('inicio')
            limite = settings.SESION_MAXIMA_HORAS * 3600
            if inicio is None or time.time() - inicio > limite:
                registrar(request, 'sesion_expirada')
                logout(request)
        return self.get_response(request)
