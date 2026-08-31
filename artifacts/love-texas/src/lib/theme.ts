export type Theme = 'light' | 'pink' | 'cream' | 'dark';

export function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove('theme-light', 'theme-pink', 'theme-cream', 'theme-dark', 'dark');
  html.classList.add(`theme-${theme}`);
  if (theme === 'dark') html.classList.add('dark');
  localStorage.setItem('lt-theme', theme);
}

export function getTheme(): Theme {
  const saved = localStorage.getItem('lt-theme');
  return saved === 'light' || saved === 'pink' || saved === 'cream' || saved === 'dark' ? saved : 'pink';
}
