// Utilidades de interfaz compartidas.
export const ctx = { router: null, me: null, coverHint: null };

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function formatTime(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const NOTE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 18.5a2.5 2.5 0 1 1-2-2.45V5.8l11-2.3v11a2.5 2.5 0 1 1-2-2.45V7.2L9 8.7z"/></svg>';

/** Portada: imagen si hay URL, si no un placeholder con una nota musical. */
export function artwork(url, className = '') {
  const box = el('div', `art ${className}`.trim());
  if (url) {
    const img = el('img');
    img.alt = '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    img.onerror = () => {
      img.remove();
      box.classList.add('art-empty');
      box.innerHTML = NOTE_SVG;
    };
    box.append(img);
  } else {
    box.classList.add('art-empty');
    box.innerHTML = NOTE_SVG;
  }
  return box;
}

let toastTimer = null;
export function toast(message) {
  const node = document.getElementById('toast');
  if (!node || !message) return;
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2800);
}

/** Traduce errores de Spotify a mensajes que se entienden en una pantalla de iPod. */
export function friendlyError(e) {
  if (!e) return 'Algo salió mal';
  if (e.code === 'NO_DEVICE' || e.reason === 'NO_ACTIVE_DEVICE' || (e.status === 404 && /device/i.test(e.message))) {
    return 'Abre Spotify en tu teléfono o PC y vuelve a intentar';
  }
  if (e.reason === 'PREMIUM_REQUIRED' || /premium/i.test(e.message || '')) return 'Esta función requiere Spotify Premium';
  if (e.status === 401) return 'Sesión expirada: vuelve a conectar Spotify';
  if (e.status === 403) return 'Spotify no lo permite (¿tu cuenta está en User Management?)';
  if (e.status === 429) return 'Demasiadas peticiones, espera un momento';
  if (e.name === 'TypeError') return 'Sin conexión a internet';
  return e.message || 'Algo salió mal';
}
