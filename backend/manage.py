#!/usr/bin/env python
"""Utilidad de administración del servicio de publicación de DeltaMap-CEDESU."""
import os
import sys


def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    if len(sys.argv) > 1 and sys.argv[1] == 'test':
        # Solo para las pruebas: una clave fija evita pedir la configuración completa. Nunca se usa fuera de `test`.
        os.environ.setdefault('GEOPORTAL_SECRET_KEY', 'clave-solo-para-pruebas-no-usar-en-produccion-0123456789')
        os.environ.setdefault('GEOPORTAL_ALLOWED_HOSTS', 'testserver,localhost')
        os.environ.setdefault('GEOPORTAL_LOG_LEVEL', 'ERROR')   # los 4xx esperados no llenan la salida de las pruebas
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
