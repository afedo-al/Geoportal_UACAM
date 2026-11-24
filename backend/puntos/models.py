import secrets

from django.conf import settings
from django.db import models


def nuevo_id():
    """Identificador de un punto: lo genera el servidor; nunca se acepta el que mande el cliente."""
    return f'P-{secrets.token_hex(5)}'


class Punto(models.Model):
    """Un punto de campo. Los nombres de campo siguen el vocabulario de la interfaz."""

    id = models.CharField(primary_key=True, max_length=40, default=nuevo_id, editable=False)
    nombre = models.CharField(max_length=120)
    lat = models.FloatField()
    lon = models.FloatField()
    altitud = models.FloatField(null=True, blank=True)       # metros, de -500 a 9 000
    predio = models.CharField(max_length=120, blank=True)
    autor = models.CharField(max_length=120, blank=True)     # quien levantó el dato (columna «Autor» del Excel)
    tipo = models.CharField(max_length=60)
    descripcion = models.CharField(max_length=1000, blank=True)
    fecha = models.CharField(max_length=10, blank=True)      # AAAA-MM-DD
    hora = models.CharField(max_length=5, blank=True)        # HH:MM
    foto = models.CharField(max_length=80, blank=True)       # nombre del archivo en la carpeta de datos
    foto_tipo = models.CharField(max_length=20, blank=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    creado = models.DateTimeField(auto_now_add=True, db_index=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['creado', 'id']

    def __str__(self):
        return f'{self.id} · {self.nombre}'
