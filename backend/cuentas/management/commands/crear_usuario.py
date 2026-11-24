"""Crea una cuenta con su rol. La contraseña se pide por teclado (o por la entrada estándar), nunca como argumento."""
import getpass
import sys

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from cuentas.models import ADMIN, INVESTIGADOR, Perfil


class Command(BaseCommand):
    help = 'Crea una cuenta de administración o de investigación.'

    def add_arguments(self, parser):
        parser.add_argument('usuario')
        parser.add_argument('--rol', choices=[ADMIN, INVESTIGADOR], default=INVESTIGADOR)
        parser.add_argument('--correo', default='')
        parser.add_argument('--nombre', default='')
        parser.add_argument('--cargo', default='')
        parser.add_argument('--password-stdin', action='store_true', help='Lee la contraseña de la entrada estándar (para automatizar).')

    def handle(self, *args, **opciones):
        Usuario = get_user_model()
        nombre_usuario = opciones['usuario'].strip()
        if not nombre_usuario:
            raise CommandError('El usuario no puede estar vacío.')
        if Usuario.objects.filter(username__iexact=nombre_usuario).exists():
            raise CommandError(f'Ya existe una cuenta «{nombre_usuario}».')
        correo = opciones['correo'].strip()
        if correo and Usuario.objects.filter(email__iexact=correo).exists():
            raise CommandError('Ya existe una cuenta con ese correo.')

        if opciones['password_stdin']:
            contrasena = sys.stdin.readline().rstrip('\r\n')
        else:
            contrasena = getpass.getpass('Contraseña: ')
            if contrasena != getpass.getpass('Repite la contraseña: '):
                raise CommandError('Las contraseñas no coinciden.')
        usuario = Usuario(username=nombre_usuario, email=correo, first_name=opciones['nombre'].strip()[:150])
        try:
            validate_password(contrasena, usuario)
        except ValidationError as e:
            raise CommandError('Contraseña no válida: ' + ' '.join(e.messages))

        with transaction.atomic():
            usuario.set_password(contrasena)
            usuario.save()
            Perfil.objects.create(usuario=usuario, rol=opciones['rol'], cargo=opciones['cargo'].strip())
        self.stdout.write(self.style.SUCCESS(f'Cuenta «{nombre_usuario}» creada con rol {opciones["rol"]}.'))
