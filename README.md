# iPod Web × Spotify

Un iPod classic en el navegador (rueda de clic, menús, "Ahora suena") conectado a tus listas de Spotify.
HTML + CSS + JavaScript sin dependencias ni build: Vercel lo publica tal cual.

## Estructura

```
index.html            Carcasa: pantalla + rueda
css/base.css          Reset, fondo, tamaño responsive del iPod (--w)
css/ipod.css          Carcasa, marco y rueda (acabados Plata / Negro / Blanco)
css/screen.css        Pantalla LCD: barra superior, menús, Ahora suena, avisos
js/config.js          ← Client ID de Spotify (lo único que debes editar)
js/auth.js            Login OAuth PKCE (sin backend, sin Client Secret)
js/api.js             Web API de Spotify (esquema feb 2026: /playlists/{id}/items)
js/player.js          Reproducción: Web Playback SDK (PC) o Spotify Connect (móvil)
js/wheel.js           Rueda: giro, toques en MENU/⏮/⏭/⏯, scroll del mouse
js/router.js          Pila de pantallas con transición lateral
js/menus.js           Árbol de menús (Música, Listas, Álbumes, Ajustes…)
js/screens/*.js       Componentes de pantalla (menú, Ahora suena, texto)
js/sound.js           Clic de la rueda (Web Audio)
js/theme.js           Acabados
vercel.json           Cabeceras de seguridad (CSP, HSTS, etc.)
```

## Puesta en marcha (10 minutos)

1. **Despliega primero** para conocer tu URL:
   sube la carpeta a un repo de GitHub → en vercel.com, *Add New → Project* → importa el repo →
   Framework Preset: **Other** → Deploy. Copia la URL, p. ej. `https://mi-ipod.vercel.app`.
2. **Crea la app de Spotify** en https://developer.spotify.com/dashboard → *Create app*:
   - Redirect URI: `https://mi-ipod.vercel.app/` (con la barra final, exacto).
   - APIs: marca **Web API** y **Web Playback SDK**.
3. Copia el **Client ID** y pégalo en `js/config.js`. Haz commit → Vercel redepliega solo.
4. Abre tu URL → *Conectar Spotify*.

> ⚠️ Usa una sola URL. Si entras por la URL de preview de Vercel (la que lleva hash), el login falla
> porque ese Redirect URI no está registrado. Agrégala en el dashboard si la necesitas.

### Probar en local (PowerShell)

```powershell
npx serve . -l 5500
```
Abre `http://127.0.0.1:5500/` (no `localhost`) y registra también `http://127.0.0.1:5500/` como Redirect URI.

## Límites de Spotify que debes conocer (no son bugs)

- **Premium obligatorio**: desde feb 2026 el dueño de la app necesita Premium para usar la Web API,
  y la reproducción (en el navegador o controlando otro equipo) también exige Premium.
- **Máximo 5 usuarios** en modo desarrollo. Para que otra persona entre, agrégala en
  *Dashboard → tu app → User Management* (nombre + correo de su cuenta Spotify).
- **Listas de otros**: Spotify solo entrega las canciones de listas tuyas o colaborativas.
  En las demás (p. ej. las de Spotify) el iPod muestra *Reproducir lista* y *Aleatorio*, que sí funcionan.
- **Celular**: el SDK de Spotify no corre en navegadores móviles. En el teléfono el iPod funciona como
  control remoto: abre la app de Spotify primero (o elige equipo en *Ajustes → Dispositivos*).

## Controles

| Acción | Rueda | Teclado |
|---|---|---|
| Moverse | Girar | ↑ ↓ |
| Seleccionar | Botón central | Enter |
| Volver | MENU | Esc |
| Reproducir/pausar | ⏯ | Espacio |
| Anterior/siguiente | ⏮ ⏭ | ← → |
| Volumen (Ahora suena) | Girar | ↑ ↓ |
| Adelantar/atrasar | Centro y luego girar | Enter y ↑ ↓ |

## Seguridad

- PKCE: el token se pide desde el navegador; no hay secreto que filtrar.
- Todo texto de Spotify se pinta con `textContent` (sin `innerHTML` con datos externos).
- CSP en `vercel.json` limita scripts a este dominio y `sdk.scdn.co`, y llamadas a dominios de Spotify.
- El token vive en `localStorage` del navegador; *Ajustes → Cerrar sesión* lo borra.
