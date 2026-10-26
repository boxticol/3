// Pantalla de texto (Acerca de, Configuración). La rueda desplaza el contenido.
import { el } from '../ui.js';

export class TextScreen {
  constructor({ title, paragraphs }) {
    this.title = title;
    this.paragraphs = paragraphs;
  }

  mount() {
    this.node = el('div', 'text-panel');
    this.paragraphs.forEach((p) => {
      const isHeading = p.startsWith('# ');
      this.node.append(el(isHeading ? 'h2' : 'p', '', isHeading ? p.slice(2) : p));
    });
    return this.node;
  }

  scroll(delta) {
    const before = this.node.scrollTop;
    this.node.scrollTop += delta * 18;
    return this.node.scrollTop !== before;
  }
}
