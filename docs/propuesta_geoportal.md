# Introducción, objetivos, metodología y plan de trabajo

**Proyecto:** DeltaMap-CEDESU, visualizador cartográfico institucional del Centro de Estudios de Desarrollo Sustentable y Aprovechamiento de la Vida Silvestre (CEDESU), Universidad Autónoma de Campeche.

**Lugar y responsable:** Laboratorio de Desarrollo de Aplicaciones de la Facultad de Ingeniería, bajo la responsabilidad del docente Joel C. Flores Escalante.

**Duración:** aproximadamente siete meses, de septiembre de 2026 a abril de 2027.

## Introducción

En la actualidad, el uso de herramientas tecnológicas para la gestión, análisis y representación de información geográfica se ha convertido en un elemento importante para las investigaciones relacionadas con el territorio, el medio ambiente y la planificación de los recursos naturales. La información espacial permite identificar características de las regiones, representar fenómenos territoriales y comprender las relaciones entre los componentes naturales y las actividades humanas. Sin embargo, para aprovecharla es necesario contar con sistemas que permitan almacenarla, organizarla, procesarla, visualizarla y consultarla de manera estructurada.

Los Sistemas de Información Geográfica (SIG) son la herramienta fundamental para trabajar con información asociada a una ubicación, mediante mapas, capas de datos y elementos de representación espacial. Su aprovechamiento también depende de plataformas que faciliten la consulta y la administración, especialmente cuando se manejan distintos archivos, formatos y fuentes.

El CEDESU es el contexto institucional de esta propuesta. Sus actividades de investigación, estudio y análisis sobre desarrollo sustentable y aprovechamiento de los recursos naturales requieren información que permita representar y comprender el territorio. Disponer de mecanismos digitales para organizar y consultar esa información fortalece el trabajo académico y de investigación.

A partir de esta necesidad se propone **DeltaMap-CEDESU**, una plataforma web que centraliza, organiza, visualiza y administra información geográfica en un entorno interactivo. En una sola interfaz permite:

- **Consultar un mapa interactivo** y activar o desactivar capas (cada conjunto de información geográfica es una *capa*, como una transparencia que se coloca sobre el mapa), buscar lugares, consultar los datos de cada elemento y medir distancias y superficies.
- **Consultar un catálogo de estudios**, con una ficha por estudio (responsable, fuente, licencia, descripción) relacionada con sus capas.
- **Incorporar archivos geográficos** con revisión previa de formato, estructura e inconsistencias, vista previa en el mapa y herramientas de simbología (colores, líneas y puntos).
- **Registrar puntos de campo** con coordenadas, fotografía y datos descriptivos, e importarlos desde Excel.
- **Publicar de forma controlada.** Ninguna capa llega al público sin pasar por revisión y aprobación de una persona autorizada.

El proyecto no se limita a un visor de mapas: es una propuesta de solución tecnológica para mejorar el manejo de la información geográfica mediante procesos estructurados de incorporación, validación, visualización y publicación de datos, con una arquitectura que permite integrar sus componentes de forma progresiva.

**Estado actual (24 de noviembre de 2026).** La interfaz está completa y funciona con datos de prueba. El servicio de publicación en servidor (Django) ya ofrece acceso con usuarios y roles, bloqueo por intentos fallidos, bitácora y registro de puntos de campo con fotografías. Siguen pendientes las cargas en el servidor, la segunda revisión de archivos, la publicación definitiva y el despliegue. Ver el apartado «Cronograma» y la sección III.

## a) Antecedentes

El uso de los SIG en la investigación ambiental y territorial se ha consolidado durante las últimas décadas en el estudio de la biodiversidad, el uso del suelo, la conservación de ecosistemas y la planeación de los recursos naturales. Al principio se usaban programas de escritorio especializados, lo que limitaba su acceso a personal con formación técnica y equipos específicos. Con las tecnologías web surgieron los **geoportales** y los visores cartográficos en línea, que permiten consultar información espacial desde un navegador sin instalar programas. Instituciones de gobierno, centros de investigación y universidades los han adoptado apoyándose en estándares abiertos y formatos de intercambio como GeoJSON, Shapefile y KML, y en servicios como WMS y WFS. Las bibliotecas de código abierto para mapas web (como Leaflet y OpenLayers) han facilitado construir mapas interactivos, personalizables y compatibles con distintos dispositivos.

