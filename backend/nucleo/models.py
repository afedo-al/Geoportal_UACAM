from django.conf import settings
from django.db import models


class SoloAnadir(models.QuerySet):
    """La bitácora no se corrige ni se borra desde el código: solo se agregan registros."""

    def update(self, **kwargs):
        raise PermissionError('La bitácora no se puede modificar.')

    def delete(self):
        raise PermissionError('La bitácora no se puede borrar.')


class RegistroBitacora(models.Model):
    """Una línea de la bitácora: quién hizo qué, cuándo y desde dónde."""

    fecha = models.DateTimeField(auto_now_add=True, db_index=True)
    evento = models.CharField(max_length=40, db_index=True)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    usuario_texto = models.CharField(max_length=150, blank=True)   # lo escrito en el acceso o el nombre al momento del hecho
    ip = models.GenericIPAddressField(null=True, blank=True)
    detalle = models.JSONField(default=dict, blank=True)

    objects = SoloAnadir.as_manager()

    class Meta:
        ordering = ['-fecha', '-id']
        indexes = [models.Index(fields=['evento', 'usuario_texto', 'fecha'])]

    def save(self, *args, **kwargs):
        if self.pk:
            raise PermissionError('La bitácora no se puede modificar.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError('La bitácora no se puede borrar.')

    def __str__(self):
        return f'{self.fecha:%Y-%m-%d %H:%M} {self.evento} {self.usuario_texto}'
