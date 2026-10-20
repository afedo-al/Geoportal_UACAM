<script setup>
/* Tooltips para los elementos con data-tip: retraso inicial y, mientras se
   recorre una barra de botones, los siguientes aparecen al instante. */
import { ref, onMounted, onBeforeUnmount } from 'vue';

const el = ref(null);
let showT = 0, hideT = 0, coolT = 0, warm = false, current = null;

function place(target) {
  const tip = el.value;
  const r = target.getBoundingClientRect();
  tip.style.left = '0px'; tip.style.top = '0px';
  const tr = tip.getBoundingClientRect();
  let x, y;
  if (target.closest('.map-tools')) { x = r.right + 8; y = r.top + r.height / 2 - tr.height / 2; tip.style.transformOrigin = 'left center'; }
  else if (target.closest('.map-nav, .dock-right')) { x = r.left - tr.width - 8; y = r.top + r.height / 2 - tr.height / 2; tip.style.transformOrigin = 'right center'; }
  else { x = r.left + r.width / 2 - tr.width / 2; y = r.bottom + 8; tip.style.transformOrigin = 'top center'; }
  x = Math.max(8, Math.min(x, innerWidth - tr.width - 8));
  y = Math.max(8, Math.min(y, innerHeight - tr.height - 8));
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}
function show(target) {
  clearTimeout(hideT); clearTimeout(coolT);
  const text = target.dataset.tip;
  if (!text) return;
  const go = () => {
    current = target;
    el.value.textContent = text;
    el.value.classList.toggle('instant', warm);
    place(target);
    el.value.classList.add('is-on');
    warm = true;
  };
  if (warm) go(); else showT = setTimeout(go, 450);
}
function hide() {
  clearTimeout(showT);
  el.value?.classList.remove('is-on');
  current = null;
  coolT = setTimeout(() => { warm = false; }, 350);
}
function onOver(e) {
  if (e.pointerType !== 'mouse') return;
  const t = e.target.closest?.('[data-tip]');
  if (t && t !== current) show(t);
  else if (!t && current) hide();
}
function onFocus(e) { const t = e.target.closest?.('[data-tip]'); if (t && t.matches(':focus-visible')) show(t); }

const listeners = [['pointerover', onOver], ['focusin', onFocus], ['focusout', hide], ['pointerdown', hide], ['scroll', hide, true]];
onMounted(() => listeners.forEach(([ev, fn, cap]) => document.addEventListener(ev, fn, cap)));
onBeforeUnmount(() => listeners.forEach(([ev, fn, cap]) => document.removeEventListener(ev, fn, cap)));
</script>

<template>
  <!-- Solo visual: repite el aria-label del control, que ya lo anuncia el lector de pantalla -->
  <div ref="el" class="tip" aria-hidden="true"></div>
</template>
