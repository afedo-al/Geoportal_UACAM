# Servicio de publicación de DeltaMap-CEDESU

API en Django que respalda la interfaz de `web/`. Esta primera entrega cubre las fases 0 a 2 del plan:

| Fase | Qué incluye | Estado |
|---|---|---|
| 0 · Fundación | Proyecto Django, configuración por variables de entorno, salud, CI con PostgreSQL | Hecha |
| 1 · Sesiones y roles | Entrar y salir, roles `admin` e `investigador`, bloqueo por intentos, bitácora | Hecha |
| 2 · Puntos de campo | Alta, edición y baja de puntos, importación por lote, fotografías | Hecha |
| 3 a 7 | Cargas, segunda revisión, publicación, despliegue y aceptación | Pendientes |

## Requisitos

- Python 3.12 o superior.
- PostgreSQL 14 o superior en producción. En desarrollo basta SQLite, que se crea solo.

## Puesta en marcha (desarrollo)

Desde `backend/`:

```bash
python -m venv .venv
```

```bash
.venv/Scripts/pip install -r requirements.txt
```

En Linux o macOS la ruta es `.venv/bin/pip` (y `.venv/bin/python` en los comandos siguientes).

```bash
GEOPORTAL_DEBUG=1 .venv/Scripts/python manage.py migrate
```

```bash
GEOPORTAL_DEBUG=1 .venv/Scripts/python manage.py crear_usuario maria --rol admin --nombre "María López" --cargo "Coordinación"
```

La contraseña se pide por teclado (dos veces) y debe tener al menos 12 caracteres. Nunca se pasa como argumento.

```bash
GEOPORTAL_DEBUG=1 .venv/Scripts/python manage.py runserver 127.0.0.1:8000
```

Para usar la interfaz contra este servicio, desde `web/`:

```bash
GEOPORTAL_API=http://127.0.0.1:8000 npm run dev
```

Y compilar la interfaz con la API activada:

```bash
VITE_API_BASE=/api npm run build
```

En Git Bash para Windows antepón `MSYS_NO_PATHCONV=1` a ese último comando: si no, Git Bash convierte `/api` en una ruta de disco.

## Pruebas

```bash
.venv/Scripts/python manage.py test
```

Son 80 pruebas. Cubren:

| Área | Qué se prueba |
|---|---|
| Núcleo | Salud, errores en JSON, cabecera `X-Requested-With`, CSRF, bitácora que no se edita ni se borra, arranque que exige clave y hosts. |
| Sesiones | Entrar con usuario o correo, mismo mensaje para usuario inexistente y contraseña errónea, cuentas sin perfil o inactivas, cambio de clave de sesión al entrar, cookie `HttpOnly`, caducidad absoluta, salida. |
| Bloqueo | Cinco fallos bloquean la cuenta aunque luego la contraseña sea correcta; no afecta a otras cuentas; cuenta igual con usuario o correo; termina con el tiempo; bloqueo por dirección. |
| Cuentas | Comando `crear_usuario`: rol, contraseña débil, usuario o correo repetidos. |
| Puntos | Acceso solo con sesión, ids del servidor, valores por omisión, validación de coordenadas, altitud, fecha, hora y textos, edición parcial, permisos por autor o administración, lote de todo o nada. |
| Fotografías | PNG, JPEG y WebP; tipo declarado contra contenido; SVG, HTML, GIF y enlaces externos rechazados; límite de 2 MB y de resolución; metadatos EXIF eliminados; conservar, quitar y reemplazar; borrado del archivo. |

La integración continua corre las mismas pruebas contra PostgreSQL 16 y comprueba que no falten migraciones.

## Configuración

Todo se define con variables de entorno. Hay una plantilla en [.env.example](.env.example).