En los centros de investigación es frecuente que la información geográfica se genere de forma dispersa: archivos en equipos personales, en distintos formatos y sistemas de coordenadas, sin una estructura común de documentación. Esto dificulta la consulta, la reutilización y el control de calidad de los datos y reduce su aprovechamiento en nuevos estudios. Cuando falta un archivo complementario (en un Shapefile, por ejemplo), cuando un archivo llega dañado o mal georreferenciado, o cuando es ajeno al formato que declara, el problema suele notarse hasta que causa un error en un análisis.

El CEDESU genera y requiere información territorial de manera constante. Hasta ahora no cuenta con una plataforma propia que centralice esa información, permita consultarla en un entorno interactivo y regule qué datos se publican. De ahí surge la propuesta de una plataforma web que integre un visor cartográfico, la administración de capas, un catálogo de estudios y un proceso de incorporación, validación y publicación controlada de archivos geográficos.

### Antecedentes del propio proyecto

El trabajo comenzó con un prototipo estático para probar las ideas principales: el mapa, la carga de archivos y la captura de puntos. Con esa experiencia se decidió construir la versión actual con herramientas más robustas y de uso extendido: **Vue 3** para la interfaz y **OpenLayers 10** para el mapa, en lugar de Leaflet, que se consideró en la propuesta inicial. OpenLayers ofrece lo que el proyecto necesita en las etapas siguientes: proyecciones y sistemas de coordenadas, teselas vectoriales y renderizado acelerado. El prototipo anterior se retiró. Para las pruebas se usan datos públicos reales: climas de la CONABIO, entidades de México y municipios de Quintana Roo.

### Pregunta que guía el proyecto

¿Cómo puede un geoportal web mejorar la gestión, revisión, consulta y publicación de la información geográfica que se genera en las actividades de investigación del CEDESU?

## b) Pertinencia

- **Necesidad institucional.** El CEDESU trabaja con información territorial y ambiental cuyo valor depende de que pueda organizarse, consultarse y compartirse de forma ordenada. Una plataforma centralizada reduce la dispersión de archivos, evita duplicidades y facilita el acceso del personal académico y de investigación.
- **Calidad y control de la información.** La validación de formatos y estructura, junto con la vista previa y la publicación controlada, permite detectar inconsistencias antes de que los datos se consulten y aumenta la confiabilidad de lo que se difunde.
- **Accesibilidad.** Al ser una aplicación web, las personas consultan mapas y capas desde un navegador, sin programas SIG de escritorio ni conocimientos técnicos avanzados.
- **Viabilidad tecnológica.** Las tecnologías web y las bibliotecas de código abierto reducen costos de licencias, favorecen el mantenimiento y permiten una arquitectura que crece por etapas.
- **Escalabilidad.** Delimitar la primera versión a las funciones esenciales da una base sólida para incorporar, previa evaluación con el CEDESU, capacidades adicionales como el registro de recorridos y trayectos.
- **Apoyo a la investigación y a la gestión del conocimiento.** El catálogo de estudios vincula la información geográfica con las investigaciones que la originan, y fortalece la memoria institucional y la difusión de resultados.

## c) Objetivo general

Desarrollar e implementar una plataforma web interactiva que permita centralizar, organizar, validar, visualizar y administrar información geográfica del CEDESU, mediante un visor cartográfico, la gestión de capas, un catálogo de estudios y un proceso de publicación controlada de datos.

## d) Objetivos específicos

