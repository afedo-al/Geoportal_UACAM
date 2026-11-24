from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q


def buscar_usuario(texto):
    """Cuenta activa cuyo usuario o correo coincide (sin importar mayúsculas), o None."""
    texto = (texto or '').strip()
    if not texto:
        return None
    Usuario = get_user_model()
    return Usuario.objects.filter(Q(username__iexact=texto) | Q(email__iexact=texto), is_active=True).order_by('id').first()


class UsuarioOCorreo(ModelBackend):
    """Permite entrar con el usuario o con el correo."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        usuario = buscar_usuario(username)
        if usuario is None:
            # Gasta el mismo tiempo que una cuenta real para no revelar qué usuarios existen.
            get_user_model()().set_password(password or '')
            return None
        if usuario.check_password(password or '') and self.user_can_authenticate(usuario):
            return usuario
        return None
