/* Comportamientos de interfaz compartidos por varios componentes */
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { ui, setDock } from '../stores/ui.js';

/* Diálogo nativo <dialog>: se abre y cierra según isOpen(); Esc, el botón
   [data-close] y un clic en el fondo lo cierran. onClosed recibe returnValue. */
export function useDialog(dlgRef, isOpen, onClosed) {
  const sync = open => {
    const d = dlgRef.value;
    if (!d) return;
    if (open && !d.open) { d.returnValue = ''; d.showModal(); }
    else if (!open && d.open) d.close();
  };
  watch(isOpen, open => nextTick(() => sync(open)));
  onMounted(() => {
    const d = dlgRef.value;
    d.addEventListener('close', () => onClosed(d.returnValue));
    d.addEventListener('click', e => {
      if (e.target === d || e.target.closest('[data-close]')) d.close('cancel');
    });
    sync(isOpen());
  });
}

/* Subrayado animado de la pestaña activa; si las pestañas no caben, desplaza la barra */
export function moveInk(tabsEl) {
  if (!tabsEl) return;
  const sel = tabsEl.querySelector('[aria-selected="true"]');
  const ink = tabsEl.querySelector('.tab-ink');
  if (!sel || !ink) return;
  /* Primero todas las lecturas y después las escrituras: un solo cálculo de diseño */
  const { offsetLeft: left, offsetWidth: width } = sel;
  const { scrollLeft, clientWidth } = tabsEl;
  /* Solo transform (mueve y escala una línea de 100 px): no se recalcula el diseño en cada cuadro */
  ink.style.transform = `translateX(${left + 8}px) scaleX(${Math.max(0, width - 16) / 100})`;
  if (left + width > scrollLeft + clientWidth) tabsEl.scrollLeft = left + width - clientWidth + 8;
  else if (left < scrollLeft) tabsEl.scrollLeft = Math.max(0, left - 8);
}

/* Teclado en una lista de pestañas: flechas izquierda y derecha */
export function tabKeys(e, ids, current, activate) {
  const i = ids.indexOf(current);
  let n = null;
  if (e.key === 'ArrowRight') n = ids[(i + 1) % ids.length];
  if (e.key === 'ArrowLeft') n = ids[(i - 1 + ids.length) % ids.length];
  if (n) {
    e.preventDefault();
    activate(n);
    nextTick(() => e.currentTarget?.querySelector(`[data-tab="${n}"]`)?.focus());
  }
}

/* ---------------- Hojas inferiores del celular ----------------
   Tres alturas (asomada, media, completa) y cerrada. La cabecera sigue al dedo 1:1 respetando el punto
   donde se tomó; al soltar, la velocidad del gesto se proyecta (deceleración tipo desplazamiento de iOS)
   para elegir la altura, y un muelle continúa desde la posición y velocidad actuales, así que se puede
   volver a tomar a mitad del movimiento. Más allá de la altura completa hay resistencia (rubber band).
   Con «reducir movimiento» la hoja se coloca sin animación. */
const SNAPS = ['peek', 'half', 'full'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);           // px que recorrería con esa velocidad (px/s)
const rubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

