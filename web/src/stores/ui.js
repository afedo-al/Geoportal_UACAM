/* Estado de la interfaz: avisos, tareas, paneles, menús y diálogos */
import { reactive, markRaw } from 'vue';
import { store } from '../lib/format.js';

const mq = window.matchMedia('(max-width: 680px)');

export const ui = reactive({
  mobile: mq.matches,
  docks: { left: true, right: true },
  sheet: { left: 'half', right: 'half' },   // altura de las hojas inferiores en el celular
  toasts: [],
  tasks: [],
  confirm: null, // { title, text, ok, resolve }
  menu: { open: false, anchor: null, items: [], align: 'left', header: null, onSelect: null, returnFocus: true },
  loginOpen: false,
  metaId: null
});

export const isMobile = () => mq.matches;

/* ---------------- avisos (toasts) ---------------- */
let toastSeq = 0;
export function showToast(type, title, message = '') {
  ui.toasts.push({ id: ++toastSeq, type, title, message, leaving: false });
  while (ui.toasts.length > 4) ui.toasts.shift();
}
export function closeToast(id) {
  const t = ui.toasts.find(x => x.id === id);
  if (!t || t.leaving) return;
  t.leaving = true;
  setTimeout(() => { const i = ui.toasts.findIndex(x => x.id === id); if (i >= 0) ui.toasts.splice(i, 1); }, 400);
}

/* ---------------- tareas en curso ---------------- */
let taskSeq = 0;
export function startTask(label) {
  const id = ++taskSeq;
  ui.tasks.push({ id, label });
  return () => { const i = ui.tasks.findIndex(t => t.id === id); if (i >= 0) ui.tasks.splice(i, 1); };
}

/* ---------------- confirmación ---------------- */
export function confirmAction({ title, text, ok = 'Confirmar', danger = false }) {
  return new Promise(resolve => { ui.confirm = { title, text, ok, danger, resolve }; });
}

/* ---------------- menús contextuales ---------------- */
export function openMenu(anchor, items, { align = 'left', header = null, onSelect = null } = {}) {
  Object.assign(ui.menu, { open: true, anchor: markRaw(anchor), items, align, header, onSelect, returnFocus: true });
}
export function closeMenu(returnFocus = true) {
  if (!ui.menu.open) return;
  ui.menu.returnFocus = returnFocus;
  ui.menu.open = false;
}

/* ---------------- paneles acoplados ---------------- */
export function dockOpen(side) { return ui.docks[side]; }

export function setDock(side, open, { persist = true } = {}) {
  if (open && ui.mobile) {
    ui.docks[side === 'left' ? 'right' : 'left'] = false;
    if (!ui.docks[side]) ui.sheet[side] = 'half';
  }
  ui.docks[side] = open;
  if (persist && !ui.mobile) store.set(`dock-${side}`, open);
}

export function initDocks() {
  if (ui.mobile) { setDock('left', false, { persist: false }); setDock('right', false, { persist: false }); return; }
  setDock('left', store.get('dock-left', true), { persist: false });
  setDock('right', store.get('dock-right', innerWidth > 1024), { persist: false });
}

mq.addEventListener('change', e => {
  ui.mobile = e.matches;
  if (e.matches) { setDock('left', false, { persist: false }); setDock('right', false, { persist: false }); }
  else initDocks();
});
