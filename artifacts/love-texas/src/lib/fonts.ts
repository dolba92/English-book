export interface FontOption {
  label: string;
  value: string;
  css: string;
}

export const FONTS: FontOption[] = [
  { label: 'DM Sans', value: 'DM Sans', css: '"DM Sans", sans-serif' },
  { label: 'Source Serif', value: 'Source Serif 4', css: '"Source Serif 4", serif' },
  { label: 'Georgia', value: 'Georgia', css: 'Georgia, serif' },
  { label: 'Fraunces', value: 'Fraunces', css: 'Fraunces, serif' },
  { label: 'Source Serif italic', value: 'Source Serif italic', css: '"Source Serif 4", serif' },
  { label: 'Space Mono', value: 'Space Mono', css: '"Space Mono", monospace' },
];

export function getFontCss(value: string): string {
  return FONTS.find(f => f.value === value)?.css ?? '"Source Serif 4", serif';
}