1. Identificar y documentar, junto con el CEDESU, los requerimientos funcionales y no funcionales de la plataforma, así como los tipos de información geográfica y los formatos que se manejarán.
2. Diseñar la arquitectura del sistema y la estructura de la base de datos para almacenar capas, estudios, usuarios y estados de publicación.
3. Desarrollar un visor cartográfico basado en OpenLayers que represente capas superpuestas sobre un mapa base e incluya herramientas de navegación, búsqueda, consulta y medición, con un mapa base sin límites administrativos que no estorbe a las capas de investigación.
4. Implementar un módulo de administración de capas que permita activarlas, desactivarlas, consultarlas y organizarlas, con un renderizado fluido al acercar y alejar la vista aun con varias capas activas.
5. Construir un catálogo de estudios que permita registrar, consultar y relacionar investigaciones y proyectos territoriales con sus capas.
6. Desarrollar un mecanismo de carga de archivos geográficos y tablas (CSV y Excel, GeoJSON, Shapefile, KML/KMZ, GPX, GeoPackage y GeoTIFF) con revisión de formatos, validación de estructura e identificación de inconsistencias, primero en el navegador y de forma definitiva en el servidor.
7. Incorporar la vista previa espacial de los datos y herramientas de simbología para su interpretación visual.
8. Establecer un flujo de publicación controlada, con usuarios autenticados y roles, segunda revisión, versiones y bitácora, que determine qué información queda disponible en el portal.
9. Realizar pruebas funcionales, de rendimiento y de usabilidad con usuarios del CEDESU, y documentar el sistema para su mantenimiento y evolución.

## e) Metas

| Meta | Cómo se verifica | Estado |
|---|---|---|
| Documento de requerimientos validado por el CEDESU | Se concluye la fase de análisis y se valida el alcance | Por confirmar con el CEDESU |
| Modelo de datos y arquitectura aprobados antes de desarrollar | Hay un documento de arquitectura y un contrato de API | Documentos hechos; falta su aprobación y el modelo espacial en PostGIS |
| Visor con mapa base y capas que se activan y desactivan | Se superponen, activan y consultan capas | Hecha |
| Carga de archivos en los formatos acordados, con mensajes claros ante archivos inválidos | Los válidos se aceptan; los incompletos, falsos o peligrosos se rechazan con una explicación | Hecha en el navegador; falta el servidor |
| Catálogo de estudios con registro, consulta y vínculo a capas | Fichas editables solo con sesión de administración | Hecha en la interfaz; falta guardarlo en el servidor |
| Flujo de publicación con al menos borrador, en revisión y publicado | Estados con nota obligatoria al devolver o archivar | Hecha en modo local; falta el servidor |
| Una ronda de pruebas con usuarios del CEDESU y atención a observaciones | Informe de pruebas | Pendiente |
| Primera versión funcional con documentación técnica y manual de usuario | Entrega y validación | En curso |
| Lista de funciones futuras, incluidos GPS y recorridos | Documento de ampliaciones | Hecha (captura de puntos ya construida; recorridos por evaluar) |

## f) Metodología

El proyecto sigue un enfoque de desarrollo **iterativo e incremental**: cada componente se construye, se prueba y se valida con el CEDESU antes de integrarse al conjunto. Así las observaciones se incorporan pronto y la arquitectura se mantiene ordenada. Las etapas son las siguientes.

