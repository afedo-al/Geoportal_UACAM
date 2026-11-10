# Introducción, objetivos, metodología y plan de trabajo

**Proyecto:** Geoportal CEDESU, un sitio web con mapas para organizar, revisar, consultar y publicar la información geográfica de los estudios del Centro.

## Introducción

Buena parte del trabajo del CEDESU depende de saber dónde ocurren las cosas: dónde se tomó una muestra, qué límites tiene un área de estudio, qué tipo de clima o de municipio hay en una zona. Esa información se guarda en archivos geográficos (mapas digitales, coordenadas de campo, hojas de cálculo con ubicaciones). Hoy suele estar repartida en distintas computadoras, carpetas y formatos, y para abrirla se necesitan programas especializados que no todas las personas tienen o saben usar.

El **Geoportal CEDESU** propone resolver esto con un sitio web, al que se entra desde cualquier navegador, donde la información geográfica del Centro se encuentra ordenada en un solo lugar. En pocas palabras, el Geoportal permite:

- **Ver un mapa interactivo** y activar o desactivar la información que se quiere consultar (cada conjunto de información se llama *capa*, como una transparencia que se coloca sobre el mapa).
- **Buscar lugares y consultar datos** al hacer clic sobre un elemento del mapa, así como **medir distancias y superficies**.
- **Consultar un catálogo de estudios**, donde cada estudio tiene su ficha con título, descripción y las capas que le corresponden.
- **Subir archivos geográficos con revisión automática.** Antes de aceptar un archivo, el sistema comprueba que esté completo, que sea realmente lo que dice ser y que no represente un riesgo. Después permite ver cómo se verá en el mapa y elegir sus colores.
- **Registrar puntos de campo**, con coordenadas, fecha, tipo, descripción y fotografía, y exportarlos.
- **Decidir qué se publica.** Las funciones de carga, captura y edición requieren iniciar sesión como persona administradora, de modo que nada llegue al público sin revisión.

Este documento presenta los antecedentes, la justificación, los objetivos, la forma de trabajo, el calendario y los resultados del proyecto. Al final se incluye información adicional y un glosario con los términos técnicos explicados en lenguaje sencillo.

**Estado actual.** Ya existe una primera versión funcional de la interfaz: el mapa, el catálogo, la carga con revisión de archivos y la captura de puntos. Falta el servicio que se instala en un servidor del Centro y que permitirá la publicación definitiva, el acceso con usuarios y contraseñas reales y una segunda revisión de los archivos. Este servicio se describe como etapa siguiente.

## a) Antecedentes

### El problema que atiende el proyecto

Cuando la información geográfica no está centralizada, aparecen situaciones conocidas:

- **Información dispersa.** Un mismo estudio puede tener mapas en una computadora, coordenadas en una hoja de cálculo y fotografías en otra carpeta. Encontrar y reunir todo lleva tiempo.
- **Formatos que no se abren fácilmente.** Los archivos geográficos vienen en formatos distintos (Shapefile, KML, GeoJSON, GeoTIFF, GPX, Excel). Cada uno se abre con programas diferentes, y algunos, como el Shapefile, son en realidad varios archivos que deben viajar juntos. Si falta uno, la información se pierde o se interpreta mal.
- **Archivos sin revisar.** Un archivo puede llegar incompleto, dañado o mal georreferenciado, y nadie lo nota hasta que causa un error en un análisis. También puede ser un archivo ajeno, o incluso peligroso, con el nombre cambiado.
- **Estudios desconectados de sus datos.** No siempre es claro qué mapas y qué puntos pertenecen a qué investigación, ni quién los elaboró, de cuándo son o con qué licencia pueden usarse.
- **Datos de campo sin un registro común.** Las coordenadas tomadas con GPS, las fotos y las observaciones se anotan de maneras distintas y es difícil integrarlas.

### Qué son los SIG y los geoportales

Un Sistema de Información Geográfica (SIG) relaciona datos con su ubicación en el territorio. Representa los elementos como **puntos** (un sitio de muestreo), **líneas** (un camino o un río) y **polígonos** (un área natural o un municipio), y los organiza en capas que se pueden combinar. Un **geoportal** es un sitio web que permite consultar esas capas desde el navegador, sin instalar programas, y es una solución habitual en instituciones académicas y ambientales para compartir información territorial.

