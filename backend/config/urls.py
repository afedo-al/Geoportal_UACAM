"""Rutas del servicio. Todo cuelga de `/api/`: nginx reenvía ese prefijo y el servicio lo recibe completo."""
from django.urls import include, path

handler400 = 'nucleo.http.solicitud_invalida'
handler403 = 'nucleo.http.sin_permiso'
handler404 = 'nucleo.http.no_encontrado'
handler500 = 'nucleo.http.error_interno'

urlpatterns = [
    path('api/', include('nucleo.urls')),
    path('api/', include('cuentas.urls')),
    path('api/', include('puntos.urls')),
]