1. **Análisis y levantamiento de requerimientos.** Reuniones y entrevistas con el personal del CEDESU para conocer sus necesidades, los tipos de datos geográficos, formatos y sistemas de coordenadas, y los perfiles de usuario (consulta y administración). Se revisan plataformas similares. *Resultado:* documento de requerimientos y alcance de la primera versión.
2. **Diseño del sistema.** Arquitectura (interfaz, servidor, base de datos y procesamiento de archivos), modelo de datos para capas, estudios, usuarios y estados de publicación, prototipos de las interfaces y criterios de seguridad y control de acceso. *Resultado:* documento de arquitectura y contrato de API.
3. **Desarrollo del visor cartográfico.** Mapa base, superposición de capas, control de capas, acercamiento y desplazamiento, búsqueda, consulta de atributos y medición. *Resultado:* visor funcional.
4. **Administración de capas y catálogo de estudios.** Funciones para organizar las capas y registrar y consultar estudios, con sus campos descriptivos y la relación con las capas. *Resultado:* catálogo integrado al mapa.
5. **Carga y validación.** Recepción de archivos, verificación de formatos, revisión de estructura (geometrías válidas, atributos, sistema de referencia, archivos complementarios faltantes) e informe de inconsistencias. Cada archivo se identifica por su **contenido real** y no solo por su nombre. Los archivos válidos pasan a una vista previa. El navegador hace una primera revisión sin congelar la pantalla; el servidor repite la validación como segunda barrera. *Resultado:* módulo de carga con informe de cada archivo.
6. **Simbología y publicación controlada.** Herramientas de estilo para puntos, líneas y polígonos, y flujo de revisión y aprobación que decide qué capas se publican, para evitar difundir información sin revisión. *Resultado:* flujo de publicación operando.
7. **Integración y pruebas.** Pruebas funcionales, de validación de archivos con casos correctos e incorrectos, de compatibilidad en distintos navegadores, de rendimiento y de usabilidad con usuarios del CEDESU. Los hallazgos se corrigen en ciclos breves. *Resultado:* versión corregida con evidencia de pruebas.
8. **Documentación, entrega y cierre.** Documentación técnica, manual de usuario e informe final, y presentación de la primera versión al CEDESU. Se registran las propuestas de mejora y ampliación. *Resultado:* documentos y entrega.

### Herramientas y tecnologías

**Ya en uso:** Vue 3 y Vue Router (interfaz), OpenLayers 10 (mapa), Vite (construcción del sitio), SheetJS (lectura de Excel), Django (servicio de publicación), PostgreSQL (base de datos en producción), nginx (servidor web con cabeceras de seguridad), GitHub Actions (pruebas automáticas) y Git (control de versiones).

**Previstas por la arquitectura:** GeoDjango y PostGIS (datos espaciales), Martin Tile Server (teselas vectoriales para el visor), Celery y Redis (procesos en segundo plano), y GDAL/OGR, Shapely y PyProj (validación y conversión geográfica). Todas son de código abierto.

### Fuera del alcance de la primera versión

El **registro de recorridos y trayectos** y la captura de coordenadas con GPS en campo se evaluarán con el CEDESU. La captura de puntos con ubicación del dispositivo, coordenadas escritas o importación de Excel ya está construida como adelanto; su alcance definitivo queda sujeto a esa validación.

## g) Cronograma de actividades

Periodo: septiembre de 2026 a abril de 2027. Las actividades se realizan en horario vespertino de lunes a viernes, con sesiones adicionales matutinas los viernes, y se interrumpen en los periodos de vacaciones (finales de diciembre y principios de enero) y de permiso económico (finales de marzo y principios de abril). El estado corresponde al 24 de noviembre de 2026 y las reuniones con el CEDESU (actividades 1, 4 y 7) deben confirmarse con el equipo.

| N.º | Actividad | Fecha | Estado |
|---|---|---|---|
| 1 | Entrevista de temas a cubrir | 24/09/2026 | Completado |
| 2 | Investigación de bases requeridas para el software | 28/09/2026 – 02/10/2026 | Completado |
| 3 | Boceto de la interfaz gráfica | 05/10/2026 – 16/10/2026 | Completado |
| 4 | Reunión para cambios y requerimientos extras | 19/10/2026 – 23/10/2026 | Completado |
| 5 | Desarrollo de la interfaz gráfica y estilización de capas específicas | 26/10/2026 – 13/11/2026 | Completado |
| 6 | Desarrollo del backend, definición de parámetros y configuración del mapa base | 16/11/2026 – 04/12/2026 | En curso |
| 7 | Reunión para revisión, cambios o extras | 07/12/2026 – 11/12/2026 | Pendiente |
| 8 | Desarrollo del panel administrativo y de autenticación | 14/12/2026 – 25/12/2026 | Adelantado en parte |
| 9 | Pasarela de carga para archivos CSV y XLSX | 11/01/2027 – 22/01/2027 | Adelantado en el navegador |
| 10 | Captura de GPS y eventos de clic y hover sobre el mapa | 25/01/2027 – 12/02/2027 | Adelantado en parte |
| 11 | Limpieza y carga de datos de prueba | 15/02/2027 – 05/03/2027 | Pendiente |
| 12 | Pruebas de rendimiento y funcionalidad | 08/03/2027 – 19/03/2027 | Pendiente (hay una auditoría inicial) |
| 13 | Despliegue del servidor | 05/04/2027 – 09/04/2027 | Pendiente |
| 14 | Monitoreo de bugs | 12/04/2027 – 23/04/2027 | Pendiente |

