<script setup>
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';

const router = useRouter();

const logoUacam = `${import.meta.env.BASE_URL}img/uacam.webp`;
const logoCedesu = `${import.meta.env.BASE_URL}img/cedesu.webp`;

const herramientas = [
  {
    icono: 'map',
    titulo: 'Mapa interactivo',
    descripcion: 'Explora información geográfica y consulta capas cartográficas.'
  },
  {
    icono: 'book-open',
    titulo: 'Catálogo de estudios',
    descripcion: 'Consulta estudios, documentos y metadatos disponibles.'
  },
  {
    icono: 'map-pin',
    titulo: 'Captura de coordenadas',
    descripcion: 'Registra puntos de campo mediante GPS o captura manual.'
  },
  {
    icono: 'shield-check',
    titulo: 'Gestión de información',
    descripcion: 'Revisa y administra los datos geográficos antes de publicarlos.'
  }
];

// Agrega aquí los nombres cuando estén autorizados.
const colaboradores = [
  // { nombre: 'Nombre del integrante', cargo: 'Desarrollador' },
];

function entrarAlMapa() {
  try {
    localStorage.setItem('cedesuWelcomeVisitedV3', '1');
  } catch {
    // La navegación funciona aunque el almacenamiento esté deshabilitado.
  }
  router.push('/');
}
</script>

<template>
  <section class="inicio-cedesu">
    <div class="inicio-contenido">

      <!-- BIENVENIDA -->
      <header class="inicio-hero">
        <div class="inicio-presentacion">
          <span class="inicio-etiqueta">
            GEO PORTAL · CEDESU · UACAM
          </span>

          <h1>Bienvenido al Geoportal CEDESU</h1>

          <p class="inicio-subtitulo">
            Información geográfica para conocer,
            estudiar y comprender nuestro territorio.
          </p>

          <p>
            Plataforma de consulta y gestión de información
            geoespacial desarrollada en colaboración
            con la Universidad Autónoma de Campeche.
          </p>

          <div class="inicio-botones">
            <button
              class="btn btn-primary"
              type="button"
              @click="entrarAlMapa"
            >
              <Icon name="map" />
              Explorar el mapa
            </button>

            <button
              class="btn btn-secondary"
              type="button"
              @click="router.push('/catalogo')"
            >
              <Icon name="book-open" />
              Ver estudios
            </button>
          </div>
        </div>

        <div class="inicio-logos">
          <img :src="logoUacam" alt="Universidad Autónoma de Campeche" />
          <span>+</span>
          <img :src="logoCedesu" alt="CEDESU" />
          <p>Investigación, tecnología y territorio</p>
        </div>
      </header>

      <!-- FINALIDAD -->
      <section class="inicio-seccion">
        <span class="inicio-numero">01 · EL PROYECTO</span>
        <h2>¿Cuál es la finalidad de la plataforma?</h2>

        <p>
          El Geoportal CEDESU tiene como finalidad centralizar,
          organizar, visualizar y gestionar la información
          geográfica relacionada con los estudios y proyectos
          de investigación del Centro de Estudios de Desarrollo
          Sustentable.
        </p>

        <p>
          Mediante herramientas cartográficas interactivas,
          busca facilitar la consulta de datos territoriales,
          la localización de estudios, la captura de coordenadas
          y la administración de información geoespacial.
        </p>
      </section>

      <!-- HERRAMIENTAS -->
      <section class="inicio-seccion">
        <span class="inicio-numero">02 · FUNCIONALIDADES</span>
        <h2>Explora las herramientas disponibles</h2>

        <div class="inicio-grid">
          <article
            v-for="herramienta in herramientas"
            :key="herramienta.titulo"
            class="inicio-tarjeta"
          >
            <div class="inicio-icono">
              <Icon :name="herramienta.icono" />
            </div>

            <h3>{{ herramienta.titulo }}</h3>
            <p>{{ herramienta.descripcion }}</p>
          </article>
        </div>

        <p class="inicio-aviso">
          La plataforma se encuentra en desarrollo.
          Algunas funcionalidades requieren la implementación
          del servidor institucional.
        </p>
      </section>

      <!-- COLABORADORES -->
      <section class="inicio-seccion">
        <span class="inicio-numero">03 · EQUIPO DE TRABAJO</span>
        <h2>Instituciones colaboradoras</h2>

        <div class="inicio-grid equipo">
          <article class="inicio-tarjeta institucion">
            <img :src="logoUacam" alt="" />
            <div>
              <h3>Facultad de Ingeniería</h3>
              <p>Universidad Autónoma de Campeche</p>
              <p>Desarrollo tecnológico del geoportal.</p>
            </div>
          </article>

          <article class="inicio-tarjeta institucion">
            <img :src="logoCedesu" alt="" />
            <div>
              <h3>CEDESU</h3>
              <p>Universidad Autónoma de Campeche</p>
              <p>Requerimientos y conocimiento territorial.</p>
            </div>
          </article>
        </div>

        <div v-if="colaboradores.length" class="integrantes">
          <h3>Integrantes del proyecto</h3>

          <div class="inicio-grid equipo">
            <article
              v-for="persona in colaboradores"
              :key="persona.nombre"
              class="inicio-tarjeta"
            >
              <strong>{{ persona.nombre }}</strong>
              <p>{{ persona.cargo }}</p>
            </article>
          </div>
        </div>
      </section>

      <footer class="inicio-footer">
        <p>Comienza a explorar la información del territorio.</p>
        <button
          class="btn btn-primary"
          type="button"
          @click="entrarAlMapa"
        >
          Ir al visualizador
          <Icon name="chevron-right" />
        </button>
      </footer>

    </div>
  </section>
