// Árbol de menús del iPod conectado a Spotify.
import { ctx, toast, friendlyError } from './ui.js';
import { MenuScreen } from './screens/MenuScreen.js';
import { NowPlayingScreen } from './screens/NowPlayingScreen.js';
import { TextScreen } from './screens/TextScreen.js';
import * as api from './api.js';
import * as auth from './auth.js';
import * as player from './player.js';
import * as sound from './sound.js';
import { currentTheme, cycleTheme } from './theme.js';
import { REDIRECT_URI } from './config.js';

const push = (screen) => ctx.router.push(screen);

export function showNowPlaying() {
  if (ctx.router.top?.isNowPlaying) return;
  push(new NowPlayingScreen());
}

async function play(list, index, opts) {
  try {
    await player.playFrom(list, index, opts);
    showNowPlaying();
  } catch (e) {
    toast(friendlyError(e));
  }
}

/** Filas "Reproducir todo / Aleatorio" + una fila por canción. */
function trackItems(list) {
  const items = [
    { label: 'Reproducir todo', onSelect: () => play(list, 0) },
    { label: 'Aleatorio', onSelect: () => play(list, 0, { shuffle: true }) },
  ];
  (list.tracks || []).forEach((t, i) => items.push({ label: t.name, onSelect: () => play(list, i) }));
  return items;
}

// ── Menú principal ────────────────────────────────────────────
export function mainMenu() {
  const about = { label: 'Acerca de', chevron: true, onSelect: () => push(aboutScreen()) };

  if (!auth.isConfigured()) {
    return new MenuScreen({
      title: 'iPod',
      split: true,
      items: [{ label: 'Configurar', chevron: true, onSelect: () => push(setupScreen()) }, about],
    });
  }

  if (!auth.isLoggedIn()) {
    return new MenuScreen({
      title: 'iPod',
      split: true,
      items: [
        {
          label: 'Conectar Spotify',
          chevron: true,
          onSelect: () => {
            toast('Abriendo Spotify…');
            auth.login().catch((e) => toast(friendlyError(e)));
          },
        },
        { label: 'Ajustes', chevron: true, onSelect: () => push(settingsMenu()) },
        about,
      ],
    });
  }

  return new MenuScreen({
    title: 'iPod',
    split: true,
    art: () => player.getState().track?.image || ctx.coverHint,
    items: [
      { label: 'Música', chevron: true, onSelect: () => push(musicMenu()) },
      { label: 'Listas', chevron: true, onSelect: () => push(playlistsMenu()) },
      { label: 'Aleatorio', onSelect: shuffleLiked },
      { label: 'Ahora suena', chevron: true, onSelect: showNowPlaying },
      { label: 'Ajustes', chevron: true, onSelect: () => push(settingsMenu()) },
      about,
    ],
  });
}

function musicMenu() {
  return new MenuScreen({
    title: 'Música',
    items: [
      { label: 'Listas de reproducción', chevron: true, onSelect: () => push(playlistsMenu()) },
      { label: 'Canciones que te gustan', chevron: true, onSelect: () => push(likedMenu()) },
      { label: 'Álbumes', chevron: true, onSelect: () => push(albumsMenu()) },
    ],
  });
}

async function shuffleLiked() {
  toast('Mezclando…');
  try {
    const tracks = await api.getSavedTracks();
    await player.playFrom({ title: 'Canciones', tracks }, 0, { shuffle: true });
    showNowPlaying();
  } catch (e) {
    toast(friendlyError(e));
  }
}

// ── Listas ────────────────────────────────────────────────────
function playlistsMenu() {
  return new MenuScreen({
    title: 'Listas',
    emptyText: 'No tienes listas',
    load: async () => {
      const lists = await api.getPlaylists();
      ctx.coverHint = ctx.coverHint || lists.find((p) => p.image)?.image || null;
      return lists.map((p) => ({ label: p.name, chevron: true, onSelect: () => push(playlistMenu(p)) }));
    },
  });
}

function playlistMenu(p) {
  return new MenuScreen({
    title: p.name,
    load: async () => {
      const list = { title: p.name, contextUri: p.uri, total: p.total, tracks: [] };
      try {
        list.tracks = await api.getPlaylistTracks(p.id);
      } catch (e) {
        // Desde feb 2026 Spotify solo entrega canciones de listas propias o colaborativas.
        if (e.status !== 403 && e.status !== 404) throw e;
        return [
          { label: 'Reproducir lista', onSelect: () => play(list, 0) },
          { label: 'Aleatorio', onSelect: () => play(list, 0, { shuffle: true }) },
          { label: 'Canciones ocultas por Spotify', static: true },
        ];
      }
      return list.tracks.length ? trackItems(list) : [{ label: 'Lista vacía', static: true }];
    },
  });
}