**Avance en las actividades 6, 8, 9 y 10.**

- **Actividad 6:** el servicio Django ya existe con configuración por variables de entorno, salud del servicio y pruebas contra PostgreSQL. Está hecha la configuración del mapa base (fondos «Claro» y «Sin límites»); falta el modelo espacial en PostGIS.
- **Actividad 8:** ya hay acceso con usuarios y roles (administración e investigación), bloqueo por intentos, caducidad de sesión y bitácora. Falta el segundo factor de acceso.
- **Actividad 9:** la lectura y validación de CSV, Excel y otros formatos funciona en el navegador. Falta la recepción y validación definitiva en el servidor.
- **Actividad 10:** la captura de puntos con fotografía y la importación de Excel (`Name`, `X`, `Y`, `Autor`) ya funcionan y se guardan en el servidor; los eventos de clic sobre el mapa están hechos.

El cronograma es una guía y puede ajustarse según las observaciones del CEDESU, sin comprometer los tiempos de entrega. Incluye reuniones tras la fase de diseño y tras el desarrollo del backend para recoger cambios y requerimientos adicionales.

## h) Impacto social

- **Comunidad académica y de investigación.** Investigadores, docentes y estudiantes consultan información geográfica de manera centralizada, lo que facilita reutilizar datos, evita duplicar esfuerzos y fortalece la formación en herramientas geoespaciales.
- **Gestión de los recursos naturales.** Contar con información espacial organizada y revisada apoya las decisiones sobre el aprovechamiento sustentable de la vida silvestre y la conservación del territorio.
- **Difusión y transparencia.** La publicación controlada permite compartir con el público información confiable y acercar los resultados de la investigación a la sociedad y a otras instituciones.
- **Uso de tecnologías abiertas.** Las herramientas de código abierto reducen costos y dejan un modelo replicable para otras dependencias y proyectos con necesidades similares.
- **Formación profesional.** Realizar el proyecto como parte del servicio social o de las prácticas profesionales vincula a la universidad con una necesidad real de su entorno y fortalece las competencias del estudiante.
- **Confianza en los datos.** La revisión previa de cada archivo y el control de lo que se publica reducen el riesgo de difundir información incompleta o errónea.

## i) Resultados esperados

1. Una plataforma web funcional que integra un visor cartográfico con capas superpuestas sobre un mapa base.
2. Un módulo de administración para gestionar las capas y acceder a un catálogo de estudios.
3. Una pasarela de carga de archivos (CSV y XLSX, además de GeoJSON, Shapefile, KML/KMZ, GPX, GeoPackage y GeoTIFF) con validación de estructura, detección de inconsistencias y vista previa antes de publicar.
4. Herramientas de simbología para representar las capas con colores, líneas y puntos.
5. Un panel administrativo con autenticación, roles y un flujo de publicación controlada, con bitácora de cada movimiento.
6. Interacción con el mapa (clic, consulta de atributos) y captura de coordenadas, según el alcance que valide el CEDESU.
7. Informes de pruebas de rendimiento y funcionalidad, y el sistema desplegado en un servidor con monitoreo de errores.
8. Documentación técnica y manual de usuario.
9. Una propuesta de mejoras y funciones futuras para evaluar con el CEDESU.