| Variable | Descripción | Por omisión |
|---|---|---|
| `GEOPORTAL_SECRET_KEY` | Clave secreta de Django. **Obligatoria** sin `DEBUG`. | Ninguna |
| `GEOPORTAL_ALLOWED_HOSTS` | Dominios permitidos, separados por comas. **Obligatoria** sin `DEBUG`. | `127.0.0.1,localhost` con `DEBUG` |
| `GEOPORTAL_DEBUG` | Modo de desarrollo. Nunca en producción. | `0` |
| `GEOPORTAL_DATABASE_URL` | `postgresql://usuario:clave@host:puerto/base` o `sqlite:///ruta`. | SQLite en la carpeta de datos |
| `GEOPORTAL_DATA_DIR` | Carpeta de datos: fotografías y, sin PostgreSQL, la base. nginx no debe servirla. | `backend/datos` |
| `GEOPORTAL_TRUST_PROXY` | Detrás de nginx: confía en `X-Forwarded-For` y `X-Forwarded-Proto`. | `0` |
| `GEOPORTAL_CSRF_TRUSTED_ORIGINS` | Orígenes de confianza para CSRF, por ejemplo `https://geoportal.ejemplo.mx`. | Ninguno |
| `GEOPORTAL_SECURE_COOKIES` | Cookies `Secure` con prefijo `__Host-`. | `1` sin `DEBUG` |
| `GEOPORTAL_SESSION_MAX_HOURS` | Duración máxima de una sesión. | `8` |
| `GEOPORTAL_IDLE_MINUTES` | Cierre por inactividad. | `30` |
| `GEOPORTAL_MAX_BODY_MB` | Tamaño máximo de un cuerpo JSON (un lote con fotos). | `40` |
| `GEOPORTAL_LOG_LEVEL` | Nivel de registro. | `INFO` |
| `GEOPORTAL_DEMO_USUARIO`, `GEOPORTAL_DEMO_CONTRASENA` | Cuenta que `GET /api/demo` muestra en el diálogo de acceso. Solo con `DEBUG`. | Ninguna |

## API implementada

Todas las rutas cuelgan de `/api/`. Los errores responden `{ "detalle": "..." }`. Las peticiones que modifican datos
exigen el token CSRF (cookie `csrftoken`, que deja `GET /api/sesion`) en `X-CSRFToken` y la cabecera
`X-Requested-With: GeoportalCEDESU`.

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| GET | `/salud` | Cualquiera | `{ "estado": "ok" }` si el servicio y la base responden; 503 si no. |
| GET | `/sesion` | Cualquiera | Persona con sesión o `{ "usuario": null }`. Deja la cookie CSRF. |
| POST | `/sesion` | Cualquiera | Entra con `{ usuario, contrasena }` (usuario o correo). 401 si falla, 429 si está bloqueado. |
| DELETE | `/sesion` | Con sesión | Sale. 204. |
| GET | `/demo` | Cualquiera | Cuenta de demostración; 404 salvo en desarrollo configurado. |
| GET | `/puntos` | Con sesión | Todos los puntos del equipo: `{ "puntos": [...] }`. |
| POST | `/puntos` | Con sesión | Crea un punto. 201 con el punto. |
| GET | `/puntos/<id>` | Con sesión | Un punto. |
| PUT | `/puntos/<id>` | Autor o `admin` | Edita lo que se mande; lo demás se conserva. |
| DELETE | `/puntos/<id>` | Autor o `admin` | Borra el punto y su fotografía. 204. |
| POST | `/puntos/lote` | Con sesión | `{ "puntos": [...] }`, hasta 2 000. Todo o nada; la fotografía no válida se descarta y se cuenta en `fotosDescartadas`. |
| GET | `/puntos/<id>/foto` | Con sesión | La fotografía, con `Content-Security-Policy: sandbox`. |

Respuesta de sesión:

```json
{
  "usuario": { "id": 1, "usuario": "maria", "nombre": "María López", "correo": "", "cargo": "Coordinación", "rol": "admin", "demo": false },
  "expira": 1795190400000,
  "inactividadMinutos": 30
}
```

