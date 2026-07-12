export type Theme = 'light' | 'pink' | 'cream';

export function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove('theme-light', 'theme-pink', 'theme-cream');
  html.classList.add(`theme-${theme}`);
  localStorage.setItem('lt-theme', theme);
}

export function getTheme(): Theme {
  return (localStorage.getItem('lt-theme') as Theme) || 'pink';
}
