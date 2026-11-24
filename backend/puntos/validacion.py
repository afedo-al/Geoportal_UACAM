"""Reglas de un punto de campo. Son las mismas de la interfaz (lib/coords.js, stores/gps.js): el servidor las repite
porque la validación del navegador se puede saltar.
"""
import math
import re
from datetime import date

from nucleo.http import ErrorApi

LAT = (14.0, 22.0)           # área de trabajo: Campeche y alrededores
LON = (-93.0, -86.0)
ALTITUD = (-500.0, 9000.0)
MAXIMOS = {'name': 120, 'property': 120, 'author': 120, 'type': 60, 'description': 1000}
TIPO_POR_DEFECTO = 'Punto de referencia'
NOMBRE_POR_DEFECTO = 'Punto sin nombre'

_CONTROL = re.compile(r'[\x00-\x1f\x7f]')
_HORA = re.compile(r'^([01]\d|2[0-3]):[0-5]\d')


def _texto(valor, campo, maximo):
    if valor is None:
        return ''
    if isinstance(valor, bool) or not isinstance(valor, (str, int, float)):
        raise ErrorApi(422, f'«{campo}» debe ser texto.', campo=campo)
    limpio = _CONTROL.sub(' ', str(valor)).strip()
    if len(limpio) > maximo:
        raise ErrorApi(422, f'«{campo}» admite hasta {maximo} caracteres.', campo=campo)
    return limpio


def _numero(valor, campo):
    if isinstance(valor, bool):
        raise ErrorApi(422, f'«{campo}» debe ser un número.', campo=campo)
    if isinstance(valor, str):
        valor = valor.strip().replace(',', '.')
    try:
        n = float(valor)
    except (TypeError, ValueError):
        raise ErrorApi(422, f'«{campo}» debe ser un número.', campo=campo)
    if not math.isfinite(n):
        raise ErrorApi(422, f'«{campo}» debe ser un número.', campo=campo)
    return n


def _coordenada(valor, campo, rango, nombre):
    n = _numero(valor, campo)
    if not rango[0] <= n <= rango[1]:
        raise ErrorApi(422, f'Fuera del área de trabajo: la {nombre} de Campeche y alrededores va de {rango[0]:g} a {rango[1]:g}.', campo=campo)
    return n


def normalizar(datos, base=None):
    """Campos limpios de un punto a partir de lo que manda el cliente.

    Con `base` (un punto existente) lo que no venga se conserva; sin `base` faltan latitud y longitud = error.
    La fotografía no se trata aquí (ver fotos.py).
    """
    if not isinstance(datos, dict):
        raise ErrorApi(400, 'El punto debe ser un objeto JSON.')

    def hay(clave):
        return clave in datos

    if hay('lat'):
        lat = _coordenada(datos['lat'], 'lat', LAT, 'latitud')
    elif base is not None:
        lat = base.lat
    else:
        raise ErrorApi(422, 'Falta la latitud.', campo='lat')
    if hay('lon'):
        lon = _coordenada(datos['lon'], 'lon', LON, 'longitud')
    elif base is not None:
        lon = base.lon
    else:
        raise ErrorApi(422, 'Falta la longitud.', campo='lon')

    if hay('altitude'):
        bruto = datos['altitude']
        if bruto is None or (isinstance(bruto, str) and not bruto.strip()):
            altitud = None
        else:
            altitud = _numero(bruto, 'altitude')
            if not ALTITUD[0] <= altitud <= ALTITUD[1]:
                raise ErrorApi(422, 'La altitud debe estar entre -500 y 9 000 metros.', campo='altitude')
    else:
        altitud = base.altitud if base is not None else None

    def campo_texto(clave, atributo, defecto=''):
        if hay(clave):
            return _texto(datos[clave], clave, MAXIMOS[clave]) or defecto
        return getattr(base, atributo) if base is not None else defecto

    fecha = base.fecha if base is not None else ''
    if hay('date'):
        bruto = datos['date']
        if bruto in (None, ''):
            fecha = ''
        else:
            try:
                fecha = date.fromisoformat(str(bruto)[:10]).isoformat()
            except ValueError:
                raise ErrorApi(422, 'La fecha debe tener el formato AAAA-MM-DD.', campo='date')

    hora = base.hora if base is not None else ''
    if hay('time'):
        bruto = datos['time']
        if bruto in (None, ''):
            hora = ''
        else:
            m = _HORA.match(str(bruto))
            if not m:
                raise ErrorApi(422, 'La hora debe tener el formato HH:MM.', campo='time')
            hora = str(bruto)[:5]

    return {
        'nombre': campo_texto('name', 'nombre', NOMBRE_POR_DEFECTO),
        'lat': lat, 'lon': lon, 'altitud': altitud,
        'predio': campo_texto('property', 'predio'),
        'autor': campo_texto('author', 'autor'),
        'tipo': campo_texto('type', 'tipo', TIPO_POR_DEFECTO),
        'descripcion': campo_texto('description', 'descripcion'),
        'fecha': fecha, 'hora': hora,
    }
