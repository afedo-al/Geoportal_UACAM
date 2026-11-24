"""Fotografías de los puntos.

Se aceptan PNG, JPEG y WebP de hasta 2 MB. Cada imagen se abre y se vuelve a guardar con Pillow: así se comprueba
que de verdad es una imagen, se descartan los metadatos (la ubicación EXIF de una foto de celular, por ejemplo)
y nunca se sirve el archivo tal como llegó.
"""
import base64
import binascii
import io
import os
import re
import tempfile
from pathlib import Path

from django.conf import settings
from PIL import Image, ImageOps, UnidentifiedImageError

from nucleo.http import ErrorApi

Image.MAX_IMAGE_PIXELS = settings.FOTO_MAX_PIXELES

_DATA_URL = re.compile(r'^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$')
FORMATOS = {'png': ('PNG', 'image/png', 'png'), 'jpeg': ('JPEG', 'image/jpeg', 'jpg'), 'webp': ('WEBP', 'image/webp', 'webp')}


def carpeta():
    ruta = Path(settings.DATA_DIR) / 'fotos'
    ruta.mkdir(parents=True, exist_ok=True)
    return ruta


def procesar_data_url(texto):
    """Devuelve (bytes, tipo MIME, extensión) de una imagen enviada como «data:image/...;base64,...»."""
    if not isinstance(texto, str):
        raise ErrorApi(422, 'La fotografía no es válida.', campo='photo')
    m = _DATA_URL.match(texto.strip())
    if not m:
        raise ErrorApi(422, 'La fotografía debe ser una imagen PNG, JPEG o WebP.', campo='photo')
    declarado, cuerpo = m.group(1), m.group(2)
    # El tamaño decodificado es ~3/4 del texto: se corta antes de decodificar algo enorme.
    if len(cuerpo) > settings.FOTO_MAX_BYTES * 4 // 3 + 16:
        raise ErrorApi(422, 'La fotografía supera 2 MB.', campo='photo')
    try:
        crudo = base64.b64decode(cuerpo, validate=False)
    except (binascii.Error, ValueError):
        raise ErrorApi(422, 'La fotografía no es válida.', campo='photo')
    if len(crudo) > settings.FOTO_MAX_BYTES:
        raise ErrorApi(422, 'La fotografía supera 2 MB.', campo='photo')

    formato, mime, extension = FORMATOS[declarado]
    try:
        with Image.open(io.BytesIO(crudo)) as imagen:
            if imagen.format != formato:
                raise ErrorApi(422, 'El contenido de la fotografía no corresponde a su tipo.', campo='photo')
            if imagen.width * imagen.height > settings.FOTO_MAX_PIXELES:
                raise ErrorApi(422, 'La resolución de la fotografía es demasiado grande.', campo='photo')
            imagen.load()
            imagen = ImageOps.exif_transpose(imagen)
            if formato == 'JPEG' and imagen.mode not in ('RGB', 'L'):
                imagen = imagen.convert('RGB')
            salida = io.BytesIO()
            opciones = {'quality': 88, 'optimize': True} if formato == 'JPEG' else {'optimize': True} if formato == 'PNG' else {'quality': 88}
            imagen.save(salida, format=formato, **opciones)   # sin metadatos: no se pasa `exif` ni `icc_profile`
    except ErrorApi:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError):
        raise ErrorApi(422, 'La fotografía no es una imagen válida.', campo='photo')
    return salida.getvalue(), mime, extension


def guardar(punto_id, contenido, extension):
    """Guarda la imagen como <id>.<ext> (el id lo genera el servidor) con escritura atómica. Devuelve el nombre."""
    nombre = f'{punto_id}.{extension}'
    destino = carpeta() / nombre
    descriptor, temporal = tempfile.mkstemp(dir=carpeta(), suffix='.tmp')
    try:
        with os.fdopen(descriptor, 'wb') as f:
            f.write(contenido)
        os.replace(temporal, destino)
    except BaseException:
        try:
            os.unlink(temporal)
        except OSError:
            pass
        raise
    return nombre


def borrar(nombre):
    if not nombre:
        return
    try:
        (carpeta() / Path(nombre).name).unlink()
    except FileNotFoundError:
        pass


def abrir(nombre):
    return open(carpeta() / Path(nombre).name, 'rb')
