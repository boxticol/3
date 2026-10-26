// "Ahora suena": portada, títulos, barra de progreso.
// Rueda = volumen. Centro = modo adelantar/atrasar (la rueda mueve la posición).
import { el, artwork, formatTime, toast, friendlyError } from '../ui.js';
import * as player from '../player.js';

const SCRUB_STEP_MS = 5000;
const VOLUME_STEP = 3;

export class NowPlayingScreen {
  title = 'Ahora suena';
  isNowPlaying = true;

  mount() {
    this.node = el('div', 'np');
    this.empty = el('div', 'np-empty', 'Nada en reproducción');
    this.count = el('div', 'np-count');
    this.artSlot = el('div', 'np-art');
    this.titleEl = el('div', 'np-title');
    this.artistEl = el('div', 'np-artist');
    this.albumEl = el('div', 'np-album');
    const meta = el('div', 'np-meta');
    meta.append(this.titleEl, this.artistEl, this.albumEl);
    const main = el('div', 'np-main');
    main.append(this.artSlot, meta);

    // Progreso
    this.progress = el('div', 'np-progress');
    this.bar = el('div', 'bar');
    this.fill = el('div', 'bar-fill');
    this.knob = el('div', 'bar-knob');
    this.bar.append(this.fill, this.knob);
    const times = el('div', 'np-times');
    this.elapsed = el('span', '', '0:00');
    this.remaining = el('span', '', '-0:00');
    times.append(this.elapsed, this.remaining);
    this.progress.append(this.bar, times);

    // Volumen (reemplaza la barra unos segundos, como el iPod)
    this.volume = el('div', 'np-volume');
    this.volume.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/></svg>';
    const vbar = el('div', 'bar');
    this.vfill = el('div', 'bar-fill');
    vbar.append(this.vfill);
    this.volume.append(vbar);
    this.volume.insertAdjacentHTML(
      'beforeend',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
    );

    this.content = el('div', 'np-content');
    this.content.append(this.count, main, this.progress, this.volume);
    this.node.append(this.empty, this.content);
    return this.node;
  }

  enter() {
    this.unsub = player.subscribe((s) => this.update(s));
    this.timer = setInterval(() => this.tick(), 250);
  }

  leave() {
    this.unsub?.();
    clearInterval(this.timer);
    this.endScrub(false);
  }

  update(s) {
    const t = s.track;
    this.node.classList.toggle('is-empty', !t);
    if (!t) return;
    if (t.uri !== this.uri) {
      this.uri = t.uri;
      this.titleEl.textContent = t.name;
      this.artistEl.textContent = t.artist;
      this.albumEl.textContent = t.album;
      this.artSlot.textContent = '';
      this.artSlot.append(artwork(t.image, 'reflect'));
    }
    const q = player.queueInfo();
    this.count.textContent = q ? `${q.index} de ${q.total}` : s.deviceName ? `En ${s.deviceName}` : '';
    this.vfill.style.width = `${s.volume}%`;
    this.tick();
  }

  tick() {
    const s = player.getState();
    if (!s.track) return;
    const dur = s.duration || s.track.duration || 0;
    const pos = this.scrubbing ? this.scrubPos : player.currentPosition();
    const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;
    this.fill.style.width = `${pct}%`;
    this.knob.style.left = `${pct}%`;
    this.elapsed.textContent = formatTime(pos);
    this.remaining.textContent = `-${formatTime(dur - pos)}`;
  }

  showVolume() {
    this.node.classList.add('show-volume');
    clearTimeout(this.volumeTimer);
    this.volumeTimer = setTimeout(() => this.node.classList.remove('show-volume'), 1600);
  }

  startScrub() {
    this.scrubbing = true;
    this.scrubPos = player.currentPosition();
    this.node.classList.add('is-scrubbing');
    this.node.classList.remove('show-volume');
    this.armScrubTimeout();
  }

  armScrubTimeout() {
    clearTimeout(this.scrubIdle);
    this.scrubIdle = setTimeout(() => this.endScrub(true), 3500);
  }

  endScrub(commit) {
    clearTimeout(this.scrubIdle);
    clearTimeout(this.seekTimer);
    if (this.scrubbing && commit && this.pendingSeek) {
      player.seek(this.scrubPos).catch((e) => toast(friendlyError(e)));
    }
    this.scrubbing = false;
    this.pendingSeek = false;
    this.node?.classList.remove('is-scrubbing');
  }

  scroll(delta) {
    const s = player.getState();
    if (!s.track) return false;
    if (this.scrubbing) {
      const dur = s.duration || s.track.duration || 0;
      this.scrubPos = Math.max(0, Math.min(dur - 1000, this.scrubPos + delta * SCRUB_STEP_MS));
      this.pendingSeek = true;
      this.tick();
      this.armScrubTimeout();
      clearTimeout(this.seekTimer);
      this.seekTimer = setTimeout(() => {
        this.pendingSeek = false;
        player.seek(this.scrubPos).catch((e) => toast(friendlyError(e)));
      }, 450);
      return true;
    }
    const next = Math.max(0, Math.min(100, s.volume + delta * VOLUME_STEP));
    if (next === s.volume) return false;
    player.setVolume(next);
    this.showVolume();
    return true;
  }

  select() {
    if (!player.getState().track) return;
    if (this.scrubbing) this.endScrub(true);
    else this.startScrub();
  }

  back() {
    if (this.scrubbing) {
      this.endScrub(true);
      return true;
    }
    return false;
  }
}
