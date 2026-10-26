// Acabados del iPod.
export const THEMES = [
  { id: 'silver', name: 'Plata' },
  { id: 'black', name: 'Negro' },
  { id: 'white', name: 'Blanco' },
];

export function currentTheme() {
  const saved = localStorage.getItem('ipod.theme');
  return THEMES.find((t) => t.id === saved) || THEMES[0];
}

export function applyTheme(theme = currentTheme()) {
  document.documentElement.dataset.theme = theme.id;
  localStorage.setItem('ipod.theme', theme.id);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme.id === 'black' ? '#141416' : '#e7e8eb';
}

export function cycleTheme() {
  const i = THEMES.findIndex((t) => t.id === currentTheme().id);
  const next = THEMES[(i + 1) % THEMES.length];
  applyTheme(next);
  return next;
}