---

# III. Información adicional que consideren relevante para respaldar el tema de investigación.

El desarrollo se plantea de forma progresiva y con revisiones periódicas con el CEDESU, de modo que el alcance se ajuste a las necesidades reales de la institución sin comprometer los tiempos de entrega. La arquitectura se diseña para ser escalable y mantenible, lo que permitirá incorporar después nuevas capacidades, como el registro de recorridos y trayectos u otros formatos de información geográfica, una vez evaluados y validados. El proyecto se realiza en el Laboratorio de Desarrollo de Aplicaciones de la Facultad de Ingeniería, que aporta el espacio de trabajo, el acompañamiento académico y la supervisión del docente responsable.

## 1. Arquitectura propuesta

Se conservan Vue 3 y OpenLayers 10, y se incorporan los servicios del servidor sin rehacer el visualizador. Los componentes pueden ejecutarse al inicio en un mismo servidor y escalar por separado cuando haga falta.

| Capa | Componente | Función |
|---|---|---|
| Navegador | Vue 3, OpenLayers 10 | Mapa, catálogo, carga con revisión previa en un proceso aparte (Web Worker) |
| Entrada | nginx con HTTPS | Sitio web, proxy inverso, caché y cabeceras de seguridad |
| API | Django (con GeoDjango y Django REST Framework previstos) | Cuentas, estudios, archivos, validación y publicación |
| Teselas | Martin Tile Server | Teselas vectoriales (MVT) por vista y escala, solo de datos publicados |
| Datos | PostgreSQL con PostGIS | Geometrías, estudios, metadatos, versiones y datos publicados |
| Procesos | Celery y Redis, GDAL/OGR | Validación y conversión de archivos en tareas separadas |
| Almacenamiento | Carpeta privada | Archivos originales y reportes, fuera del alcance del sitio web |

**Ruta de un archivo.** (1) Selección y prevalidación local; (2) recepción segura en la API, con permisos, tamaño, tipo y antivirus; (3) procesamiento geográfico con GDAL: geometrías, sistema de coordenadas, atributos y reporte; (4) revisión de la capa por la persona administradora, que ajusta la simbología y la relaciona con un estudio; (5) aprobación y publicación: solo las versiones aprobadas llegan al público. Martin no expone archivos pendientes.

**Estados de la capa.** Área privada: borrador, en revisión y correcciones. Área pública: publicado, solo con versiones autorizadas. Las versiones anteriores se archivan.

## 2. Qué se tiene hoy y qué falta

| Ya funciona | Pendiente |
|---|---|
| Mapa, capas, búsqueda, consulta y medición | Modelo espacial en PostGIS |
| Mapa base «Claro» y «Sin límites» configurable | Estilo propio de MapTiler (cuenta y clave) |
| Catálogo y fichas de estudio | Guardarlas en el servidor |
| Carga, revisión y vista previa en el navegador | Recepción, segunda revisión, antivirus y GDAL en el servidor |
| Captura de puntos con fotografía, importación de Excel y exportación | Revisión y publicación reales en el servidor |
| Acceso con usuarios y roles, bloqueo por intentos y bitácora | Segundo factor de acceso |
| Pruebas automáticas (interfaz y servicio) y pruebas con PostgreSQL | Despliegue, respaldos y monitoreo; prueba de aceptación con el CEDESU |

## 3. Rendimiento y mapa base

- **Líneas moradas.** Las líneas administrativas moradas que se ven en el mapa pertenecen al estilo del mapa base de OpenStreetMap, no a las capas del proyecto (auditoría del 24 de noviembre de 2026). Se resuelve con un fondo sin límites administrativos; las capas de límites propias se mantienen como capas opcionales y no se borra ninguna geometría de los datos de investigación.
- **Fluidez.** Con las capas de referencia actuales (1 225 entidades y 117 mil vértices) el dibujo vectorial no es el cuello de botella. Para decidir sobre WebGL, agrupación de puntos o teselas vectoriales se repetirá la medición con capas pesadas reales del CEDESU. Las metas de 60 cuadros por segundo en un equipo de referencia y de 30 en equipos modestos son objetivos, no garantías.