// ── Canciones que te gustan ───────────────────────────────────
function likedMenu() {
  return new MenuScreen({
    title: 'Canciones',
    emptyText: 'Aún no tienes canciones',
    load: async () => {
      const tracks = await api.getSavedTracks();
      return tracks.length ? trackItems({ title: 'Canciones', tracks }) : [];
    },
  });
}

// ── Álbumes ───────────────────────────────────────────────────
function albumsMenu() {
  return new MenuScreen({
    title: 'Álbumes',
    emptyText: 'No tienes álbumes guardados',
    load: async () =>
      (await api.getSavedAlbums()).map((a) => ({
        label: a.name,
        chevron: true,
        onSelect: () =>
          push(
            new MenuScreen({
              title: a.name,
              items: trackItems({ title: a.name, contextUri: a.uri, tracks: a.tracks }),
            }),
          ),
      })),
  });
}

// ── Ajustes ───────────────────────────────────────────────────
function settingsMenu() {
  return new MenuScreen({
    title: 'Ajustes',
    items: () => {
      const s = player.getState();
      const items = [
        {
          label: 'Acabado',
          detail: currentTheme().name,
          onSelect: (screen) => {
            cycleTheme();
            screen.refresh();
          },
        },
        {
          label: 'Clic',
          detail: sound.isEnabled() ? 'Sí' : 'No',
          onSelect: (screen) => {
            sound.setEnabled(!sound.isEnabled());
            screen.refresh();
          },
        },
      ];
      if (!auth.isLoggedIn()) return items;

      items.push(
        {
          label: 'Aleatorio',
          detail: s.shuffle ? 'Sí' : 'No',
          onSelect: async (screen) => {
            try {
              await player.setShuffle(!s.shuffle);
              screen.refresh();
            } catch (e) {
              toast(friendlyError(e));
            }
          },
        },
        { label: 'Dispositivos', chevron: true, onSelect: () => push(devicesMenu()) },
        { label: 'Cuenta', detail: ctx.me?.name || '—', static: true },
        {
          label: 'Cerrar sesión',
          onSelect: () => {
            auth.logout();
            player.stopPolling();
            ctx.me = null;
            ctx.router.home(mainMenu());
            toast('Sesión cerrada');
          },
        },
      );
      return items;
    },
  });
}

function devicesMenu() {
  return new MenuScreen({
    title: 'Dispositivos',
    emptyText: 'Abre Spotify en algún equipo',
    load: async () => {
      const devices = await api.getDevices();
      return devices.map((d) => ({
        label: d.name,
        detail: d.is_active ? '✓' : '',
        static: d.is_restricted,
        onSelect: async () => {
          try {
            await player.transferTo(d.id);
            toast(`Sonando en ${d.name}`);
          } catch (e) {
            toast(friendlyError(e));
          }
        },
      }));
    },
  });
}

// ── Textos ────────────────────────────────────────────────────
function aboutScreen() {
  return new TextScreen({
    title: 'Acerca de',
    paragraphs: [
      '# Cómo se usa',
      'Gira la rueda para moverte. Botón central: seleccionar. MENU: volver.',
      '⏯ reproduce o pausa. ⏮ ⏭ cambian de canción.',
      'En "Ahora suena" la rueda sube o baja el volumen. Pulsa el centro y la rueda adelanta o atrasa la canción.',
      '# Teclado',
      '↑ ↓ moverse · Enter seleccionar · Esc volver · Espacio reproducir · ← → canción anterior/siguiente.',
      '# Dónde suena',
      'En computador suena en este navegador (Spotify Premium). En el celular el iPod controla tu app de Spotify: ábrela primero.',
    ],
  });
}

function setupScreen() {
  return new TextScreen({
    title: 'Configurar',
    paragraphs: [
      '# Falta el Client ID',
      '1. Crea una app en developer.spotify.com/dashboard (Web API + Web Playback SDK).',
      `2. Agrega este Redirect URI: ${REDIRECT_URI}`,
      '3. Pega el Client ID en js/config.js y vuelve a desplegar.',
    ],
  });
}