export function useSheet(side, getDock) {
  let y = null;            // desplazamiento actual (px hacia abajo desde la altura completa)
  let v = 0;               // velocidad actual (px/s)
  let raf = 0, last = 0, target = 0, k = 0, c = 0;
  let drag = null;          // { id, grabY, y0, hist: [[t, y]], moved }
  /* Mientras se mueve (o se arrastra) la hoja no queda inerte aunque se esté cerrando: se puede volver a tomar */
  const moving = ref(false);
  const dock = () => getDock();
  const H = () => dock()?.offsetHeight || 0;
  /* Posición de cada altura: la asomada deja ver cabecera y filtro (o pestañas); la media, la mitad del mapa */
  const posOf = name => {
    const h = H();
    if (name === 'full') return 0;
    if (name === 'half') return Math.round(h * 0.48);
    if (name === 'peek') return Math.max(0, h - 132);
    return h + 24;          // cerrada
  };
  const write = () => {
    const el = dock();
    if (!el) return;
    const shown = y < 0 ? -rubber(-y, H()) : y;
    el.style.transform = `translate3d(0, ${shown}px, 0)`;
  };
  const settle = () => {
    const el = dock();
    if (!el) return;
    const open = ui.docks[side];
    el.style.visibility = open ? '' : 'hidden';
    /* Contenido alcanzable: el área desplazable se acorta lo que queda fuera de la pantalla (una vez, al asentarse) */
    el.style.setProperty('--sheet-pad', `${open ? Math.max(0, Math.round(y)) : 0}px`);
    el.dataset.snap = open ? ui.sheet[side] : 'closed';
    moving.value = false;
  };
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  function step(t) {
    const dt = Math.min(0.032, (t - last) / 1000 || 0.016);
    last = t;
    const a = -k * (y - target) - c * v;
    v += a * dt; y += v * dt;
    write();
    if (Math.abs(y - target) < 0.5 && Math.abs(v) < 20) { y = target; v = 0; write(); raf = 0; settle(); return; }
    raf = requestAnimationFrame(step);
  }
  /* response en segundos; damping 1 = sin rebote. Apple usa 0.8 / 0.3 para hojas cuando el gesto trae impulso */
  function animateTo(to, { velocity = v, damping = 1, response = 0.34 } = {}) {
    const el = dock();
    if (!el) return;
    if (y === null) y = posOf('closed');
    target = to;
    el.style.visibility = 'visible';
    delete el.dataset.snap;
    moving.value = true;
    if (reduceMotion.matches) { stop(); y = to; v = 0; write(); settle(); return; }
    k = (2 * Math.PI / response) ** 2; c = (4 * Math.PI * damping) / response; v = velocity;
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
  }
  function sync({ instant = false } = {}) {
    const el = dock();
    if (!el) return;
    if (!ui.mobile) {
      stop(); y = null; v = 0;
      el.style.transform = ''; el.style.visibility = ''; el.style.removeProperty('--sheet-pad'); delete el.dataset.snap;
      return;
    }
    const to = ui.docks[side] ? posOf(ui.sheet[side]) : posOf('closed');
    if (instant || y === null) { stop(); y = to; v = 0; write(); settle(); return; }
    animateTo(to);
  }
  function onResize() { if (ui.mobile && !drag) sync({ instant: !raf }); }
  watch(() => [ui.docks[side], ui.sheet[side], ui.mobile], () => nextTick(() => sync()));
  onMounted(() => { sync({ instant: true }); addEventListener('resize', onResize); });
  onBeforeUnmount(() => { stop(); removeEventListener('resize', onResize); });

  function toggleSize() { ui.sheet[side] = ui.sheet[side] === 'full' ? 'half' : 'full'; }
  function release(e, cancelled = false) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.moved) { if (cancelled) sync(); else toggleSize(); return; }   // un toque en la cabecera alterna media / completa
    const [t0, y0] = d.hist[0], [t1, y1] = d.hist[d.hist.length - 1];
    const vel = t1 > t0 ? ((y1 - y0) / (t1 - t0)) * 1000 : 0;            // px/s
    const landing = y + project(vel);
    const candidates = [...SNAPS.map(n => [n, posOf(n)]), ['closed', posOf('closed')]];
    let [name] = candidates.reduce((best, cur) => (Math.abs(cur[1] - landing) < Math.abs(best[1] - landing) ? cur : best));
    if (vel < -300 && name === 'closed') name = 'peek';                   // hacia arriba nunca cierra
    const flick = Math.abs(vel) > 400;
    if (name === 'closed') {
      setDock(side, false);
      animateTo(posOf('closed'), { velocity: vel });
    } else {
      if (!ui.docks[side]) setDock(side, true);   // se tomó mientras se cerraba y se volvió a subir
      ui.sheet[side] = name;
      animateTo(posOf(name), { velocity: vel, damping: flick ? 0.86 : 1 });
    }
  }
  const handlers = {
    pointerdown(e) {
      if (!ui.mobile || drag || e.button !== 0 || e.target.closest('button, input, a')) return;
      stop();                                  // interrumpir: se toma desde donde está
      moving.value = true;
      drag = { id: e.pointerId, grabY: e.clientY, y0: y ?? posOf(ui.sheet[side]), hist: [[performance.now(), y ?? 0]], moved: false };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
    },
    pointermove(e) {
      if (!drag || e.pointerId !== drag.id) return;     // un segundo dedo se ignora
      const dy = e.clientY - drag.grabY;
      if (!drag.moved && Math.abs(dy) < 4) return;       // histéresis antes de comprometerse con el arrastre
      if (!drag.moved) { drag.moved = true; drag.hist = [[performance.now(), drag.y0]]; dock().style.visibility = 'visible'; }
      y = drag.y0 + dy;
      const now = performance.now();
      drag.hist.push([now, y]);
      while (drag.hist.length > 2 && now - drag.hist[0][0] > 100) drag.hist.shift();
      write();
    },
    pointerup(e) { release(e); },
    pointercancel(e) { release(e, true); }
  };
  return { handlers, toggleSize, moving, expanded: computed(() => ui.sheet[side] === 'full') };
}
