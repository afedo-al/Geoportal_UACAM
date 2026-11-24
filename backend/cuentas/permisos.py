"""Quién puede hacer qué. Cada vista lo comprueba en cada petición; nada se confía a la interfaz."""
from functools import wraps

from nucleo.http import ErrorApi

from .models import ADMIN


def rol_de(usuario):
    perfil = getattr(usuario, 'perfil', None) if usuario.is_authenticated else None
    return perfil.rol if perfil else None


def requiere_sesion(vista):
    """401 si no hay sesión; 403 si la cuenta no tiene perfil. Deja el rol en `request.rol`."""
    @wraps(vista)
    def envuelta(request, *args, **kwargs):
        if not request.user.is_authenticated:
            raise ErrorApi(401, 'Inicia sesión para continuar.')
        rol = rol_de(request.user)
        if rol is None:
            raise ErrorApi(403, 'Tu cuenta no tiene un perfil asignado. Pide a la administración que lo configure.')
        request.rol = rol
        return vista(request, *args, **kwargs)
    return envuelta


def requiere_rol(*roles):
    def decorador(vista):
        @requiere_sesion
        @wraps(vista)
        def envuelta(request, *args, **kwargs):
            if request.rol not in roles:
                raise ErrorApi(403, 'Esta acción es solo para la administración.' if roles == (ADMIN,) else 'No tienes permiso para esta acción.')
            return vista(request, *args, **kwargs)
        return envuelta
    return decorador
