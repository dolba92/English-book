export interface FontOption {
  label: string;
  value: string;
  css: string;
}

export const FONTS: FontOption[] = [
  { label: 'Inter', value: 'Inter', css: 'Inter, sans-serif' },
  { label: 'Arial', value: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman', css: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia', css: 'Georgia, serif' },
  { label: 'Playfair Display', value: 'Playfair Display', css: '"Playfair Display", serif' },
  { label: 'Merriweather', value: 'Merriweather', css: 'Merriweather, serif' },
  { label: 'Lora', value: 'Lora', css: 'Lora, serif' },
  { label: 'Roboto', value: 'Roboto', css: 'Roboto, sans-serif' },
  { label: 'Open Sans', value: 'Open Sans', css: '"Open Sans", sans-serif' },
  { label: 'Crimson Text', value: 'Crimson Text', css: '"Crimson Text", serif' },
  { label: 'EB Garamond', value: 'EB Garamond', css: '"EB Garamond", serif' },
  { label: 'Libre Baskerville', value: 'Libre Baskerville', css: '"Libre Baskerville", serif' },
];

export function getFontCss(value: string): string {
  return FONTS.find(f => f.value === value)?.css ?? value;
}
