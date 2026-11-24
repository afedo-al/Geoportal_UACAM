"""Registro de hechos relevantes (accesos y cambios en los puntos)."""
from django.conf import settings

from .models import RegistroBitacora


def ip_de(request):
    """Dirección del cliente. Solo se lee X-Forwarded-For si el proxy es de confianza (GEOPORTAL_TRUST_PROXY)."""
    if settings.CONFIAR_EN_PROXY:
        reenviada = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
        if reenviada:
            return reenviada
    return request.META.get('REMOTE_ADDR') or None


def registrar(request, evento, usuario=None, usuario_texto='', **detalle):
    """Agrega una línea a la bitácora. `usuario` es el usuario autenticado; `usuario_texto` lo que se escribió."""
    if usuario is None and getattr(request, 'user', None) is not None and request.user.is_authenticated:
        usuario = request.user
    texto = usuario_texto or (usuario.get_username() if usuario else '')
    return RegistroBitacora.objects.create(
        evento=evento, usuario=usuario, usuario_texto=texto[:150], ip=ip_de(request), detalle=detalle,
    )