### Antecedentes del propio proyecto

El Geoportal comenzó como un prototipo estático para probar las ideas principales: el mapa, la carga de archivos y la captura de puntos. Con base en esa experiencia se tomó una decisión tecnológica (registrada en el documento de decisiones del proyecto) para construir la versión actual con herramientas más robustas y de uso extendido: **Vue 3** para la interfaz y **OpenLayers** para el mapa. El prototipo anterior, que usaba otra biblioteca de mapas, se retiró. Para las pruebas se emplean datos públicos reales: climas de la CONABIO, entidades de México y municipios de Quintana Roo.

### Pregunta que guía el proyecto

¿Cómo puede un geoportal web mejorar la gestión, revisión, consulta y publicación de la información geográfica que se genera en las actividades de investigación del CEDESU?

## b) Pertinencia

**Para el CEDESU.** Contar con un lugar único para los estudios, las capas y los puntos de campo ahorra tiempo de búsqueda, evita perder datos y facilita que distintas personas trabajen con la misma información. Además permite que el Centro decida qué se muestra públicamente y qué se queda en revisión.

**Para la investigación.** Los estudios sobre desarrollo sustentable y aprovechamiento de la vida silvestre dependen de datos con ubicación. Revisar la calidad de un archivo antes de usarlo reduce errores en los análisis. Que cada estudio conserve su autoría, fecha y licencia facilita citarlo y compartirlo correctamente.

**Para la formación académica.** El proyecto requiere recorrer todo el ciclo de desarrollo de un sistema real: entender necesidades, diseñar, programar, probar, proteger y documentar. Se aplican conocimientos de ingeniería de software, desarrollo web, procesamiento de datos geográficos y seguridad.

**Por su alcance social y ambiental.** El acceso ordenado a información territorial apoya la docencia, los trabajos de estudiantes y las decisiones informadas sobre el entorno. El Geoportal no reemplaza el criterio de las personas especialistas ni genera evaluaciones ambientales por sí mismo: facilita que la información correcta esté disponible y sea comprensible.

**Por su costo y mantenimiento.** Las herramientas elegidas son de código abierto y se publican como un sitio web común, sin licencias de software especializado. La estructura por módulos permite mantenerlo y ampliarlo por partes.

## c) Objetivo general

Desarrollar e implementar el Geoportal CEDESU, una plataforma web que permita consultar, organizar, revisar y publicar de forma controlada la información geográfica y los estudios del Centro, así como registrar puntos de campo, para facilitar el acceso a información territorial y ambiental confiable.

## d) Objetivos específicos

1. **Conocer qué necesita el Centro.** Identificar con el CEDESU qué información maneja, quién la consulta, quién la administra y qué debe poder hacerse con ella.
2. **Diseñar la estructura del sistema.** Definir sus partes y la forma en que se comunican, de manera que cada una pueda mejorarse sin afectar a las demás.
3. **Construir el mapa interactivo.** Que permita ver capas, moverse y acercarse, buscar lugares, consultar la información de un elemento y medir distancias y superficies.
4. **Crear el catálogo de estudios.** Un espacio con la ficha de cada estudio y su relación con las capas que le corresponden, editable por las personas autorizadas.
5. **Permitir la carga de archivos geográficos en los formatos más usados:** GeoJSON, Shapefile, KML/KMZ, GPX, GeoPackage, GeoTIFF, CSV y Excel.
6. **Revisar automáticamente cada archivo antes de aceptarlo**, comprobando que esté completo, que su contenido corresponda a su formato y que no sea peligroso, y explicando con mensajes claros qué falló y cómo corregirlo.
7. **Ofrecer vista previa y colores.** Que se pueda ver y ajustar cómo se mostrará una capa antes de publicarla, y que el sistema prellene la ficha del estudio con la información que el propio archivo contiene (autor, fecha, descripción).
8. **Registrar puntos de campo.** Captura de coordenadas, fecha, tipo de muestra, descripción y fotografía, con revisión de que las coordenadas sean válidas, y posibilidad de exportar e importar los puntos.
9. **Controlar la publicación y el acceso.** Que solo personas autorizadas puedan cargar, editar y publicar, y definir qué debe garantizar el servidor del Centro.
10. **Comprobar que todo funciona y es seguro**, mediante pruebas automáticas, mediciones de velocidad y revisión de seguridad.
11. **Documentar el sistema** para que pueda ser mantenido y ampliado por otras personas.

