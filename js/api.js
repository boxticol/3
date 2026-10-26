// Cliente mínimo de la Web API de Spotify (esquema de febrero 2026:
// /playlists/{id}/items, campo `items` en lugar de `tracks`, `item` en lugar de `track`).
import { getAccessToken, refreshToken, forceLogout, fetchWithTimeout } from './auth.js';

const BASE = 'https://api.spotify.com/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(status, message, reason) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

async function request(path, { method = 'GET', query, body } = {}, attempt = 0) {
  const token = await getAccessToken();
  if (!token) {
    forceLogout();
    throw new ApiError(401, 'Sesión expirada');
  }

  const url = new URL(path.startsWith('http') ? path : BASE + path);
  if (url.origin !== new URL(BASE).origin) throw new ApiError(400, 'URL no permitida');
  Object.entries(query || {}).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetchWithTimeout(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    if (attempt === 0 && (await refreshToken())) return request(path, { method, query, body }, 1);
    forceLogout(); // ni renovando sirve: volver a "Conectar Spotify"
    throw new ApiError(401, 'Sesión expirada');
  }
  if (res.status === 429 && attempt < 2) {
    const wait = Math.min(Number(res.headers.get('Retry-After')) || 1, 8);
    await sleep(wait * 1000);
    return request(path, { method, query, body }, attempt + 1);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.message || `Error ${res.status}`, data?.error?.reason);
  }
  return data;
}

async function paginate(path, query, map, max = 1000) {
  const out = [];
  let page = await request(path, { query });
  let pages = 1;
  while (page && pages <= 40) {
    out.push(...(page.items || []).map(map).filter(Boolean));
    if (!page.next || out.length >= max) break;
    page = await request(page.next);
    pages++;
  }
  return out.slice(0, max);
}

// ── Normalización ─────────────────────────────────────────────
export function pickImage(images, min = 300) {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (sorted.find((i) => (i.width || 0) >= min) || sorted[sorted.length - 1]).url;
}

export function normTrack(t, albumFallback) {
  if (!t?.uri || t.is_local) return null;
  const album = t.album || albumFallback;
  const artists = t.artists?.length ? t.artists : t.show ? [{ name: t.show.name }] : [];
  return {
    uri: t.uri,
    name: t.name || 'Sin título',
    artist: artists.map((a) => a.name).join(', ') || 'Artista desconocido',
    album: album?.name || t.show?.name || '',
    image: pickImage(album?.images || t.images),
    duration: t.duration_ms || 0,
  };
}

// ── Usuario y biblioteca ──────────────────────────────────────
export async function getMe() {
  const me = await request('/me');
  return { id: me.id, name: me.display_name || me.id };
}

export function getPlaylists() {
  return paginate('/me/playlists', { limit: 50 }, (p) =>
    p
      ? {
          id: p.id,
          uri: p.uri,
          name: p.name || 'Lista sin nombre',
          image: pickImage(p.images),
          total: p.items?.total ?? p.tracks?.total ?? 0,
        }
      : null,
  );
}

/** Solo funciona con listas propias o colaborativas (regla de Spotify, feb 2026). */
export function getPlaylistTracks(id) {
  return paginate(
    `/playlists/${encodeURIComponent(id)}/items`,
    { limit: 50, additional_types: 'track,episode' },
    (entry) => normTrack(entry?.item ?? entry?.track),
    1000,
  );
}

let likedCache = null;
export async function getSavedTracks() {
  if (likedCache && Date.now() - likedCache.at < 5 * 60 * 1000) return likedCache.tracks;
  const tracks = await paginate('/me/tracks', { limit: 50 }, (e) => normTrack(e?.track ?? e?.item), 500);
  likedCache = { at: Date.now(), tracks };
  return tracks;
}

export function getSavedAlbums() {
  return paginate(
    '/me/albums',
    { limit: 50 },
    (e) => {
      const a = e?.album;
      if (!a) return null;
      return {
        id: a.id,
        uri: a.uri,
        name: a.name,
        artist: (a.artists || []).map((x) => x.name).join(', '),
        image: pickImage(a.images),
        tracks: (a.tracks?.items || []).map((t) => normTrack(t, a)).filter(Boolean),
      };
    },
    300,
  );
}

// ── Reproducción ──────────────────────────────────────────────
export const getPlaybackState = () => request('/me/player', { query: { additional_types: 'track,episode' } });

export async function getDevices() {
  const data = await request('/me/player/devices');
  return data?.devices || [];
}

export const play = (body, deviceId) =>
  request('/me/player/play', { method: 'PUT', query: { device_id: deviceId }, body });
export const resume = (deviceId) => request('/me/player/play', { method: 'PUT', query: { device_id: deviceId } });
export const pause = () => request('/me/player/pause', { method: 'PUT' });
export const next = () => request('/me/player/next', { method: 'POST' });
export const previous = () => request('/me/player/previous', { method: 'POST' });
export const seek = (ms) =>
  request('/me/player/seek', { method: 'PUT', query: { position_ms: Math.max(0, Math.round(ms)) } });
export const setVolume = (pct) =>
  request('/me/player/volume', { method: 'PUT', query: { volume_percent: Math.round(pct) } });
export const setShuffle = (on, deviceId) =>
  request('/me/player/shuffle', { method: 'PUT', query: { state: on, device_id: deviceId } });
export const transfer = (deviceId, playNow = true) =>
  request('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play: playNow } });
