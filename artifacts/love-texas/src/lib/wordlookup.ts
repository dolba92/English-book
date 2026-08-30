/**
 * Word lookup — multiple translation backends.
 * Priority: Google Translate (gtx, fast) → Lingva → MyMemory
 */

export interface RuGroup {
  pos: string;          // часть речи: «гл.», «сущ.», «прил.» и т.д.
  words: string[];      // русские варианты перевода
}

export interface WordInfo {
  word: string;
  phonetic?: string;
  translation: string;  // основной перевод
  groups: RuGroup[];    // варианты по частям речи
}

// ── POS names EN → RU short ───────────────────────────────────────────────────
const POS_RU: Record<string, string> = {
  noun: 'существительное', verb: 'глагол', adjective: 'прилагательное', adverb: 'наречие',
  pronoun: 'местоимение', preposition: 'предлог', conjunction: 'союз',
  interjection: 'междометие', numeral: 'числительное', particle: 'частица',
};
function posRu(en: string): string {
  return POS_RU[en.toLowerCase()] ?? en;
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_PREFIX = 'ltx5-word-';

function readCache(key: string): WordInfo | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCache(key: string, val: WordInfo) {
  try { sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(val)); } catch {}
}

// ── Google Translate (gtx client — CORS-friendly, no key needed) ──────────────
async function fromGoogleGtx(word: string): Promise<WordInfo | null> {
  try {
    const url =
      `https://translate.googleapis.com/translate_a/single` +
      `?client=gtx&sl=en&tl=ru&dt=t&dt=bd` +
      `&q=${encodeURIComponent(word)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const json = await res.json();

    // Main translation — result[0] is array of [translated, original, ...]
    const segments: any[] = json?.[0] ?? [];
    const translation: string = segments
      .map((s: any[]) => s?.[0] ?? '')
      .join('')
      .trim();
    if (!translation) return null;

    // Phonetic from romanisation (result[2] when dt=rm is set)
    // Actually gtx puts source romanization in a different place; skip for short words
    // We'll get it from Lingva if needed; for gtx just skip phonetic
    let phonetic: string | undefined = undefined;

    // Dictionary entries — result[1]: [[pos_en, [word_ru, ...], details, original], ...]
    const groups: RuGroup[] = [];
    const bdRaw: any[] = json?.[1] ?? [];
    for (const entry of bdRaw) {
      const posEn: string = entry?.[0] ?? '';
      const pos = posRu(posEn);
      const items: any[] = entry?.[1] ?? [];
      const words: string[] = items
        .map((item: any) => (typeof item === 'string' ? item : item?.[0])?.trim() ?? '')
        .filter(Boolean)
        .filter((item: string) => item.length > 1)
        .slice(0, 10);
      if (words.length) groups.push({ pos, words });
    }

    return { word, phonetic, translation, groups };
  } catch {
    return null;
  }
}

// ── Lingva mirrors ─────────────────────────────────────────────────────────────
const LINGVA_MIRRORS = [
  'https://lingva.ml',
  'https://translate.plausibility.cloud',
];

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
  if (s.length > 120) return true;
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

    return { word, translation: raw.trim(), groups: [] };
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
    (await fromGoogleGtx(key)) ??
    (await fromLingva(key)) ??
    (await fromMyMemory(key)) ??
    empty;

  if (result.translation) writeCache(key, result);
  return result;
}

/** Translate a full sentence to Russian */
export async function translateSentence(text: string): Promise<string> {
  // Try Google gtx first
  try {
    const url =
      `https://translate.googleapis.com/translate_a/single` +
      `?client=gtx&sl=en&tl=ru&dt=t` +
      `&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json();
      const t: string = (json?.[0] ?? [])
        .map((s: any[]) => s?.[0] ?? '')
        .join('')
        .trim();
      if (t) return t;
    }
  } catch { /* fall through */ }

  // Try Lingva mirrors
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