## e) Metas

| Meta | Cómo sabremos que se cumplió |
|---|---|
| Un mapa interactivo en funcionamiento | Se pueden activar capas, buscar, consultar elementos y medir distancias y áreas |
| Un catálogo de estudios | Los estudios se consultan por cualquier persona y se editan solo con sesión de administración |
| Carga de archivos con revisión | Los archivos válidos se aceptan; los incompletos, falsos o peligrosos se rechazan con un mensaje comprensible |
| Registro de puntos de campo | Se pueden crear, editar, fotografiar, exportar e importar puntos |
| Un sitio protegido | Existen protecciones contra los ataques web más comunes y límites de tamaño en la carga, descritos en el documento de seguridad |
| Un sitio rápido y probado | Las pruebas automáticas pasan y las mediciones de velocidad son altas (cercanas a 100 en computadora y 90 en celular) |
| Documentación completa | Hay un documento de seguridad, una guía técnica y la configuración para instalar el sitio |
| Servicio de publicación (siguiente etapa) | Un servidor con usuarios reales, segunda revisión de archivos, almacenamiento seguro y bitácora de movimientos |

## f) Metodología

El trabajo se organiza de forma **incremental e iterativa**: en lugar de construir todo y probarlo al final, se desarrolla un módulo a la vez (mapa, catálogo, carga, captura), se prueba, se muestra y se corrige antes de pasar al siguiente. Así los comentarios del CEDESU pueden incorporarse durante el proceso y no al terminar.

### Fase 1. Análisis de necesidades

Se identifican los tipos de información que maneja el Centro, los formatos de archivo que se recibirán, los perfiles de usuario (quien solo consulta y quien administra) y los requisitos de seguridad.
**Resultado:** lista de requerimientos del sistema.

### Fase 2. Diseño

Se define cómo se organizará el sistema: pantallas, partes del programa y flujo de uso. Se registra la decisión de utilizar Vue 3 y OpenLayers. Se establece un estilo visual uniforme.
**Resultado:** diseño de la interfaz y de la estructura del sistema.

### Fase 3. Mapa interactivo

Se construye el mapa con sus controles de acercamiento y movimiento, el panel para activar o desactivar capas, el buscador, la consulta de elementos al hacer clic y las herramientas de medición.
**Resultado:** visor funcional con datos de prueba.

### Fase 4. Catálogo de estudios y capas

Se crea el catálogo con fichas de estudio y se relacionan con sus capas. Las personas administradoras pueden editar y eliminar fichas.
**Resultado:** catálogo integrado al mapa.

### Fase 5. Carga y revisión de archivos

Esta es la parte más delicada. Cada archivo se identifica por su **contenido real** y no solo por su nombre. Algunos ejemplos de lo que se revisa:

- Que un Shapefile traiga todos sus archivos complementarios y que pertenezcan al mismo conjunto.
- Que un archivo comprimido (ZIP o KMZ) no esconda ejecutables, rutas peligrosas o un tamaño desproporcionado.
- Que un Excel no contenga macros y que un CSV no traiga fórmulas que puedan ejecutarse al abrirse.
- Que un archivo con extensión de mapa no sea en realidad un programa, una página web o un PDF.
- Que no haya archivos duplicados en el mismo lote y que cada uno quede identificado con una huella digital única, para comprobar después que no cambió.

La revisión se hace en el navegador, sin congelar la pantalla (un Shapefile de 17.8 MB y más de un millón de puntos se revisa en unos 2.7 segundos). El servidor repetirá estas revisiones, como segunda barrera, en la etapa siguiente.
**Resultado:** módulo de carga con informe claro de cada archivo.

### Fase 6. Vista previa, colores y captura de puntos

Después de la revisión, la persona puede ver la capa en el mapa, ajustar su aspecto y completar la ficha del estudio, que el sistema prellena con la información del archivo cuando existe. También se desarrolla el registro de puntos de campo, con validación de coordenadas y fotografías revisadas por su contenido real.
**Resultado:** vista previa, simbología y captura de puntos operando.

### Fase 7. Publicación controlada y servidor