## 4. Formatos de archivo admitidos

| Formato | Para qué sirve |
|---|---|
| CSV y Excel | Tablas con columnas de coordenadas. Para puntos de campo: `Name`, `X`, `Y`, `Autor`, con X e Y en grados WGS 84 o en metros UTM |
| GeoJSON | Puntos, líneas y polígonos con sus datos, en un solo archivo de texto |
| Shapefile (.shp y archivos acompañantes) | Formato muy usado en SIG; exige varios archivos juntos |
| KML / KMZ | Formato de Google Earth |
| GPX | Rutas y puntos tomados con GPS |
| GeoPackage | Base de datos geográfica en un solo archivo |
| GeoTIFF | Imágenes y mapas con ubicación |

## 5. Cómo se protege la información

- **Los archivos se identifican por lo que contienen**, no por su nombre. Se revisan archivos comprimidos, macros, fórmulas en tablas y archivos con extensión engañosa, y cada archivo recibe una huella digital (SHA-256).
- **Límites de carga:** hasta 60 capas y 400 MB por lote, y 60 MB por archivo leído en el navegador.
- **Acceso con usuarios y roles** (administración e investigación). Cinco intentos fallidos bloquean la cuenta; la sesión caduca por inactividad y a las 8 horas. Las cookies son `HttpOnly`, `Secure` y `SameSite`, y se exige protección CSRF.
- **Permisos comprobados en cada petición** del servidor: solo la persona autora o administradora modifica un punto.
- **Fotografías:** deben ser realmente imágenes (PNG, JPEG o WebP) de hasta 2 MB; se vuelven a guardar sin metadatos, incluida la ubicación EXIF.
- **Bitácora de solo agregar** con accesos, fallos, cierres y cambios; nadie puede editarla ni borrarla, y nunca guarda contraseñas.
- **Protección del sitio** contra ataques web comunes mediante una política de seguridad de contenido y cabeceras en nginx.
- **La ubicación del dispositivo** solo se consulta cuando la persona lo solicita.
- **Principio de fondo:** la revisión en el navegador es una primera barrera; la definitiva la hace el servidor.

## 6. Datos de prueba utilizados

Climas de la CONABIO (escala 1:1,000,000), entidades de México y municipios de Quintana Roo (2015).

## 7. Posibles ampliaciones futuras

Se evaluarán con el CEDESU antes de incorporarse:

- Registro de recorridos y trayectos con GPS.
- Herramientas de análisis espacial.
- Conexión con servicios de mapas de otras instituciones (WMS y WFS).
- Búsquedas por filtros (por tema, fecha o zona).
- Visualización de imágenes satelitales de mayor detalle.
- Permisos más finos por tipo de persona (consulta, captura, revisión, administración).

## 8. Documentos de respaldo

Arquitectura de DeltaMap-CEDESU, contrato de la API, documento de seguridad, auditoría de rendimiento y guías técnicas del interfaz y del servicio, incluidos en el repositorio del proyecto.

## 9. Glosario

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
| UTM | Sistema de coordenadas en metros usado en cartografía |
| Simbología | Colores y estilos con que se dibuja una capa |
| Metadatos | Información sobre los datos: autor, fecha, descripción, licencia |
| Validación | Revisión automática de que un archivo está completo y es correcto |
| Huella digital (SHA-256) | Código único de un archivo; si el archivo cambia, el código cambia |
| PostGIS | Extensión de la base de datos PostgreSQL para guardar y consultar datos geográficos |
| Teselas vectoriales (MVT) | Pedazos del mapa enviados como datos, que se dibujan en el navegador y permiten mapas rápidos con muchas entidades |
| API / servidor | Programa instalado en un equipo del Centro que recibe, guarda y publica los archivos |
