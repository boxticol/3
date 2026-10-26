// Pila de pantallas con la transición lateral del iPod.
import { reducedMotion } from './ui.js';

function animate(node, className, done) {
  if (reducedMotion()) {
    done?.();
    return;
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    node.classList.remove(className);
    done?.();
  };
  node.classList.add(className);
  node.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 400);
}

export class Router {
  constructor({ viewport, title, live }) {
    this.viewport = viewport;
    this.titleEl = title;
    this.live = live;
    this.stack = [];
  }

  get top() {
    return this.stack[this.stack.length - 1];
  }

  setTitle(text) {
    this.titleEl.textContent = text;
  }

  announce(text) {
    if (this.live) this.live.textContent = text;
  }

  reset(screen) {
    this.stack.forEach((s) => s.leave?.());
    this.stack = [];
    this.viewport.textContent = '';
    this.push(screen, { animate: false });
  }

  push(screen, { animate: withAnimation = true } = {}) {
    const prev = this.top;
    screen.router = this;
    const node = screen.mount();
    node.classList.add('panel');
    this.viewport.append(node);
    this.stack.push(screen);
    this.setTitle(screen.title);

    if (prev) {
      prev.leave?.();
      if (withAnimation) {
        animate(prev.node, 'out-left', () => (prev.node.hidden = true));
        animate(node, 'in-right');
      } else {
        prev.node.hidden = true;
      }
    }
    screen.enter?.();
  }

  back() {
    const top = this.top;
    if (top?.back?.()) return true; // la pantalla lo resolvió (p. ej. salir de "adelantar")
    if (this.stack.length <= 1) return false;

    this.stack.pop();
    top.leave?.();
    const prev = this.top;
    prev.node.hidden = false;
    this.setTitle(prev.title);
    animate(top.node, 'out-right', () => top.node.remove());
    animate(prev.node, 'in-left');
    prev.enter?.();
    return true;
  }

  /** Vuelve a la pantalla inicial reemplazándola (tras iniciar/cerrar sesión). */
  home(screen) {
    this.reset(screen);
  }

  scroll(delta) {
    return Boolean(this.top?.scroll?.(delta));
  }

  select() {
    this.top?.select?.();
  }
}
