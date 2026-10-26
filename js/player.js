// Controlador de reproducción.
// - Escritorio: Web Playback SDK → el navegador suena como un parlante de Spotify (requiere Premium).
// - Móvil: Spotify no soporta el SDK en navegadores móviles, así que el iPod funciona como
//   control remoto (Spotify Connect) de la app de Spotify abierta en el teléfono u otro equipo.
import * as api from './api.js';
import { getAccessToken } from './auth.js';
import { PLAYER_NAME } from './config.js';

const isMobile =
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const state = {
  sdkStatus: 'idle', // idle | loading | ready | unsupported | error
  deviceId: null, // id del parlante "iPod Web" (SDK)
  localActive: false, // ¿está sonando en este navegador?
  activeDeviceId: null,
  deviceName: null,
  track: null,
  paused: true,
  position: 0,
  duration: 0,
  updatedAt: Date.now(),
  shuffle: false,
  volume: 60,
  queue: null, // { title, tracks } para mostrar "3 de 25"
};

const listeners = new Set();
let notify = () => {};
let sdk = null;
let pollTimer = null;

const emit = () => listeners.forEach((fn) => fn(state));

export const getState = () => state;
export const onMessage = (fn) => (notify = fn);
export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function currentPosition() {
  if (state.paused) return state.position;
  return Math.min(state.duration || Infinity, state.position + (Date.now() - state.updatedAt));
}

export function queueInfo() {
  if (!state.queue?.tracks?.length || !state.track) return null;
  const i = state.queue.tracks.findIndex((t) => t.uri === state.track.uri);
  return i < 0 ? null : { index: i + 1, total: state.queue.tracks.length };
}

