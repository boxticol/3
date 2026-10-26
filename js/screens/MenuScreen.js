// Lista estilo iPod: fila resaltada en azul, chevrons, barra de desplazamiento y texto que corre.
import { el, artwork, friendlyError } from '../ui.js';
import * as player from '../player.js';

const SPINNER = '<span class="spinner" aria-hidden="true"></span>';

export class MenuScreen {
  /**
   * items: [{ label, detail?, chevron?, static?, onSelect?(screen, item) }]
   * load:  async () => items   (se ejecuta al entrar, con "Cargando…")
   * split: muestra portada a la derecha (menú principal)
   */
  constructor({ title, items = [], load = null, split = false, emptyText = 'Vacío', art = null }) {
    this.title = title;
    this.items = typeof items === 'function' ? items() : items;
    this.itemsFn = typeof items === 'function' ? items : null;
    this.load = load;
    this.split = split;
    this.emptyText = emptyText;
    this.artFn = art;
    this.loaded = !load;
    this.sel = 0;
  }

  mount() {
    this.node = el('div', `menu-panel${this.split ? ' is-split' : ''}`);
    this.listWrap = el('div', 'menu-list');
    this.list = el('ul', 'menu');
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', this.title);
    this.track = el('div', 'scrollbar');
    this.thumb = el('div', 'scrollbar-thumb');
    this.track.append(this.thumb);
    this.listWrap.append(this.list, this.track);
    this.node.append(this.listWrap);
    if (this.split) {
      this.artBox = el('div', 'split-art');
      this.node.append(this.artBox);
    }
    this.render();
    return this.node;
  }

  async enter() {
    if (this.itemsFn) this.refresh();
    if (this.split) {
      this.unsub = player.subscribe(() => this.updateArt());
    }
    if (this.loaded || this.loading || !this.load) return;

    this.loading = true;
    this.items = [{ label: 'Cargando…', static: true, spinner: true }];
    this.render();
    try {
      const items = await this.load();
      this.items = items.length ? items : [{ label: this.emptyText, static: true }];
      this.loaded = true;
    } catch (e) {
      this.items = [{ label: friendlyError(e), static: true }];
      this.loaded = false; // reintenta al volver a entrar
    } finally {
      this.loading = false;
      this.sel = Math.max(0, this.items.findIndex((i) => !i.static));
      this.render();
    }
  }

  leave() {
    this.unsub?.();
    this.unsub = null;
  }

  /** Recalcula los ítems (para menús con valores que cambian, como Ajustes). */
  refresh() {
    if (!this.itemsFn) return;
    this.items = this.itemsFn();
    this.sel = Math.min(this.sel, this.items.length - 1);
    this.render();
  }

  render() {
    if (!this.list) return;
    this.list.textContent = '';
    this.items.forEach((item, i) => {
      const li = el('li', `row${item.static ? ' is-static' : ''}`);
      li.setAttribute('role', 'option');
      li.dataset.index = i;
      const label = el('span', 'row-label');
      const inner = el('span', 'row-text');
      if (item.spinner) inner.innerHTML = SPINNER;
      inner.append(document.createTextNode(item.label));
      label.append(inner);
      li.append(label);
      if (item.detail != null) li.append(el('span', 'row-detail', item.detail));
      if (item.chevron) li.append(el('span', 'row-chevron', '›'));
      li.addEventListener('click', () => {
        if (item.static) return;
        this.sel = i;
        this.updateSelection();
        this.select();
      });
      this.list.append(li);
    });
    this.updateSelection();
    if (this.split) this.updateArt(true);
  }

  updateSelection() {
    const rows = this.list.children;
    [...rows].forEach((row, i) => {
      const on = i === this.sel && !this.items[i]?.static;
      row.classList.toggle('is-selected', on);
      row.setAttribute('aria-selected', String(on));
      const text = row.querySelector('.row-text');
      text.classList.remove('is-marquee');
      text.style.removeProperty('--shift');
    });

    const row = rows[this.sel];
    if (!row) return;

    // Mantener la fila visible, desplazando de a una fila como el iPod.
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    const view = this.listWrap;
    if (top < view.scrollTop) view.scrollTop = top;
    else if (bottom > view.scrollTop + view.clientHeight) view.scrollTop = bottom - view.clientHeight;

    // Barra de desplazamiento.
    const overflow = view.scrollHeight > view.clientHeight + 1;
    this.node.classList.toggle('has-scroll', overflow);
    if (overflow) {
      const ratio = view.clientHeight / view.scrollHeight;
      this.thumb.style.height = `${Math.max(ratio * 100, 8)}%`;
      this.thumb.style.top = `${(view.scrollTop / view.scrollHeight) * 100}%`;
    }

    // Texto largo: lo hace correr (marquee) solo en la fila seleccionada.
    if (row.classList.contains('is-selected')) {
      const text = row.querySelector('.row-text');
      const box = row.querySelector('.row-label');
      const extra = text.scrollWidth - box.clientWidth;
      if (extra > 2) {
        text.style.setProperty('--shift', `${-(extra + 6)}px`);
        text.style.setProperty('--dur', `${Math.max(3, extra / 28 + 2)}s`);
        text.classList.add('is-marquee');
      }
      this.router?.announce(this.items[this.sel]?.label || '');
    }
  }

  updateArt(force = false) {
    if (!this.artBox) return;
    const url = (this.artFn && this.artFn()) || player.getState().track?.image || null;
    if (!force && url === this.artUrl) return;
    this.artUrl = url;
    this.artBox.textContent = '';
    this.artBox.append(artwork(url, 'kenburns'));
  }

  scroll(delta) {
    let i = this.sel + delta;
    while (this.items[i]?.static) i += delta;
    if (i < 0 || i >= this.items.length) return false;
    this.sel = i;
    this.updateSelection();
    return true;
  }

  select() {
    const item = this.items[this.sel];
    if (!item || item.static) return;
    item.onSelect?.(this, item);
  }
}
