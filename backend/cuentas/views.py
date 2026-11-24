"""Sesión: quién está dentro, entrar y salir. La interfaz usa `/api/sesion` (GET, POST, DELETE)."""
import logging
import time
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.db.models import Max, Min, Q
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie

from nucleo.bitacora import ip_de, registrar
from nucleo.http import ErrorApi, api, error, leer_json
from nucleo.models import RegistroBitacora

from .backends import buscar_usuario
from .permisos import rol_de

registro = logging.getLogger('geoportal')

LARGO_USUARIO = 150
LARGO_CONTRASENA = 256   # evita que una contraseña enorme gaste tiempo de cálculo


def cuerpo_sesion(request):
    """Lo que la interfaz muestra de la persona y cuándo caduca la sesión."""
    u = request.user
    inicio = request.session.get('inicio') or time.time()
    return {
        'usuario': {
            'id': u.pk, 'usuario': u.get_username(), 'nombre': u.get_full_name() or u.get_username(),
            'correo': u.email, 'cargo': u.perfil.cargo, 'rol': rol_de(u), 'demo': False,
        },
        'expira': int((inicio + settings.SESION_MAXIMA_HORAS * 3600) * 1000),
        'inactividadMinutos': settings.INACTIVIDAD_MINUTOS,
    }


def segundos_de_bloqueo(texto, candidato, ip):
    """Segundos que faltan para poder intentar de nuevo, o 0 si no hay bloqueo.

    Cuenta los accesos fallidos recientes de esa cuenta (desde el último acceso correcto) y los de esa dirección.
    """
    ahora = timezone.now()
    desde = ahora - timedelta(minutes=settings.INTENTOS_VENTANA_MIN)
    fallos = RegistroBitacora.objects.filter(evento='acceso_fallido', fecha__gte=desde)

    por_cuenta = Q(usuario_texto__iexact=texto)
    if candidato is not None:
        por_cuenta |= Q(usuario=candidato)
        ultimo_ok = RegistroBitacora.objects.filter(evento='acceso_exitoso', usuario=candidato).aggregate(m=Max('fecha'))['m']
        cuenta = fallos.filter(por_cuenta)
        if ultimo_ok:
            cuenta = cuenta.filter(fecha__gt=ultimo_ok)
    else:
        cuenta = fallos.filter(por_cuenta)

    for consulta, tope in ((cuenta, settings.INTENTOS_MAX), (fallos.filter(ip=ip) if ip else fallos.none(), settings.INTENTOS_MAX_POR_IP)):
        if consulta.count() >= tope:
            primero = consulta.aggregate(m=Min('fecha'))['m']
            return max(1, int((primero + timedelta(minutes=settings.INTENTOS_VENTANA_MIN) - ahora).total_seconds()))
    return 0


def iniciar(request):
    datos = leer_json(request)
    if not isinstance(datos, dict):
        raise ErrorApi(400, 'Faltan el usuario y la contraseña.')
    texto = datos.get('usuario')
    contrasena = datos.get('contrasena')
    if not isinstance(texto, str) or not isinstance(contrasena, str) or not texto.strip() or not contrasena:
        raise ErrorApi(400, 'Escribe el usuario y la contraseña.')
    texto = texto.strip()
    if len(texto) > LARGO_USUARIO or len(contrasena) > LARGO_CONTRASENA:
        raise ErrorApi(401, 'Usuario o contraseña incorrectos.')

    ip = ip_de(request)
    candidato = buscar_usuario(texto)
    espera = segundos_de_bloqueo(texto, candidato, ip)
    if espera:
        registro.warning('Acceso bloqueado para «%s» desde %s', texto[:60], ip)
        respuesta = error(429, f'Demasiados intentos. Espera {max(1, round(espera / 60))} min para intentar de nuevo.')
        respuesta['Retry-After'] = str(espera)
        return respuesta

    usuario = authenticate(request, username=texto, password=contrasena)
    if usuario is None or rol_de(usuario) is None:
        registrar(request, 'acceso_fallido', usuario=candidato, usuario_texto=texto.lower())
        # Mismo mensaje con cuenta inexistente, contraseña errónea o cuenta sin perfil: no se revela cuál.
        raise ErrorApi(401, 'Usuario o contraseña incorrectos.')

    login(request, usuario)                       # renueva la clave de sesión (evita fijación de sesión)
    request.session['inicio'] = time.time()
    request.session.set_expiry(settings.SESSION_COOKIE_AGE)
    registrar(request, 'acceso_exitoso', usuario=usuario, usuario_texto=texto.lower(), rol=rol_de(usuario))
    return JsonResponse(cuerpo_sesion(request))


@api('GET', 'POST', 'DELETE')
@ensure_csrf_cookie
def sesion(request):
    """GET: quién está dentro (y deja la cookie CSRF). POST: entra. DELETE: sale."""
    if request.method == 'GET':
        if request.user.is_authenticated and rol_de(request.user):
            return JsonResponse(cuerpo_sesion(request))
        return JsonResponse({'usuario': None})
    if request.method == 'POST':
        return iniciar(request)
    if request.user.is_authenticated:
        registrar(request, 'cierre_sesion')
        logout(request)
    return HttpResponse(status=204)


@api('GET')
def demo(request):
    """Cuenta de demostración. Solo existe en desarrollo y si se configuró; en producción responde 404."""
    cuenta = settings.CUENTA_DEMO
    if not cuenta:
        raise ErrorApi(404, 'No hay cuenta de demostración.')
    return JsonResponse({'usuario': cuenta['usuario'], 'correo': '', 'contrasena': cuenta['contrasena']})
