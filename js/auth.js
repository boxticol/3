// Autenticación con Spotify: Authorization Code + PKCE (100 % en el navegador).
// Diseñado para no quedarse pegado: toda llamada tiene tiempo límite y, si la
// sesión deja de servir, se borra y se avisa con el evento "ipod:logout".
import { SPOTIFY_CLIENT_ID, REDIRECT_URI, SCOPES } from './config.js';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const KEY_TOKENS = 'ipod.auth';
const KEY_VERIFIER = 'ipod.pkce';
const KEY_STATE = 'ipod.state';
const TIMEOUT_MS = 15000;

// ── Almacenamiento seguro (no falla en modo privado / cookies bloqueadas) ──
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* nada */
    }
  },
};

const base64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function randomString(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

/** fetch con tiempo límite: nunca deja la app esperando para siempre. */
export async function fetchWithTimeout(url, options = {}, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (e) {
    const err = new Error(e.name === 'AbortError' ? 'Spotify no responde, intenta de nuevo' : 'Sin conexión a internet');
    err.code = e.name === 'AbortError' ? 'TIMEOUT' : 'OFFLINE';
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function readTokens() {
  try {
    const t = JSON.parse(store.get(KEY_TOKENS));
    if (!t?.access_token) return null;
    // Token de otra app (cambiaste el Client ID): no sirve, se descarta.
    if (t.client_id && t.client_id !== SPOTIFY_CLIENT_ID) {
      store.del(KEY_TOKENS);
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

function saveTokens(data) {
  const prev = readTokens();
  store.set(
    KEY_TOKENS,
    JSON.stringify({
      client_id: SPOTIFY_CLIENT_ID,
      access_token: data.access_token,
      refresh_token: data.refresh_token || prev?.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in || 3600) - 60) * 1000,
    }),
  );
}

export const isConfigured = () =>
  Boolean(SPOTIFY_CLIENT_ID) && !SPOTIFY_CLIENT_ID.startsWith('PEGA_AQUI');

export const isLoggedIn = () => Boolean(readTokens());

export function logout() {
  store.del(KEY_TOKENS);
}

/** La sesión murió (revocada, expirada sin remedio): limpiar y avisar a la app. */
function sessionLost() {
  const had = Boolean(store.get(KEY_TOKENS));
  logout();
  if (had) window.dispatchEvent(new CustomEvent('ipod:logout'));
}

let loggingIn = false;

export async function login() {
  if (loggingIn) return; // evita doble clic
  if (!window.isSecureContext || !crypto?.subtle) {
    throw new Error('Abre el iPod con https:// para conectar Spotify');
  }
  loggingIn = true;
  try {
    const verifier = randomString(64);
    const state = randomString(16);
    if (!store.set(KEY_VERIFIER, verifier) || !store.set(KEY_STATE, state)) {
      throw new Error('Tu navegador bloquea el almacenamiento local (¿modo privado?)');
    }
    const params = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: base64url(await sha256(verifier)),
      scope: SCOPES,
      state,
    });
    window.location.assign(`${AUTH_URL}?${params}`);
    // Si el usuario vuelve con "atrás", permitir intentar de nuevo.
    setTimeout(() => (loggingIn = false), 4000);
  } catch (e) {
    loggingIn = false;
    throw e;
  }
}

/** Procesa la vuelta desde Spotify (?code=… o ?error=…). Devuelve { error } si algo falla. */
export async function handleRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return {};

  // Limpia la URL para que recargar no reutilice el código.
  window.history.replaceState(null, '', url.pathname);

  const expectedState = store.get(KEY_STATE);
  const verifier = store.get(KEY_VERIFIER);
  store.del(KEY_STATE);
  store.del(KEY_VERIFIER);

  if (error) return { error: error === 'access_denied' ? 'Conexión cancelada' : `Spotify: ${error}` };
  if (!verifier || url.searchParams.get('state') !== expectedState) {
    return { error: 'Inicio de sesión vencido, pulsa Conectar otra vez' };
  }

  let res;
  try {
    res = await fetchWithTimeout(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }),
    });
  } catch (e) {
    return { error: e.message };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    return { error: data.error_description || 'No se pudo iniciar sesión, intenta otra vez' };
  }
  saveTokens(data);
  return {};
}

let refreshing = null;

/** Renueva el token. Devuelve el nuevo token o null si la sesión ya no sirve. */
export function refreshToken() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const tokens = readTokens();
    if (!tokens?.refresh_token) {
      sessionLost();
      return null;
    }
    const res = await fetchWithTimeout(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      }),
    }); // si no hay red, lanza error y la sesión se conserva para reintentar
    if (!res.ok) {
      // 400/401 = refresh token revocado o vencido: hay que volver a conectar.
      if (res.status === 400 || res.status === 401) sessionLost();
      return null;
    }
    const data = await res.json().catch(() => null);
    if (!data?.access_token) return null;
    saveTokens(data);
    return data.access_token;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function getAccessToken() {
  const tokens = readTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at) return tokens.access_token;
  return refreshToken();
}

/** Para la app: tras un 401 que no se arregla renovando, la sesión se da por perdida. */
export const forceLogout = sessionLost;
