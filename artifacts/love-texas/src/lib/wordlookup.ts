/**
 * Word lookup — Free Dictionary API (English definitions)
 * + MyMemory for Russian translation.
 * Results are cached in sessionStorage for the lifetime of the tab.
 */

export interface WordDefinition {
  definition: string;
  example?: string;
}

export interface WordMeaning {
  partOfSpeech: string;
  definitions: WordDefinition[];
  synonyms?: string[];
}

export interface WordInfo {
  word: string;
  phonetic?: string;
  meanings: WordMeaning[];       // English definitions, grouped by part of speech
  translation?: string;          // Primary Russian translation
  translationAlt?: string[];     // Alternative Russian translations
}

const DICT_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const MYMEMORY_BASE = 'https://api.mymemory.translated.net/get';
const CACHE_PREFIX = 'ltx-word-';

function readCache(key: string): WordInfo | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, val: WordInfo) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(val));
  } catch {}
}

/** Clean up MyMemory response, which can include garbage like "bbs.import|" */
function cleanMyMemoryResult(raw: string): { primary: string; alts: string[] } {
  // Split on | and take non-garbage parts
  const parts = raw
    .split(/[|,;]/)
    .map(p => p.trim())
    .filter(p => {
      if (!p) return false;
      // Filter out garbage: urls, imports, very long parts, code-like strings
      if (/https?:\/\//.test(p)) return false;
      if (/\.\w+\|/.test(p)) return false;
      if (/^[a-z]+\.[a-z]+/.test(p) && p.length > 20) return false; // likely code ref
      if (p.length > 80) return false;
      return true;
    });

  const [primary, ...alts] = parts;
  return { primary: primary || '', alts: alts.slice(0, 3) };
}

export async function lookupWord(word: string): Promise<WordInfo> {
  const key = word.toLowerCase().trim();
  if (!key) return { word: key, meanings: [] };

  const cached = readCache(key);
  if (cached) return cached;

  const result: WordInfo = { word: key, meanings: [] };

  // 1 — Free Dictionary API (definitions, phonetics) — English only, no CORS issues
  try {
    const res = await fetch(`${DICT_BASE}/${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const entry = data[0];
      if (entry) {
        // Phonetic
        result.phonetic =
          entry.phonetic ||
          entry.phonetics?.find((p: any) => p.text)?.text ||
          undefined;

        // Meanings — take up to 3 parts of speech, 2 definitions each
        result.meanings = (entry.meanings as any[])
          .slice(0, 3)
          .map((m: any) => ({
            partOfSpeech: m.partOfSpeech,
            definitions: (m.definitions as any[]).slice(0, 2).map((d: any) => ({
              definition: d.definition,
              example: d.example,
            })),
            synonyms: (m.synonyms as string[])?.slice(0, 4),
          }));
      }
    }
  } catch {
    // Dictionary API failed — not critical
  }

  // 2 — MyMemory for Russian translation
  try {
    const url = `${MYMEMORY_BASE}?q=${encodeURIComponent(key)}&langpair=en|ru&de=anonymous`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const json = await res.json();
      const raw: string = json?.responseData?.translatedText ?? '';
      const status: number = json?.responseStatus ?? 0;

      if (raw && status === 200 && !raw.toLowerCase().includes('mymemory warning')) {
        const { primary, alts } = cleanMyMemoryResult(raw);
        if (primary) {
          result.translation = primary;
          result.translationAlt = alts.filter(a => a !== primary);
        }
      }

      // Also check matches array for alternatives
      const matches: any[] = json?.matches ?? [];
      const extraAlts = matches
        .filter(m => m.segment?.toLowerCase() === key && m.translation && m['match'] >= 0.8)
        .map(m => cleanMyMemoryResult(m.translation).primary)
        .filter(Boolean)
        .filter(t => t !== result.translation)
        .slice(0, 3);

      if (extraAlts.length) {
        result.translationAlt = [...(result.translationAlt ?? []), ...extraAlts].slice(0, 4);
      }
    }
  } catch {
    // Translation failed
  }

  writeCache(key, result);
  return result;
}

/** Translate a full sentence (for sentence panel) */
export async function translateSentence(text: string, from = 'en', to = 'ru'): Promise<string> {
  const url = `${MYMEMORY_BASE}?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('translate failed');
  const json = await res.json();
  const raw: string = json?.responseData?.translatedText ?? '';
  const status: number = json?.responseStatus ?? 0;
  if (!raw || status !== 200 || raw.toLowerCase().includes('mymemory warning')) throw new Error('no result');
  return raw;
}