Punto:

```json
{
  "id": "P-3b77810b0f", "name": "Muestra de suelo 01", "lat": 19.8452, "lon": -90.5231, "altitude": 12.5,
  "property": "Parcela A", "author": "Brigada A", "type": "Muestra de suelo", "description": "",
  "date": "2026-11-20", "time": "10:30", "photo": "puntos/P-3b77810b0f/foto", "creadoPor": "maria"
}
```

Reglas de un punto (las mismas de la interfaz): latitud de 14 a 22, longitud de -93 a -86, altitud de -500 a 9 000 m
u omitida, fecha `AAAA-MM-DD`, hora `HH:MM`, nombre y predio de hasta 120 caracteres, descripción de hasta 1 000.
El `id` lo genera siempre el servidor. En `photo` se manda una imagen como `data:image/png|jpeg|webp;base64,...`;
si la clave no viene se conserva la actual y si viene vacía se quita.

## Seguridad

- **Configuración que falla cerrada:** sin clave secreta u hosts permitidos el servicio no arranca en producción.
- **Sesión:** cookie `HttpOnly`, `SameSite=Strict` y, en producción, `Secure` con prefijo `__Host-`. La clave de sesión cambia al entrar. Caduca a los 30 min sin actividad y a las 8 h aunque haya actividad.
- **Fuerza bruta:** cinco fallos en 15 minutos bloquean la cuenta (también si se alterna usuario y correo) y 30 fallos bloquean la dirección. Durante el bloqueo no se comprueba la contraseña.
- **Sin enumeración de cuentas:** mismo mensaje y tiempo de cálculo para cuenta inexistente, contraseña errónea o cuenta sin perfil.
- **Permisos en cada petición:** una cuenta sin perfil no entra; solo el autor o `admin` cambia un punto.
- **CSRF** con el middleware de Django y además la cabecera `X-Requested-With` obligatoria.
- **Fotografías:** se abren y se vuelven a guardar con Pillow, lo que valida que sean imágenes reales y elimina los metadatos (incluida la ubicación EXIF). Se guardan con el id del servidor en una carpeta que nginx no sirve, y se entregan con `Content-Security-Policy: sandbox` y `nosniff`.
- **Bitácora de solo agregar:** accesos, fallos, cierres, caducidades y cambios en los puntos. El código no puede editar ni borrar registros. Nunca guarda contraseñas.
- **Contraseñas** con los validadores de Django (mínimo 12 caracteres, no comunes, no solo números).

## Producción

1. Instalar dependencias de producción:

```bash
pip install -r requirements-prod.txt
```

2. Definir las variables de [.env.example](.env.example) en el servicio del sistema.
3. Migrar y crear la primera cuenta de administración con `manage.py migrate` y `manage.py crear_usuario`.
4. Arrancar con gunicorn escuchando solo en el equipo local:

```bash
gunicorn config.wsgi --bind 127.0.0.1:8000 --workers 3
```

5. nginx reenvía `/api/` a `127.0.0.1:8000` según [deploy/nginx-seguridad.conf](../deploy/nginx-seguridad.conf).

Pendiente de verificar en un servidor real: gunicorn, PostgreSQL fuera de la integración continua y la configuración con TLS.
La guía de operación completa es parte de la fase 6.

## Estructura

```text
backend/
├── manage.py
├── requirements.txt          # Django y Pillow
├── requirements-prod.txt     # + gunicorn y psycopg
├── .env.example              # Plantilla de variables (sin secretos)
├── config/                   # Configuración, rutas y WSGI
├── nucleo/                   # Errores JSON, cabeceras, bitácora, salud y ayudas de pruebas
├── cuentas/                  # Perfil y rol, sesión, bloqueo por intentos, comando crear_usuario
└── puntos/                   # Modelo, validación, fotografías y vistas de los puntos de campo
```