Se define el flujo que lleva un archivo desde que se carga hasta que se publica, y qué debe cumplir el servidor del Centro: acceso con usuarios reales, segunda revisión de archivos, almacenamiento aislado, antivirus y registro de cada carga, rechazo y publicación. El flujo propuesto es: recibido, en revisión, requiere corrección, aprobado, publicado y archivado.
**Resultado:** especificación del servicio de publicación (la instalación en servidor es la etapa siguiente).

### Fase 8. Pruebas

- **Pruebas automáticas** de las funciones de coordenadas, formatos y geometría.
- **Pruebas de uso** en el navegador, recorriendo las pantallas principales.
- **Pruebas de velocidad**, con una herramienta de medición estándar.
- **Revisión de seguridad** de la carga de archivos y del sitio.
**Resultado:** versión corregida, con evidencia de las pruebas.

### Fase 9. Documentación y presentación

Se documenta la estructura, los controles de seguridad, la instalación y el uso, y se prepara una demostración para el CEDESU.
**Resultado:** documentos y demostración final.

### Herramientas utilizadas

Vue 3 (pantallas), OpenLayers 10 (mapa), Vite (construcción del sitio), SheetJS (lectura de Excel), nginx (servidor web con cabeceras de seguridad) y Git (control de versiones). Todas son de código abierto.

## g) Cronograma de actividades

El trabajo se planeó en ocho semanas. La columna de estado refleja el avance actual.

| N.º | Actividad | Periodo | Estado |
|---|---|---|---|
| 1 | Análisis de necesidades y alcance | Semana 1 | Completado |
| 2 | Diseño de estructura e interfaz | Semana 2 | Completado |
| 3 | Mapa interactivo | Semanas 3 y 4 | Completado |
| 4 | Catálogo de estudios y administración de capas | Semana 5 | Completado |
| 5 | Carga y revisión de archivos | Semana 6 | Completado |
| 6 | Vista previa, colores y captura de puntos | Semana 7 | Completado |
| 7 | Pruebas, seguridad y velocidad | Semana 8 | En curso |
| 8 | Documentación y presentación | Semana 8 | En curso |
| 9 | Servicio de publicación en servidor | Etapa siguiente | Pendiente |

El cronograma es una guía y puede ajustarse según las observaciones del CEDESU y la disponibilidad del servidor donde se instalará el sistema.

## h) Impacto social

**En la comunidad académica.** Estudiantes, docentes e investigadores podrán consultar mapas y estudios desde un navegador, sin programas especializados, y tendrán un lugar donde ver cómo se relacionan los datos con el territorio.

**En el Centro.** La información deja de depender de personas o computadoras específicas. Cada estudio queda con su ficha, su autoría y su licencia, lo que facilita compartirlo con orden y darle seguimiento.

**En el cuidado del ambiente.** Contar con capas organizadas (límites, municipios, clima, puntos de muestreo) ayuda a que los estudios de conservación y aprovechamiento sustentable se apoyen en información más accesible y mejor revisada.

**En la confianza en los datos.** La revisión previa de cada archivo y el control de lo que se publica reducen el riesgo de difundir información incompleta o errónea.

**En la difusión.** El Centro podrá decidir qué estudios se muestran al público, con qué nivel de acceso y bajo qué licencia, de acuerdo con sus políticas.

**A largo plazo.** La base técnica podrá crecer con nuevos estudios y herramientas, siempre que el CEDESU lo apruebe.

## i) Resultados esperados

1. **Un sitio web funcional** que reúne mapa, catálogo, carga de archivos y registro de puntos de campo en una sola interfaz.
2. **Archivos revisados antes de aceptarse**, con mensajes que explican en palabras sencillas por qué un archivo fue rechazado y qué hacer.
3. **Fichas de estudio prellenadas** con la información que traen los archivos, para evitar captura repetida.
4. **Un registro ordenado de puntos de campo**, con fotografía, exportable para otros análisis.
5. **Un sitio protegido y rápido**, con medidas contra los ataques web más comunes y buen desempeño en computadora y celular.
6. **Evidencia de pruebas** que demuestre que lo desarrollado funciona.
7. **Documentación** de la estructura, la seguridad y la instalación.
8. **Una especificación clara del servicio de publicación**, que indique lo que el servidor del Centro debe cumplir para poner el Geoportal en línea.