</template>

<style scoped>
.inicio-cedesu {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  background: #f5f8f9;
  color: #20333e;
}

.inicio-contenido {
  max-width: 1180px;
  margin: auto;
  padding: 36px 24px 70px;
}

.inicio-hero {
  display: grid;
  grid-template-columns: 1.6fr 0.8fr;
  align-items: center;
  gap: 40px;
  padding: 56px;
  border-radius: 20px;
  background: linear-gradient(125deg, #123345, #17616a);
  color: white;
}

.inicio-etiqueta {
  color: #d9c68c;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 2px;
}

.inicio-hero h1 {
  font-size: clamp(32px, 4vw, 52px);
  line-height: 1.12;
  margin: 20px 0;
}

.inicio-presentacion p {
  color: #dce8eb;
  line-height: 1.75;
}

.inicio-presentacion .inicio-subtitulo {
  color: white;
  font-size: 20px;
  font-weight: 600;
}

.inicio-botones {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 30px;
}

.inicio-logos {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 17px;
  padding: 25px;
  border: 1px solid #ffffff45;
  border-radius: 16px;
  background: #ffffff15;
  text-align: center;
}

.inicio-logos img {
  width: 100px;
  height: 100px;
  object-fit: contain;
  padding: 14px;
  background: white;
  border-radius: 16px;
}

.inicio-logos span {
  font-size: 24px;
  color: #d9c68c;
}

.inicio-logos p {
  color: white;
  font-size: 13px;
}

.inicio-seccion {
  padding: 48px 0 0;
}

.inicio-numero {
  color: #967431;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
}

.inicio-seccion h2 {
  font-size: clamp(24px, 2.8vw, 32px);
  margin: 10px 0 20px;
}

.inicio-seccion > p {
  max-width: 900px;
  line-height: 1.8;
  color: #526571;
}

.inicio-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-top: 24px;
}

.inicio-tarjeta {
  background: white;
  padding: 24px;
  border: 1px solid #dce5e9;
  border-radius: 14px;
}

.inicio-icono {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  background: #e4f2ef;
  color: #17616a;
  border-radius: 12px;
}

.inicio-tarjeta h3 {
  font-size: 16px;
  margin: 18px 0 8px;
}

.inicio-tarjeta p {
  color: #617480;
  line-height: 1.6;
  font-size: 14px;
}

.inicio-seccion .inicio-aviso {
  margin-top: 20px;
  font-size: 13px;
}

.equipo {
  grid-template-columns: repeat(2, 1fr);
}

.institucion {
  display: flex;
  align-items: center;
  gap: 20px;
}

.institucion img {
  width: 72px;
  height: 72px;
  object-fit: contain;
  flex-shrink: 0;
}

.institucion h3 {
  margin-top: 0;
}

.integrantes {
  margin-top: 30px;
}

.inicio-footer {
  border-top: 1px solid #dce5e9;
  margin-top: 50px;
  padding-top: 26px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.inicio-footer p {
  font-weight: 600;
}

@media (max-width: 900px) {
  .inicio-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 650px) {
  .inicio-contenido {
    padding: 16px 14px 50px;
  }

  .inicio-hero {
    grid-template-columns: 1fr;
    padding: 30px 24px;
  }

  .inicio-grid,
  .equipo {
    grid-template-columns: 1fr;
  }

  .inicio-footer button {
    width: 100%;
  }
}
</style>
