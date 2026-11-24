"""Configuración del servicio de publicación.

Todo se define con variables de entorno `GEOPORTAL_*`; no hay secretos en el código. En producción
(`GEOPORTAL_DEBUG` apagado) faltar la clave secreta o los hosts permitidos detiene el arranque.
"""
import os
from pathlib import Path
from urllib.parse import urlparse, unquote

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env(nombre, defecto=None):
    return os.environ.get(f'GEOPORTAL_{nombre}', defecto)


def env_bool(nombre, defecto=False):
    valor = env(nombre)
    return defecto if valor is None else valor.strip().lower() in ('1', 'true', 'si', 'sí', 'yes')


def env_lista(nombre, defecto=()):
    valor = env(nombre)
    return list(defecto) if valor is None else [x.strip() for x in valor.split(',') if x.strip()]


def env_int(nombre, defecto):
    try:
        return int(env(nombre, defecto))
    except (TypeError, ValueError):
        raise ImproperlyConfigured(f'GEOPORTAL_{nombre} debe ser un número entero.')


DEBUG = env_bool('DEBUG', False)

SECRET_KEY = env('SECRET_KEY')
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured('Define GEOPORTAL_SECRET_KEY (una cadena larga y aleatoria) antes de arrancar.')
    SECRET_KEY = 'clave-insegura-solo-para-desarrollo-local'

ALLOWED_HOSTS = env_lista('ALLOWED_HOSTS', ['127.0.0.1', 'localhost'] if DEBUG else [])
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured('Define GEOPORTAL_ALLOWED_HOSTS (dominios separados por comas).')

# Detrás de nginx: confiar en X-Forwarded-For y X-Forwarded-Proto solo si el proxy es de confianza.
CONFIAR_EN_PROXY = env_bool('TRUST_PROXY', False)
if CONFIAR_EN_PROXY:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Carpeta de datos del servicio: base SQLite (solo desarrollo) y fotografías. Nunca la sirve nginx.
DATA_DIR = Path(env('DATA_DIR', BASE_DIR / 'datos'))

INSTALLED_APPS = [
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'nucleo',
    'cuentas',
    'puntos',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'nucleo.middleware.CabeceraAjaxMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'cuentas.middleware.SesionAcotadaMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'nucleo.middleware.CabecerasRespuestaMiddleware',
]
X_FRAME_OPTIONS = 'DENY'

# HTTPS y HSTS los aplica nginx (deploy/nginx-seguridad.conf); repetirlos aquí duplicaría las cabeceras.
SILENCED_SYSTEM_CHECKS = ['security.W004', 'security.W008']

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
APPEND_SLASH = False


def _base_de_datos():
    url = env('DATABASE_URL')
    if not url:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        return {'ENGINE': 'django.db.backends.sqlite3', 'NAME': DATA_DIR / 'db.sqlite3'}
    u = urlparse(url)
    motores = {'postgres': 'django.db.backends.postgresql', 'postgresql': 'django.db.backends.postgresql', 'sqlite': 'django.db.backends.sqlite3'}
    if u.scheme not in motores:
        raise ImproperlyConfigured('GEOPORTAL_DATABASE_URL debe empezar con postgresql:// o sqlite:///.')
    if u.scheme == 'sqlite':
        return {'ENGINE': motores[u.scheme], 'NAME': unquote(u.path[1:]) or DATA_DIR / 'db.sqlite3'}
    return {
        'ENGINE': motores[u.scheme], 'NAME': unquote(u.path[1:]), 'USER': unquote(u.username or ''),
        'PASSWORD': unquote(u.password or ''), 'HOST': u.hostname or '', 'PORT': str(u.port or ''),
        'CONN_MAX_AGE': 60,
    }


DATABASES = {'default': _base_de_datos()}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTHENTICATION_BACKENDS = ['cuentas.backends.UsuarioOCorreo']

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 12}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ---------------- sesiones y cookies ----------------
# Duración máxima de la sesión y cierre por inactividad (la interfaz refleja estos valores).
SESION_MAXIMA_HORAS = env_int('SESSION_MAX_HOURS', 8)
INACTIVIDAD_MINUTOS = env_int('IDLE_MINUTES', 30)
SESSION_COOKIE_AGE = INACTIVIDAD_MINUTOS * 60
SESSION_SAVE_EVERY_REQUEST = True          # cada petición renueva la ventana de inactividad
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Strict'
CSRF_COOKIE_HTTPONLY = False                # la interfaz lee la cookie para enviar X-CSRFToken
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_TRUSTED_ORIGINS = env_lista('CSRF_TRUSTED_ORIGINS')
CSRF_FAILURE_VIEW = 'nucleo.http.csrf_fallo'

COOKIES_SEGURAS = env_bool('SECURE_COOKIES', not DEBUG)
if COOKIES_SEGURAS:
    # El prefijo __Host- obliga a Secure, ruta «/» y ningún dominio; la interfaz ya lo espera.
    SESSION_COOKIE_NAME = '__Host-sessionid'
    CSRF_COOKIE_NAME = '__Host-csrftoken'
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# ---------------- límites ----------------
DATA_UPLOAD_MAX_MEMORY_SIZE = env_int('MAX_BODY_MB', 40) * 1024 * 1024   # un lote con fotografías cabe aquí
FOTO_MAX_BYTES = 2 * 1024 * 1024
FOTO_MAX_PIXELES = 40_000_000
PUNTOS_MAX_POR_LOTE = 2000
INTENTOS_MAX = 5                 # accesos fallidos antes de bloquear
INTENTOS_VENTANA_MIN = 15        # minutos que dura el bloqueo
INTENTOS_MAX_POR_IP = 30

# Cuenta de demostración: solo existe con DEBUG y si se definen estas variables. Nunca en producción.
CUENTA_DEMO = None
if DEBUG and env('DEMO_USUARIO') and env('DEMO_CONTRASENA'):
    CUENTA_DEMO = {'usuario': env('DEMO_USUARIO'), 'contrasena': env('DEMO_CONTRASENA')}

LANGUAGE_CODE = 'es-mx'
TIME_ZONE = 'America/Merida'
USE_TZ = True
USE_I18N = True

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'simple': {'format': '%(asctime)s %(levelname)s %(name)s: %(message)s'}},
    'handlers': {'consola': {'class': 'logging.StreamHandler', 'formatter': 'simple'}},
    'root': {'handlers': ['consola'], 'level': env('LOG_LEVEL', 'INFO')},
}
