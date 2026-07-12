let voicesReady = false;
let cachedVoice: SpeechSynthesisVoice | null = null;

function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Prefer a named US English voice
  return (
    voices.find(v => v.lang === 'en-US' && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Alex'))) ||
    voices.find(v => v.lang === 'en-US') ||
    voices.find(v => v.lang.startsWith('en')) ||
    null
  );
}

// Pre-load voices as soon as possible
if ('speechSynthesis' in window) {
  // Chrome loads voices async
  if (window.speechSynthesis.getVoices().length > 0) {
    cachedVoice = pickEnglishVoice();
    voicesReady = true;
  }
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickEnglishVoice();
    voicesReady = true;
  };
}

export function speak(text: string): void {
  if (!('speechSynthesis' in window) || !text.trim()) return;

  // Cancel any ongoing speech first
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = 'en-US';
  utterance.rate = 0.9;

  // Use cached voice if available, otherwise let browser pick
  if (voicesReady && cachedVoice) {
    utterance.voice = cachedVoice;
  } else if (!voicesReady) {
    // Voices not loaded yet — retry after a short delay
    setTimeout(() => {
      cachedVoice = pickEnglishVoice();
      voicesReady = true;
      const u2 = new SpeechSynthesisUtterance(text.trim());
      u2.lang = 'en-US';
      u2.rate = 0.9;
      if (cachedVoice) u2.voice = cachedVoice;
      window.speechSynthesis.speak(u2);
    }, 300);
    return;
  }

  window.speechSynthesis.speak(utterance);
}
