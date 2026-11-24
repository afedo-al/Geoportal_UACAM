"""Puntos de campo: lo que la interfaz usa en `/api/puntos`.

Todos los usuarios con sesión ven todos los puntos (se comparten entre el equipo). Solo quien creó un punto o la
administración puede cambiarlo o borrarlo.
"""
import re

from django.conf import settings
from django.db import transaction
from django.http import FileResponse, HttpResponse, JsonResponse

from cuentas.models import ADMIN
from cuentas.permisos import requiere_sesion
from nucleo.bitacora import registrar
from nucleo.http import ErrorApi, api, leer_json

from . import fotos
from .models import Punto
from .validacion import normalizar

_ID = re.compile(r'^[\w.-]{1,40}$')


def a_json(p):
    """El punto tal como lo espera la interfaz; la fotografía es una ruta de esta API."""
    return {
        'id': p.id, 'name': p.nombre, 'lat': p.lat, 'lon': p.lon, 'altitude': p.altitud,
        'property': p.predio, 'author': p.autor, 'type': p.tipo, 'description': p.descripcion,
        'date': p.fecha, 'time': p.hora, 'photo': f'puntos/{p.id}/foto' if p.foto else '',
        'creadoPor': p.creado_por.get_username() if p.creado_por_id else '',
    }


def _buscar(id):
    if not _ID.match(id):
        raise ErrorApi(404, 'No se encontró el punto.')
    try:
        return Punto.objects.select_related('creado_por').get(pk=id)
    except Punto.DoesNotExist:
        raise ErrorApi(404, 'No se encontró el punto.')


def _puede_modificar(request, punto):
    return request.rol == ADMIN or punto.creado_por_id == request.user.pk


def _exigir_propiedad(request, punto):
    if not _puede_modificar(request, punto):
        raise ErrorApi(403, 'Solo quien creó el punto o la administración puede modificarlo.')


@api('GET', 'POST')
@requiere_sesion
def puntos(request):
    if request.method == 'GET':
        return JsonResponse({'puntos': [a_json(p) for p in Punto.objects.select_related('creado_por')]})

    datos = leer_json(request)
    campos = normalizar(datos)
    nueva = None
    if datos.get('photo'):
        nueva = fotos.procesar_data_url(datos['photo'])
    punto = Punto(creado_por=request.user, **campos)
    try:
        with transaction.atomic():
            if nueva:
                punto.foto = fotos.guardar(punto.id, nueva[0], nueva[2])
                punto.foto_tipo = nueva[1]
            punto.save(force_insert=True)
    except BaseException:
        if nueva:
            fotos.borrar(punto.foto or f'{punto.id}.{nueva[2]}')
        raise
    registrar(request, 'punto_creado', punto=punto.id)
    return JsonResponse(a_json(punto), status=201)


@api('GET', 'PUT', 'DELETE')
@requiere_sesion
def punto(request, id):
    p = _buscar(id)
    if request.method == 'GET':
        return JsonResponse(a_json(p))
    _exigir_propiedad(request, p)

    if request.method == 'DELETE':
        anterior = p.foto
        p.delete()
        fotos.borrar(anterior)
        registrar(request, 'punto_eliminado', punto=id)
        return HttpResponse(status=204)

    datos = leer_json(request)
    campos = normalizar(datos, base=p)
    for atributo, valor in campos.items():
        setattr(p, atributo, valor)

    foto_anterior = p.foto
    nueva = None
    if 'photo' in datos:                       # ausente = conservar; vacía = quitar; imagen = reemplazar
        if datos['photo']:
            nueva = fotos.procesar_data_url(datos['photo'])
        else:
            p.foto, p.foto_tipo = '', ''
    with transaction.atomic():
        if nueva:
            p.foto = fotos.guardar(p.id, nueva[0], nueva[2])
            p.foto_tipo = nueva[1]
        p.save()
    # Si cambió de formato (por ejemplo PNG a JPEG) o se quitó, el archivo anterior ya no se usa.
    if foto_anterior and foto_anterior != p.foto:
        fotos.borrar(foto_anterior)
    registrar(request, 'punto_editado', punto=p.id)
    return JsonResponse(a_json(p))


@api('POST')
@requiere_sesion
def lote(request):
    """Importación de varios puntos (por ejemplo, de un Excel). Todo o nada: si una fila no es válida no se guarda ninguna."""
    datos = leer_json(request)
    filas = datos.get('puntos') if isinstance(datos, dict) else None
    if not isinstance(filas, list) or not filas:
        raise ErrorApi(400, 'Envía una lista de puntos.')
    if len(filas) > settings.PUNTOS_MAX_POR_LOTE:
        raise ErrorApi(413, f'Se admiten hasta {settings.PUNTOS_MAX_POR_LOTE} puntos por importación.')

    nuevos = []
    descartadas = 0
    for numero, fila in enumerate(filas, start=1):
        try:
            campos = normalizar(fila)
            imagen = None
            if fila.get('photo'):
                try:
                    imagen = fotos.procesar_data_url(fila['photo'])
                except ErrorApi:
                    descartadas += 1      # una fotografía no válida no impide importar el punto
        except ErrorApi as e:
            raise ErrorApi(e.status, f'Fila {numero}: {e.detalle}', fila=numero, **e.extra)
        nuevos.append((Punto(creado_por=request.user, **campos), imagen))

    escritas = []
    try:
        with transaction.atomic():
            for p, imagen in nuevos:
                if imagen:
                    p.foto = fotos.guardar(p.id, imagen[0], imagen[2])
                    p.foto_tipo = imagen[1]
                    escritas.append(p.foto)
            Punto.objects.bulk_create([p for p, _ in nuevos])
    except BaseException:
        for nombre in escritas:
            fotos.borrar(nombre)
        raise
    registrar(request, 'puntos_importados', cantidad=len(nuevos), fotosDescartadas=descartadas)
    cuerpo = {'puntos': [a_json(p) for p, _ in nuevos]}
    if descartadas:
        cuerpo['fotosDescartadas'] = descartadas
    return JsonResponse(cuerpo, status=201)


@api('GET')
@requiere_sesion
def foto(request, id):
    p = _buscar(id)
    if not p.foto:
        raise ErrorApi(404, 'El punto no tiene fotografía.')
    try:
        archivo = fotos.abrir(p.foto)
    except FileNotFoundError:
        raise ErrorApi(404, 'No se encontró la fotografía.')
    respuesta = FileResponse(archivo, content_type=p.foto_tipo or 'application/octet-stream')
    # Aunque alguien lograra guardar algo que no es una imagen, el navegador no lo ejecuta ni lo interpreta.
    respuesta.headers['Content-Security-Policy'] = 'sandbox'
    respuesta.headers['X-Content-Type-Options'] = 'nosniff'
    respuesta.headers['Cache-Control'] = 'private, max-age=300'
    respuesta.headers['Content-Disposition'] = 'inline'
    return respuesta
