/* Comportamientos de interfaz compartidos por varios componentes */
import { watch, onMounted, nextTick } from 'vue';

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
  ink.style.width = `${width - 16}px`;
  ink.style.transform = `translateX(${left + 8}px)`;
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

/* Hojas inferiores en el celular: arrastrar la cabecera hacia abajo las cierra.
   Basta con pasar el umbral o con un gesto rápido; hacia arriba hay fricción. */
export function sheetSwipe(getDock, isMobile, close) {
  let y0 = 0, t0 = 0, dy = 0, dragging = false;
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const dock = getDock();
    const velocity = Math.abs(dy) / Math.max(1, performance.now() - t0);
    dock.style.transition = '';
    dock.style.transform = '';
    if (dy > 0 && (dy > 90 || velocity > 0.11)) close();
  };
  return {
    pointerdown(e) {
      if (!isMobile() || dragging || e.button !== 0 || e.target.closest('button')) return;
      dragging = true; y0 = e.clientY; t0 = performance.now(); dy = 0;
      e.currentTarget.setPointerCapture(e.pointerId);
      getDock().style.transition = 'none';
    },
    pointermove(e) {
      if (!dragging) return;
      dy = e.clientY - y0;
      getDock().style.transform = `translateY(${dy < 0 ? -Math.sqrt(-dy) * 2 : dy}px)`;
    },
    pointerup: end,
    pointercancel: end
  };
}
