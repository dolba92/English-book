/**
 * speak() — произнести английское слово/фразу через Web Speech API.
 * Максимально простая реализация без лишних зависимостей.
 */
export function speak(text: string): void {
  if (!('speechSynthesis' in window) || !text.trim()) return;

  // Отменяем текущее воспроизведение
  window.speechSynthesis.cancel();

  const say = () => {
    const u = new SpeechSynthesisUtterance(text.trim());
    u.lang = 'en-US';
    u.rate = 0.85;
    u.pitch = 1;

    // Пробуем выбрать английский голос
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en'));
    if (en) u.voice = en;

    window.speechSynthesis.speak(u);
  };

  // Если голоса ещё не загружены — ждём события
  if (window.speechSynthesis.getVoices().length === 0) {
    const handler = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      say();
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    // Страховочный таймаут: если событие не придёт — всё равно говорим
    setTimeout(say, 500);
  } else {
    say();
  }
}
