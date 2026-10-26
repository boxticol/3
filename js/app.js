// Punto de entrada: conecta rueda, teclado, router y reproductor.
import { Router } from './router.js';
import { initWheel } from './wheel.js';
import { ctx, toast, friendlyError } from './ui.js';
import { mainMenu } from './menus.js';
import { applyTheme } from './theme.js';
import * as auth from './auth.js';
import * as api from './api.js';
import * as player from './player.js';
import * as sound from './sound.js';
import { PRODUCTION_ORIGIN, shouldMoveToProduction } from './config.js';

const $ = (id) => document.getElementById(id);

function wire() {
  const router = ctx.router;
  const safely = (fn) => () => Promise.resolve().then(fn).catch((e) => toast(friendlyError(e)));
  let unlocked = false;

  const actions = {
    onGesture() {
      sound.unlock();
      if (!unlocked) {
        unlocked = true;
        player.activate();
      }
    },
    onScroll(delta) {
      if (router.scroll(delta)) sound.click();
    },
    onSelect() {
      sound.click();
      router.select();
    },
    onMenu() {
      sound.click();
      router.back();
    },
    onPlay: safely(() => {
      sound.click();
      return player.togglePlay();
    }),
    onNext: safely(() => {
      sound.click();
      return player.next();
    }),
    onPrev: safely(() => {
      sound.click();
      return player.previous();
    }),
  };

  initWheel($('wheel'), $('wheel-center'), actions);

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map = {
      ArrowUp: () => actions.onScroll(-1),
      ArrowDown: () => actions.onScroll(1),
      Enter: actions.onSelect,
      Escape: actions.onMenu,
      Backspace: actions.onMenu,
      ' ': actions.onPlay,
      ArrowRight: actions.onNext,
      ArrowLeft: actions.onPrev,
    };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    actions.onGesture();
    fn();
  });

  // Ícono ▶ en la barra superior.
  player.subscribe((s) => {
    $('status-play').classList.toggle('is-on', Boolean(s.track) && !s.paused);
  });
  player.onMessage(toast);
}

async function boot() {
  // Abierto desde una URL de preview: ir al dominio registrado en Spotify.
  if (shouldMoveToProduction()) {
    window.location.replace(PRODUCTION_ORIGIN + window.location.pathname + window.location.search);
    return;
  }

  applyTheme();

  ctx.router = new Router({ viewport: $('viewport'), title: $('status-title'), live: $('sr-live') });

  let loginError = null;
  try {
    loginError = (await auth.handleRedirect()).error;
  } catch {
    loginError = 'No se pudo iniciar sesión';
  }

  ctx.router.reset(mainMenu());
  wire();
  if (loginError) toast(loginError);

  // Si la sesión muere (token revocado, cambiaste de app…), volver a "Conectar Spotify".
  window.addEventListener('ipod:logout', () => {
    player.stopPolling();
    ctx.me = null;
    ctx.router.home(mainMenu());
    toast('Sesión expirada: vuelve a conectar Spotify');
  });

  if (auth.isLoggedIn()) {
    player.startPolling();
    player.initSdk();
    api
      .getMe()
      .then((me) => (ctx.me = me))
      .catch((e) => toast(friendlyError(e)));
  }
}

boot();