// ── Web Playback SDK ──────────────────────────────────────────
function loadSdkScript() {
  return new Promise((resolve, reject) => {
    if (window.Spotify) return resolve();
    const timer = setTimeout(() => reject(new Error('timeout')), 15000);
    window.onSpotifyWebPlaybackSDKReady = () => {
      clearTimeout(timer);
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    s.onerror = () => reject(new Error('sdk'));
    document.head.appendChild(s);
  });
}

function sdkFailed(message) {
  state.sdkStatus = 'error';
  state.deviceId = null;
  emit();
  if (message) notify(message);
}

export async function initSdk() {
  if (isMobile) {
    state.sdkStatus = 'unsupported';
    emit();
    return;
  }
  if (state.sdkStatus === 'loading' || state.sdkStatus === 'ready') return;
  state.sdkStatus = 'loading';
  try {
    await loadSdkScript();
  } catch {
    sdkFailed();
    return;
  }

  sdk = new window.Spotify.Player({
    name: PLAYER_NAME,
    getOAuthToken: (cb) => getAccessToken().then((t) => t && cb(t)).catch(() => {}),
    volume: state.volume / 100,
  });

  sdk.addListener('ready', ({ device_id }) => {
    state.deviceId = device_id;
    state.sdkStatus = 'ready';
    emit();
  });
  sdk.addListener('not_ready', () => {
    state.localActive = false;
    emit();
  });
  sdk.addListener('initialization_error', () => sdkFailed());
  sdk.addListener('authentication_error', () => sdkFailed('Spotify rechazó la sesión'));
  sdk.addListener('account_error', () => sdkFailed('Se necesita Spotify Premium para sonar aquí'));
  sdk.addListener('playback_error', () => notify('No se pudo reproducir esta canción'));
  sdk.addListener('player_state_changed', (s) => {
    if (!s) {
      state.localActive = false;
      emit();
      return;
    }
    state.localActive = true;
    const t = s.track_window?.current_track;
    if (t) {
      state.track = {
        uri: t.uri,
        name: t.name,
        artist: (t.artists || []).map((a) => a.name).join(', '),
        album: t.album?.name || '',
        image: api.pickImage(t.album?.images),
        duration: t.duration_ms,
      };
    }
    state.paused = s.paused;
    state.position = s.position;
    state.duration = s.duration;
    state.shuffle = s.shuffle;
    state.updatedAt = Date.now();
    state.activeDeviceId = state.deviceId;
    state.deviceName = PLAYER_NAME;
    emit();
  });

  const ok = await sdk.connect();
  if (!ok) sdkFailed();
}

/** Desbloquea el audio del navegador. Llamar dentro de un gesto del usuario. */
export function activate() {
  sdk?.activateElement?.();
}

// ── Estado vía Web API (sondeo) ───────────────────────────────
function applyApiState(d) {
  if (!d || !d.item) {
    if (!state.localActive) {
      state.paused = true;
      emit();
    }
    return;
  }
  // Si este navegador está sonando, los eventos del SDK mandan.
  if (state.localActive && d.device?.id === state.deviceId) {
    state.volume = d.device?.volume_percent ?? state.volume;
    return;
  }
  state.track = api.normTrack(d.item);
  state.paused = !d.is_playing;
  state.position = d.progress_ms || 0;
  state.duration = d.item.duration_ms || 0;
  state.updatedAt = Date.now();
  state.shuffle = Boolean(d.shuffle_state);
  state.volume = d.device?.volume_percent ?? state.volume;
  state.activeDeviceId = d.device?.id || null;
  state.deviceName = d.device?.name || null;
  state.localActive = Boolean(state.deviceId) && d.device?.id === state.deviceId;
  emit();
}

async function poll() {
  if (document.hidden) return;
  try {
    applyApiState(await api.getPlaybackState());
  } catch {
    /* silencioso: el siguiente sondeo lo reintenta */
  }
}

export function startPolling() {
  stopPolling();
  poll();
  pollTimer = setInterval(poll, 4000);
  document.addEventListener('visibilitychange', poll);
}

export function stopPolling() {
  clearInterval(pollTimer);
  document.removeEventListener('visibilitychange', poll);
}

const refreshSoon = () => setTimeout(poll, 700);

// ── Comandos ──────────────────────────────────────────────────
async function targetDevice() {
  if (state.sdkStatus === 'ready' && state.deviceId) return state.deviceId;
  if (state.activeDeviceId) return state.activeDeviceId;
  const devices = await api.getDevices();
  const d = devices.find((x) => x.is_active) || devices.find((x) => !x.is_restricted);
  if (!d) {
    const err = new Error('Abre Spotify en tu teléfono o PC y vuelve a intentar');
    err.code = 'NO_DEVICE';
    throw err;
  }
  return d.id;
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Reproduce una lista. list = { title, contextUri?, tracks?, total? }
 * Con contextUri usa el contexto de Spotify (lista/álbum); sin él, envía las URIs.
 */
export async function playFrom(list, index = 0, { shuffle = false } = {}) {
  const device = await targetDevice();
  let tracks = list.tracks || [];
  let body;

  if (list.contextUri) {
    const total = tracks.length || list.total || 1;
    const start = shuffle ? Math.floor(Math.random() * total) : index;
    body = { context_uri: list.contextUri, offset: { position: start } };
    index = start;
  } else {
    if (!tracks.length) throw new Error('No hay canciones para reproducir');
    if (shuffle) {
      tracks = shuffled(tracks);
      index = 0;
    }
    body = { uris: tracks.slice(index, index + 100).map((t) => t.uri) };
  }

  await api.play(body, device);
  if (list.contextUri) api.setShuffle(shuffle, device).catch(() => {});

  state.queue = { title: list.title, tracks };
  if (tracks[index]) {
    state.track = tracks[index];
    state.duration = tracks[index].duration;
  }
  state.paused = false;
  state.position = 0;
  state.updatedAt = Date.now();
  state.shuffle = shuffle;
  state.activeDeviceId = device;
  emit();
  refreshSoon();
}

export async function togglePlay() {
  if (sdk && state.localActive) {
    await sdk.togglePlay();
    return;
  }
  if (!state.track) throw new Error('Elige una canción primero');
  const wasPaused = state.paused;
  state.position = currentPosition();
  state.updatedAt = Date.now();
  state.paused = !wasPaused;
  emit();
  try {
    if (wasPaused) await api.resume(state.activeDeviceId || (await targetDevice()));
    else await api.pause();
  } catch (e) {
    state.paused = wasPaused;
    emit();
    throw e;
  }
  refreshSoon();
}

export async function next() {
  if (sdk && state.localActive) return sdk.nextTrack();
  await api.next();
  refreshSoon();
}

export async function previous() {
  if (sdk && state.localActive) return sdk.previousTrack();
  await api.previous();
  refreshSoon();
}

export async function seek(ms) {
  state.position = Math.max(0, Math.min(ms, state.duration || ms));
  state.updatedAt = Date.now();
  emit();
  if (sdk && state.localActive) return sdk.seek(state.position);
  await api.seek(state.position);
}

let volumeTimer = null;
export function setVolume(pct) {
  state.volume = Math.max(0, Math.min(100, pct));
  emit();
  if (sdk && state.localActive) {
    sdk.setVolume(state.volume / 100);
    return;
  }
  clearTimeout(volumeTimer);
  volumeTimer = setTimeout(() => {
    api.setVolume(state.volume).catch((e) => {
      notify(e.reason === 'VOLUME_CONTROL_DISALLOW' ? 'Este dispositivo no deja cambiar el volumen' : 'No se pudo cambiar el volumen');
    });
  }, 250);
}

export async function setShuffle(on) {
  await api.setShuffle(on, state.activeDeviceId || undefined);
  state.shuffle = on;
  emit();
}

export async function transferTo(deviceId) {
  await api.transfer(deviceId, true);
  state.activeDeviceId = deviceId;
  refreshSoon();
}
