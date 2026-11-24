# Auditoría de la fase A: líneas moradas y rendimiento

Fecha: 24 de noviembre de 2026. Servidor de desarrollo local (Vite) en el navegador integrado de la aplicación de escritorio. Los números sirven como línea base para comparar después; no son los de un equipo de referencia.

## 1. Origen de las líneas moradas

**Prueba:** con las tres capas del proyecto apagadas («0/3» en el panel Capas) y solo el mapa base «Calles», se acercó a la frontera entre Campeche, Quintana Roo, Yucatán y Belice (zoom 8).

**Resultado:** las líneas punteadas de color morado grisáceo siguen visibles. **Forman parte del estilo del mapa base de OpenStreetMap**, no de una capa del proyecto.

**Consecuencia:** hay que cambiar el fondo, no los estilos de las capas. Ya está hecho en la fase 1 (commit `d113d25`):

- «Claro» (CARTO): sin clave. Sus límites son más discretos, pero no desaparecen.
- «Sin límites» (MapTiler): aparece al compilar con `VITE_MAPTILER_KEY` y `VITE_MAP_STYLE_ID`.

Las capas de límites del proyecto (municipios y entidades) siguen como capas opcionales y no se tocan.

## 2. Datos de las capas de referencia

| Capa | Entidades | Vértices | Archivo |
|---|---:|---:|---:|
| Climas de México (Köppen-García) | 1 182 | 72 235 | 2.0 MB |
| Entidades federativas | 32 | 31 428 | 0.7 MB |
| Municipios de Quintana Roo (2015) | 11 | 13 423 | 0.3 MB |
| **Total** | **1 225** | **117 086** | **3.0 MB** |

Memoria de JavaScript con las tres capas cargadas: unos 29 MB.

## 3. Fluidez al acercar y alejar

Se animó el zoom durante 3 segundos y se contaron los cuadros dibujados (`postrender`).

| Prueba | FPS | Cuadro más lento |
|---|---:|---:|
| Alejar 10→6, las 3 capas | 20.3 | 932 ms |
| Acercar 6→10, las 3 capas | 25.5 | 311 ms |
| Alejar 7→5, las 3 capas | 29.1 | 44 ms |
| Alejar 10→6, solo Climas | 24.2 | 492 ms |
| Alejar 10→6, Entidades y Municipios | 26.4 | 277 ms |
| Alejar 10→6, **ninguna capa** | 25.2 | 423 ms |

Tareas largas del navegador durante las pruebas: 0.

## 4. Lectura de los resultados

- Con ninguna capa activa los FPS son casi los mismos (25.2) que con las tres (20 a 29). **En este volumen de datos el cuello de botella no es el dibujo vectorial**: son la descarga y el dibujo de las teselas del fondo y el renderizado por software del entorno de prueba.
- El pico de 932 ms ocurrió en el primer alejamiento, cuando el navegador pide teselas nuevas y simplifica geometrías por primera vez.
- Los 117 mil vértices son poco para OpenLayers. El problema descrito en el documento (alejar a unos 20 km o más con varias capas) probablemente aparece con capas mucho más pesadas que estas.

## 5. Límites de esta medición

- El entorno dibuja sin aceleración de GPU, por lo que los FPS absolutos son más bajos que en un equipo real. Sirven para comparar cambios entre sí, no como meta de 60 o 30 FPS.
- Las tres capas de prueba son ligeras. Para decidir sobre WebGL, agrupación de puntos o teselas MVT hace falta repetir la prueba con capas reales de CEDESU (cientos de miles de entidades).
- No se midió la memoria al alternar capas muchas veces.

## 6. Qué sigue

1. Conseguir de CEDESU una o dos capas pesadas representativas (el volumen real que causa la lentitud).
2. Repetir esta medición con ellas, y también con WebGL y con agrupación de puntos activados (fase B).
3. Decidir MVT y Martin solo si, con esos datos, el dibujo en el navegador sigue siendo el cuello de botella.
