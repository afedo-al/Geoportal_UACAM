<script setup>
/* Menú contextual único (acciones de capa, secciones en el celular y sesión):
   se coloca junto a su botón, se maneja con el teclado y se cierra al hacer clic fuera. */
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import { ui, closeMenu } from '../stores/ui.js';

const pop = ref(null);
let lastAnchor = null;

function position() {
  const a = ui.menu.anchor, el = pop.value;
  if (!a || !el) return;
  const r = a.getBoundingClientRect();
  el.style.left = '0px'; el.style.top = '0px';
  const pr = el.getBoundingClientRect();
  let x = ui.menu.align === 'right' ? r.right - pr.width : r.left;
  let y = r.bottom + 4;
  let origin = ui.menu.align === 'right' ? 'top right' : 'top left';
  if (y + pr.height > innerHeight - 8) { y = r.top - pr.height - 4; origin = origin.replace('top', 'bottom'); }
  x = Math.max(8, Math.min(x, innerWidth - pr.width - 8));
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  el.style.setProperty('--origin', origin);
}

watch(() => [ui.menu.open, ui.menu.anchor], async ([open, anchor]) => {
  if (lastAnchor && lastAnchor !== anchor) lastAnchor.setAttribute('aria-expanded', 'false');
  if (open) {
    lastAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    await nextTick();
    position();
    pop.value.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  } else if (lastAnchor) {
    lastAnchor.setAttribute('aria-expanded', 'false');
    if (ui.menu.returnFocus && pop.value?.contains(document.activeElement)) lastAnchor.focus({ preventScroll: true });
    lastAnchor = null;
  }
});

function select(it) {
  if (it.disabled) return;
  const fn = ui.menu.onSelect;
  closeMenu();
  fn?.(it.act);
}

function onKey(e) {
  if (!ui.menu.open) return;
  const items = [...pop.value.querySelectorAll('[role="menuitem"]:not(:disabled)')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
  else if (e.key === 'End') { e.preventDefault(); items.at(-1)?.focus(); }
  else if (e.key === 'Tab') closeMenu(false);
}
function onDown(e) {
  if (ui.menu.open && !pop.value.contains(e.target) && !ui.menu.anchor?.contains(e.target)) closeMenu(false);
}
const onResize = () => closeMenu(false);
onMounted(() => { document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey); addEventListener('resize', onResize); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); removeEventListener('resize', onResize); });
</script>

<template>
  <div ref="pop" class="popover" :class="{ 'is-open': ui.menu.open }" role="menu" :aria-label="ui.menu.header ? 'Sesión' : 'Acciones'">
    <template v-if="ui.menu.header">
      <div class="menu-head">
        <div class="menu-head-title">{{ ui.menu.header.title }}</div>
        <div class="menu-head-sub">{{ ui.menu.header.sub }}</div>
      </div>
      <div class="menu-sep" role="separator"></div>
    </template>
    <template v-for="(it, i) in ui.menu.items" :key="i">
      <div v-if="it === '-'" class="menu-sep" role="separator"></div>
      <button v-else type="button" class="menu-item" role="menuitem" :disabled="it.disabled" @click="select(it)">
        <Icon :name="it.icon" /><span>{{ it.label }}</span>
      </button>
    </template>
  </div>
</template>