---

# III. Información adicional que consideren relevante para respaldar el tema de investigación.

## 1. Qué se tiene hoy y qué falta

| Ya funciona en la interfaz | Depende del servidor (etapa siguiente) |
|---|---|
| Mapa, capas, búsqueda y medición | Usuarios y contraseñas reales |
| Catálogo y fichas de estudio | Guardado permanente de archivos y estudios |
| Carga, revisión y vista previa de archivos | Segunda revisión de archivos con herramientas profesionales y antivirus |
| Captura, exportación e importación de puntos | Publicación al público y bitácora de movimientos |

Mientras no exista el servidor, los puntos de campo y las ediciones del catálogo se guardan únicamente en el navegador de quien los captura. La cuenta de administración que existe hoy es solo de demostración y se encuentra en la versión de desarrollo, no en la versión para publicar. La captura de recorridos o trayectos no está desarrollada y requiere definirse con el Centro.

## 2. Formatos de archivo admitidos

| Formato | Para qué sirve |
|---|---|
| GeoJSON | Puntos, líneas y polígonos con sus datos, en un solo archivo de texto |
| Shapefile (.shp y archivos acompañantes) | Formato muy usado en SIG; exige varios archivos juntos |
| KML / KMZ | Formato de Google Earth |
| GPX | Rutas y puntos tomados con GPS |
| GeoPackage | Base de datos geográfica en un solo archivo |
| GeoTIFF | Imágenes y mapas con ubicación (por ejemplo, de satélite) |
| CSV y Excel | Tablas con columnas de coordenadas |

## 3. Cómo se protege la información

- **Los archivos se identifican por lo que contienen**, no por su nombre.
- **Límites de carga:** hasta 60 capas y 400 MB por lote, y 60 MB por archivo leído en el navegador.
- **Protección del sitio contra ataques comunes** (código malicioso, páginas que intentan suplantarlo, entradas manipuladas).
- **Acceso restringido** para cargar, capturar y editar, con bloqueo temporal tras varios intentos fallidos.
- **Las fotografías de los puntos** deben ser realmente imágenes (PNG, JPEG o WebP) y pesar hasta 2 MB.
- **La ubicación del dispositivo** solo se consulta cuando la persona lo solicita y no se envía a ningún servidor.
- **Principio de fondo:** la revisión en el navegador es una primera barrera; la definitiva la hará el servidor.

## 4. Datos de prueba utilizados

Climas de la CONABIO (escala 1:1,000,000), entidades de México y municipios de Quintana Roo (2015).

## 5. Posibles ampliaciones futuras

Estas mejoras requieren evaluar su necesidad con el CEDESU:

- Herramientas de análisis espacial.
- Conexión con servicios de mapas de otras instituciones.
- Búsquedas por filtros (por tema, fecha o zona).
- Visualización de imágenes satelitales de mayor detalle.
- Permisos por tipo de persona (consulta, captura, revisión, administración).
- Registro de recorridos y trayectos con GPS.

## 6. Documentos de respaldo

Documento de seguridad de la interfaz, guía técnica del proyecto y configuración del servidor web, incluidos en el repositorio del proyecto.

## 7. Glosario

| Término | Significado |
|---|---|
| Capa | Conjunto de información geográfica que se muestra sobre el mapa |
| Geoportal | Sitio web para consultar información geográfica |
| SIG | Sistema de Información Geográfica: herramientas para trabajar con datos con ubicación |
| Shapefile | Formato de mapas vectoriales formado por varios archivos |
| KML / KMZ | Formato de mapas usado por Google Earth (KMZ es su versión comprimida) |
| GeoJSON | Formato de texto para puntos, líneas y polígonos |
| GeoTIFF | Imagen con ubicación geográfica |
| GPX | Formato de rutas y puntos de un GPS |
| Coordenadas | Latitud y longitud que indican un lugar en la Tierra |
| Simbología | Colores y estilos con que se dibuja una capa |
| Metadatos | Información sobre los datos: autor, fecha, descripción, licencia |
| Validación | Revisión automática de que un archivo está completo y es correcto |
| Huella digital (SHA-256) | Código único de un archivo; si el archivo cambia, el código cambia |
| API / servidor | Programa instalado en un equipo del Centro que recibe, guarda y publica los archivos |
