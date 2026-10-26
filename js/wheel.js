// Rueda de clic: girar = desplazarse; tocar arriba/derecha/abajo/izquierda = MENU/⏭/⏯/⏮.
const STEP_DEG = 15; // 24 "clics" por vuelta, como el iPod
const TAP_SLOP_PX = 10;

function zoneFor(deg) {
  if (deg >= -135 && deg < -45) return 'menu';
  if (deg >= -45 && deg < 45) return 'next';
  if (deg >= 45 && deg < 135) return 'play';
  return 'prev';
}

export function initWheel(wheel, center, handlers) {
  let drag = null;

  const angleOf = (e) => {
    const r = wheel.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };

  const press = (zone) => {
    const label = wheel.querySelector(`[data-zone="${zone}"]`);
    label?.classList.add('is-pressed');
    setTimeout(() => label?.classList.remove('is-pressed'), 140);
  };

  wheel.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.wheel-center')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    handlers.onGesture?.();
    wheel.setPointerCapture(e.pointerId);
    const a = angleOf(e);
    drag = { id: e.pointerId, last: a, start: a, acc: 0, ticks: 0, x: e.clientX, y: e.clientY, far: false };
  });

  wheel.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > TAP_SLOP_PX) drag.far = true;
    const a = angleOf(e);
    let d = a - drag.last;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    drag.last = a;
    drag.acc += d;
    while (drag.acc >= STEP_DEG) {
      drag.acc -= STEP_DEG;
      drag.ticks++;
      handlers.onScroll(1);
    }
    while (drag.acc <= -STEP_DEG) {
      drag.acc += STEP_DEG;
      drag.ticks++;
      handlers.onScroll(-1);
    }
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const wasTap = drag.ticks === 0 && !drag.far && e.type === 'pointerup';
    const zone = zoneFor(drag.start);
    drag = null;
    if (!wasTap) return;
    press(zone);
    ({ menu: handlers.onMenu, next: handlers.onNext, play: handlers.onPlay, prev: handlers.onPrev })[zone]?.();
  };
  wheel.addEventListener('pointerup', end);
  wheel.addEventListener('pointercancel', end);

  center.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handlers.onGesture?.();
    center.classList.add('is-pressed');
  });
  const release = () => center.classList.remove('is-pressed');
  center.addEventListener('pointerup', release);
  center.addEventListener('pointerleave', release);
  center.addEventListener('click', () => handlers.onSelect());

  // Rueda del mouse / trackpad sobre el iPod.
  let wheelAcc = 0;
  wheel.closest('.ipod').addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      wheelAcc += e.deltaY;
      while (Math.abs(wheelAcc) >= 40) {
        const dir = Math.sign(wheelAcc);
        wheelAcc -= dir * 40;
        handlers.onScroll(dir);
      }
    },
    { passive: false },
  );
}
