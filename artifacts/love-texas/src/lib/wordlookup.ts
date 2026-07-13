/**
 * Word lookup — Lingva Translate API (Google Translate proxy, CORS-friendly).
 * Returns Russian translation + alternatives grouped by part of speech.
 * Falls back to MyMemory if Lingva fails.
 *
 * Lingva API: https://lingva.ml/api/v1/{source}/{target}/{query}
 */

export interface RuGroup {
  pos: string;          // часть речи на русском: «гл.», «сущ.», «прил.» и т.д.
  words: string[];      // русские варианты перевода
}

export interface WordInfo {
  word: string;
  phonetic?: string;
  translation: string;  // основной перевод
  groups: RuGroup[];    // все варианты, сгруппированные по частям речи
}

// ── Lingva mirrors (попробуем по очереди) ─────────────────────────────────────
const LINGVA_MIRRORS = [
  'https://lingva.ml',
  'https://translate.plausibility.cloud',
];

// ── POS names EN → RU short ───────────────────────────────────────────────────
const POS_RU: Record<string, string> = {
  noun: 'сущ.', verb: 'гл.', adjective: 'прил.', adverb: 'нар.',
  pronoun: 'мест.', preposition: 'пред.', conjunction: 'союз',
  interjection: 'межд.', numeral: 'числ.', particle: 'части.',
};
function posRu(en: string): string {
  return POS_RU[en.toLowerCase()] ?? en;
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_PREFIX = 'ltx2-word-';

function readCache(key: string): WordInfo | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCache(key: string, val: WordInfo) {
  try { sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(val)); } catch {}
}

// ── Lingva lookup ─────────────────────────────────────────────────────────────
async function fromLingva(word: string): Promise<WordInfo | null> {
  for (const mirror of LINGVA_MIRRORS) {
    try {
      const url = `${mirror}/api/v1/en/ru/${encodeURIComponent(word)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const json = await res.json();

      const translation: string = json?.translation ?? '';
      if (!translation) continue;

      const phonetic: string | undefined =
        json?.info?.pronunciation?.query || undefined;

      const groups: RuGroup[] = [];
      const rawGroups: any[] = json?.info?.translations ?? [];
      for (const g of rawGroups) {
        const pos = posRu(g.type ?? '');
        const words: string[] = (g.list as any[])
          .map((item: any) => (item.word as string).trim())
          .filter(Boolean)
          .slice(0, 5);
        if (words.length) groups.push({ pos, words });
      }

      return { word, phonetic, translation, groups };
    } catch { continue; }
  }
  return null;
}

// ── MyMemory fallback ─────────────────────────────────────────────────────────
function isGarbage(s: string): boolean {
  if (!s) return true;
  if (/https?:\/\//.test(s)) return true;
  if (/^[a-z]{2,}\.[a-z]{2,}/.test(s) && !/[а-яёА-ЯЁ]/.test(s)) return true;
  if (s.length > 100) return true;
  return false;
}

async function fromMyMemory(word: string): Promise<WordInfo | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ru`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.responseStatus !== 200) return null;

    const raw: string = json?.responseData?.translatedText ?? '';
    if (isGarbage(raw) || raw.toLowerCase().includes('mymemory warning')) return null;

    // Collect alternatives from matches
    const matches: any[] = json?.matches ?? [];
    const alts: string[] = matches
      .filter(m => (m.match ?? 0) >= 0.75 && !isGarbage(m.translation))
      .map(m => (m.translation as string).trim())
      .filter(t => t && t !== raw)
      .slice(0, 4);

    const groups: RuGroup[] = alts.length
      ? [{ pos: 'др.', words: alts }]
      : [];

    return { word, translation: raw.trim(), groups };
  } catch { return null; }
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function lookupWord(word: string): Promise<WordInfo> {
  const key = word.toLowerCase().trim();
  const empty: WordInfo = { word: key, translation: '', groups: [] };
  if (!key || key.length < 2) return empty;

  const cached = readCache(key);
  if (cached) return cached;

  const result =
    (await fromLingva(key)) ??
    (await fromMyMemory(key)) ??
    empty;

  if (result.translation) writeCache(key, result);
  return result;
}

/** Translate a full sentence to Russian */
export async function translateSentence(text: string): Promise<string> {
  // Try Lingva first (sentence translation)
  for (const mirror of LINGVA_MIRRORS) {
    try {
      const url = `${mirror}/api/v1/en/ru/${encodeURIComponent(text)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const json = await res.json();
        const t: string = json?.translation ?? '';
        if (t) return t;
      }
    } catch { continue; }
  }

  // Fallback: MyMemory
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ru`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('translate failed');
  const json = await res.json();
  const raw: string = json?.responseData?.translatedText ?? '';
  if (!raw || json?.responseStatus !== 200 || raw.toLowerCase().includes('mymemory warning'))
    throw new Error('no result');
  return raw;
}
