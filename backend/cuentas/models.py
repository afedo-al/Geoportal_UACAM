from django.conf import settings
from django.db import models

ADMIN = 'admin'
INVESTIGADOR = 'investigador'


class Perfil(models.Model):
    """Rol y cargo de una cuenta. Una cuenta sin perfil no puede entrar: así nadie obtiene acceso por omisión."""

    ROLES = [(ADMIN, 'Administración'), (INVESTIGADOR, 'Investigación')]

    usuario = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='perfil')
    rol = models.CharField(max_length=20, choices=ROLES, default=INVESTIGADOR)
    cargo = models.CharField(max_length=120, blank=True)

    def __str__(self):
        return f'{self.usuario.get_username()} · {self.get_rol_display()}'
