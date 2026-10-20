<script setup>
/* Marco cartográfico con etiquetas de la gratícula en el borde, como en un mapa impreso */
import { ref, watch, onBeforeUnmount } from 'vue';
import { getMap, mapState, pixelToLonLat, lonLatToPixel } from '../stores/map.js';
import { fmtDM } from '../lib/geo.js';

const frame = ref(null);
const ticks = ref([]);
let raf = 0;
/* Geometría del marco: se mide solo al cambiar de tamaño, no en cada fotograma del mapa
   (medir en postrender forzaba un recálculo de estilos durante cada desplazamiento). */
let box = null, lastView = '';

function measure() {
  const map = getMap();
  if (!map || !frame.value) { box = null; return; }
  const fr = frame.value.getBoundingClientRect(), mr = map.getTargetElement().getBoundingClientRect();
  box = fr.width ? { ox: fr.left - mr.left, oy: fr.top - mr.top, width: fr.width, height: fr.height } : null;
  lastView = '';
}

function update() {
  raf = 0;
  const map = getMap();
  if (!map || !mapState.active || !box) return;
  const v = map.getView(), c = v.getCenter();
  const key = `${c?.[0]},${c?.[1]},${v.getResolution()},${box.width},${box.height}`;
  if (key === lastView) return;
  lastView = key;
  const fr = box, ox = box.ox, oy = box.oy;
  const nw = pixelToLonLat(ox, oy), se = pixelToLonLat(ox + fr.width, oy + fr.height);
  if (!nw || !se) return;
  const span = Math.max(se.lon - nw.lon, 1e-6);
  const steps = [1 / 60, 2 / 60, 5 / 60, 10 / 60, 15 / 60, 0.5, 1, 2, 5];
  const step = steps.find(s => span / s <= 6) || 5;
  const out = [];
  for (let x = Math.ceil(nw.lon / step) * step; x < se.lon; x += step) {
    const px = lonLatToPixel(x, nw.lat)[0] - ox;
    if (px > 90 && px < fr.width - 40) out.push({ k: `x${x}`, cls: 'top', style: { left: `${px.toFixed(1)}px` }, text: fmtDM(x, 'E', 'O') });
  }
  for (let y = Math.ceil(se.lat / step) * step; y < nw.lat; y += step) {
    const py = lonLatToPixel(se.lon, y)[1] - oy;
    if (py > 40 && py < fr.height - 40) out.push({ k: `y${y}`, cls: 'right', style: { top: `${py.toFixed(1)}px` }, text: fmtDM(y, 'N', 'S') });
  }
  ticks.value = out;
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

/* El ResizeObserver avisa con el diseño ya calculado: medir ahí no fuerza otro cálculo.
   Cubre también el cambio de ventana, los paneles y el regreso a la vista (de 0 px a su tamaño). */
const ro = new ResizeObserver(() => { measure(); schedule(); });

watch(() => mapState.ready, ready => { if (ready) getMap().on('postrender', schedule); }, { immediate: true });
watch(() => mapState.active, active => { if (active) schedule(); });
watch(frame, el => { ro.disconnect(); if (el) ro.observe(el); });
onBeforeUnmount(() => { ro.disconnect(); getMap()?.un('postrender', schedule); });
defineExpose({ schedule });
</script>

<template>
  <div class="neatline" aria-hidden="true">
    <div ref="frame" class="frame">
      <span v-for="t in ticks" :key="t.k" class="tick" :class="t.cls" :style="t.style">{{ t.text }}</span>
    </div>
  </div>
</template>
