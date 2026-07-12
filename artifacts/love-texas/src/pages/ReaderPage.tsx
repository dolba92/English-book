import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'wouter';
import { Book, getBook, getProgress, saveProgress, addWordToDictionary } from '@/lib/storage';
import { paginateBook } from '@/lib/paginator';
import { useReaderSettings } from '@/contexts/ReaderSettingsContext';
import { getFontCss } from '@/lib/fonts';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Settings, X, Plus,
  Loader2, List, BookOpen, Languages, Microscope
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { lookupWord } from '@/lib/dictionary';
import { speak } from '@/lib/speech';
import { useToast } from '@/hooks/use-toast';

// ── Google Translate ─────────────────────────────────────────────────────────
async function googleTranslate(text: string, target = 'ru'): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('translate failed');
  const json = await res.json();
  return (json[0] as any[]).map((c: any) => c[0]).join('');
}

// ── Grammar Analyser ─────────────────────────────────────────────────────────
interface GrammarInfo {
  sentenceType: string;
  tense: string;
  voice: string;
  constructions: string[];
  tip: string;
}

function analyzeGrammar(sentence: string): GrammarInfo {
  const s = sentence.toLowerCase().trim();
  const raw = s.replace(/[.,!?;:"'()[\]{}—…«»]/g, ' ');
  const words = raw.split(/\s+/).filter(Boolean);

  // Тип предложения
  const sentenceType = s.endsWith('?') ? 'Вопросительное' : s.endsWith('!') ? 'Восклицательное' : 'Утвердительное';

  // Модальные глаголы
  const modalList = ['can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'need', 'ought'];
  const modals = modalList.filter(m => words.includes(m));

  // Be-глаголы
  const beVerbs = ['am', 'is', 'are', 'was', 'were', 'been', 'being', 'be'];
  const hasBeVerb = beVerbs.some(v => words.includes(v));
  const ingForm = /\b\w+ing\b/.test(raw);
  const edForm = /\b\w+ed\b/.test(raw);
  const irregulars = ['written','spoken','taken','given','known','shown','seen','done','gone','come','run','brought','thought','bought','caught','taught','built','made','said','told','found','heard','left','led','lost','met','read','sent','set','cut','put','let','hit','bid','spread','shed'];
  const hasPP = edForm || irregulars.some(v => words.includes(v));

  // Залог
  const isPassive = hasBeVerb && hasPP && !ingForm;
  const voice = isPassive ? 'Страдательный залог (Passive Voice)' : 'Действительный залог (Active Voice)';

  // Время
  let tense = 'Present Simple';
  const has = (w: string) => words.includes(w);

  if (has('will') || has('shall')) {
    tense = ingForm ? 'Future Continuous' : has('have') || has('has') ? 'Future Perfect' : 'Future Simple';
  } else if ((has('is') || has('am') || has('are')) && ingForm && !isPassive) {
    tense = 'Present Continuous';
  } else if ((has('was') || has('were')) && ingForm && !isPassive) {
    tense = 'Past Continuous';
  } else if (has('had') && hasPP) {
    tense = 'Past Perfect';
  } else if ((has('have') || has('has')) && hasPP) {
    tense = ingForm ? 'Present Perfect Continuous' : 'Present Perfect';
  } else if ((has('was') || has('were')) && isPassive) {
    tense = 'Past Simple (Passive)';
  } else if (has('was') || has('were')) {
    tense = 'Past Simple (to be)';
  } else if (edForm || has('did') || has("didn't") || has('didn\'t')) {
    tense = 'Past Simple';
  } else {
    tense = 'Present Simple';
  }

  // Конструкции
  const constructions: string[] = [];
  if (/\bthere (is|are|was|were)\b/.test(s)) constructions.push('there is/are — оборот существования');
  if (/\bit (is|was|seems|appears)\b/.test(s)) constructions.push('it is — безличный оборот');
  if (/\bif\b/.test(s)) constructions.push('Условное предложение (Conditional)');
  if (/\bbecause\b/.test(s)) constructions.push('Придаточное причины (because)');
  if (/\bwhen\b|\bwhile\b/.test(s)) constructions.push('Придаточное времени (when/while)');
  if (/\b(which|who|whom|whose|that)\b/.test(s)) constructions.push('Определительное придаточное (Relative clause)');
  if (/\bnot\b|n't\b/.test(s)) constructions.push('Отрицание (Negation)');
  if (modals.length > 0) constructions.push(`Модальный глагол: ${modals.join(', ')}`);
  if (/\beither\b|\bneither\b/.test(s)) constructions.push('either/neither — двойное отрицание/выбор');
  if (/\bboth\b/.test(s)) constructions.push('both — оба, двойное утверждение');

  // Подсказка для изучения
  const tips: Record<string, string> = {
    'Present Simple': 'Регулярные действия, факты. Образование: S + V(s) + O.',
    'Present Continuous': 'Действие происходит прямо сейчас. Образование: am/is/are + Ving.',
    'Present Perfect': 'Действие завершено, результат важен сейчас. Образование: have/has + V3.',
    'Past Simple': 'Завершённое действие в прошлом. Образование: V2 (или did + V).',
    'Past Continuous': 'Действие происходило в определённый момент прошлого. Образование: was/were + Ving.',
    'Past Perfect': 'Действие произошло раньше другого прошедшего. Образование: had + V3.',
    'Future Simple': 'Предсказание или спонтанное решение о будущем. Образование: will + V.',
  };
  const tip = tips[tense] || '';

  return { sentenceType, tense, voice, constructions, tip };
}

// ── Sentence splitter ────────────────────────────────────────────────────────
function splitSentences(text: string): string[] {
  const results: string[] = [];
  const re = /[^.!?]*(?:[.!?]+["'»]?\s*)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].trim()) results.push(m[0]);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    const tail = text.slice(lastIndex).trim();
    if (tail) results.push(tail);
  }
  return results.length > 0 ? results : [text];
}

// ── Types ────────────────────────────────────────────────────────────────────
interface PageData {
  title: string;
  paragraphs: string[];
  isChapterStart: boolean;
}
interface TocEntry {
  title: string;
  pageIdx: number;
}

// ── Component ────────────────────────────────────────────────────────────────
export function ReaderPage() {
  const params = useParams();
  const id = parseInt(params.id || '0', 10);
  const { settings } = useReaderSettings();
  const { toast } = useToast();

  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  // Word tooltip
  const [hoveredWord, setHoveredWord] = useState<{
    word: string; x: number; y: number;
    translation: string | null; pos: string; translating: boolean;
  } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Sentence panel (translation + grammar)
  const [selectedSentence, setSelectedSentence] = useState<string | null>(null);
  const [sentenceTranslation, setSentenceTranslation] = useState<string | null>(null);
  const [sentenceGrammar, setSentenceGrammar] = useState<GrammarInfo | null>(null);
  const [translating, setTranslating] = useState(false);
  const [panelTab, setPanelTab] = useState<'translate' | 'grammar'>('translate');

  // TOC panel
  const [showToc, setShowToc] = useState(false);

  // Hint visibility (shown once per session)
  const [showHint, setShowHint] = useState(() => !localStorage.getItem('reader-hint-dismissed'));

  // Page jump
  const [jumpValue, setJumpValue] = useState('');
  const [editingPage, setEditingPage] = useState(false);

  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;

  useEffect(() => {
    const load = async () => {
      const b = await getBook(id);
      if (b) {
        setBook(b);
        const { paginatedChapters } = paginateBook(b.content, 5);
        const flat: PageData[] = [];
        paginatedChapters.forEach(ch => {
          ch.pages.forEach((p, pi) => flat.push({ title: ch.title, paragraphs: p, isChapterStart: pi === 0 }));
        });
        setPages(flat);
        const prog = await getProgress(id);
        if (prog && prog.currentPage < flat.length) setCurrentPageIdx(prog.currentPage);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  useEffect(() => {
    if (!book || pages.length === 0) return;
    const timer = setTimeout(() => {
      const pct = (currentPageIdx / (pages.length - 1 || 1)) * 100;
      saveProgressRef.current({ bookId: id, currentChapterIndex: 0, currentPage: currentPageIdx, totalPagesRead: currentPageIdx, lastReadAt: Date.now(), percentComplete: pct });
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentPageIdx, book, pages.length, id]);

  const tocEntries: TocEntry[] = useMemo(() => {
    const entries: TocEntry[] = [];
    pages.forEach((p, idx) => { if (p.isChapterStart) entries.push({ title: p.title, pageIdx: idx }); });
    return entries;
  }, [pages]);

  const activeChapterIdx = useMemo(() => {
    let active = 0;
    for (let i = 0; i < tocEntries.length; i++) {
      if (tocEntries[i].pageIdx <= currentPageIdx) active = i;
    }
    return active;
  }, [tocEntries, currentPageIdx]);

  const handleNext = useCallback(() => {
    if (currentPageIdx < pages.length - 1) {
      setCurrentPageIdx(p => p + 1);
      setSelectedSentence(null); setSentenceTranslation(null); setSentenceGrammar(null);
    }
  }, [currentPageIdx, pages.length]);

  const handlePrev = useCallback(() => {
    if (currentPageIdx > 0) {
      setCurrentPageIdx(p => p - 1);
      setSelectedSentence(null); setSentenceTranslation(null); setSentenceGrammar(null);
    }
  }, [currentPageIdx]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') handleNext(); if (e.key === 'ArrowLeft') handlePrev(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [handleNext, handlePrev]);

  // ── Word hover ───────────────────────────────────────────────────────────
  const handleWordMouseEnter = (e: React.MouseEvent<HTMLSpanElement>, rawWord: string) => {
    const word = rawWord.trim();
    if (!word) return;
    const rect = e.currentTarget.getBoundingClientRect();
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(async () => {
      const entry = lookupWord(word);
      if (entry) {
        setHoveredWord({ word, x: rect.left + rect.width / 2, y: rect.top - 10, translation: entry.t, pos: entry.pos, translating: false });
        return;
      }
      setHoveredWord({ word, x: rect.left + rect.width / 2, y: rect.top - 10, translation: null, pos: '', translating: true });
      try {
        const result = await googleTranslate(word);
        setHoveredWord(prev => prev?.word === word ? { ...prev, translation: result, translating: false } : prev);
      } catch {
        setHoveredWord(prev => prev?.word === word ? { ...prev, translation: null, translating: false } : prev);
      }
    }, 350);
  };

  const handleWordMouseLeave = () => {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setHoveredWord(null), 250);
  };

  const handleAddWord = async () => {
    if (!hoveredWord || !hoveredWord.translation) return;
    await addWordToDictionary(hoveredWord.word, hoveredWord.translation, undefined, hoveredWord.pos || undefined);
    toast({ title: 'Добавлено в словарь', description: `"${hoveredWord.word}" сохранено.`, duration: 2000 });
    setHoveredWord(null);
  };

  // ── Sentence / period click ──────────────────────────────────────────────
  const handleSentenceClick = async (sentence: string) => {
    const text = sentence.trim();
    if (!text) return;
    setHoveredWord(null);
    setSelectedSentence(text);
    setSentenceTranslation(null);
    setSentenceGrammar(analyzeGrammar(text));
    setPanelTab('translate');
    setTranslating(true);
    if (showHint) { setShowHint(false); localStorage.setItem('reader-hint-dismissed', '1'); }
    try {
      const result = await googleTranslate(text);
      setSentenceTranslation(result);
    } catch {
      setSentenceTranslation('Не удалось получить перевод. Проверьте интернет-соединение.');
    } finally {
      setTranslating(false);
    }
  };

  // ── Page jump ────────────────────────────────────────────────────────────
  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(jumpValue, 10);
    if (!isNaN(n) && n >= 1 && n <= pages.length) {
      setCurrentPageIdx(n - 1);
      setSelectedSentence(null); setSentenceTranslation(null); setSentenceGrammar(null);
    }
    setEditingPage(false); setJumpValue('');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Загрузка…</div>;
  if (!book || pages.length === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground text-lg">В книге нет читаемого текста.</p>
      <Link href="/" className="text-primary underline">← Назад в библиотеку</Link>
    </div>
  );

  const page = pages[currentPageIdx];
  const percent = ((currentPageIdx + 1) / pages.length) * 100;
  const widthClass = settings.pageWidth === 'narrow' ? 'max-w-xl' : settings.pageWidth === 'wide' ? 'max-w-4xl' : 'max-w-2xl';
  const fontCss = getFontCss(settings.fontFamily);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border/40 shrink-0 sticky top-0 bg-background/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-full hover:bg-muted">
            <ArrowLeft size={20} />
          </Link>
          <button
            onClick={() => setShowToc(v => !v)}
            className={`p-2 rounded-full transition-colors ${showToc ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            title="Оглавление"
          >
            <List size={20} />
          </button>
          <div className="hidden md:block ml-1">
            <h1 className="font-bold text-sm leading-tight">{book.title}</h1>
            <p className="text-xs text-muted-foreground">{book.author}</p>
          </div>
        </div>
        <div className="flex-1 max-w-md mx-8 hidden md:flex items-center gap-3">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{Math.round(percent)}%</span>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <Link href="/settings" className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full">
          <Settings size={20} />
        </Link>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* TOC Panel (left) */}
        <AnimatePresence>
          {showToc && (
            <motion.aside key="toc" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed left-0 top-14 bottom-0 w-[280px] bg-card border-r border-border flex flex-col z-30 shadow-xl">
              <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <BookOpen size={15} className="text-primary" /> Оглавление
                </span>
                <button onClick={() => setShowToc(false)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {tocEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Нет глав</p>
                ) : tocEntries.map((entry, i) => (
                  <button key={i} onClick={() => { setCurrentPageIdx(entry.pageIdx); setSelectedSentence(null); setSentenceTranslation(null); setSentenceGrammar(null); setShowToc(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-muted/70 flex items-start gap-3 ${i === activeChapterIdx ? 'text-primary font-semibold bg-primary/5' : 'text-foreground/80'}`}>
                    <span className="text-xs text-muted-foreground mt-0.5 shrink-0 w-5 text-right">{i + 1}</span>
                    <span className="leading-snug">{entry.title || `Глава ${i + 1}`}</span>
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-border shrink-0">
                <p className="text-xs text-muted-foreground mb-2">Перейти на страницу</p>
                <form onSubmit={handleJumpSubmit} className="flex gap-2">
                  <input type="number" min={1} max={pages.length} placeholder={`1 – ${pages.length}`}
                    value={jumpValue} onChange={e => setJumpValue(e.target.value)}
                    className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg font-medium hover:bg-primary/90 transition-colors">→</button>
                </form>
                <p className="text-xs text-muted-foreground mt-2 text-center">Сейчас: {currentPageIdx + 1} / {pages.length}</p>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Reader */}
        <main className={`flex-1 relative flex items-center justify-center overflow-hidden transition-all duration-300 ${selectedSentence ? 'mr-[380px]' : ''} ${showToc ? 'ml-[280px]' : ''}`}>
          <button onClick={handlePrev} className="absolute left-0 top-0 bottom-0 w-[8%] md:w-14 hover:bg-foreground/[0.02] flex items-center justify-center transition-colors text-transparent hover:text-foreground/20 z-10">
            <ChevronLeft size={36} />
          </button>
          <button onClick={handleNext} className="absolute right-0 top-0 bottom-0 w-[8%] md:w-14 hover:bg-foreground/[0.02] flex items-center justify-center transition-colors text-transparent hover:text-foreground/20 z-10">
            <ChevronRight size={36} />
          </button>

          <div className={`w-full ${widthClass} px-8 md:px-12 py-8 max-h-full overflow-y-auto`}>
            {/* One-time hint banner */}
            <AnimatePresence>
              {showHint && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="mb-5 flex items-center gap-3 bg-primary/8 border border-primary/20 rounded-2xl px-4 py-3 text-sm text-foreground/80">
                  <span className="text-base shrink-0">💡</span>
                  <span>Нажмите на <span className="text-primary font-semibold">точку · в конце предложения</span> — получите перевод и разбор грамматики</span>
                  <button onClick={() => { setShowHint(false); localStorage.setItem('reader-hint-dismissed', '1'); }}
                    className="ml-auto shrink-0 p-1 rounded-full hover:bg-primary/15 text-muted-foreground hover:text-foreground transition-colors">
                    <X size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.div key={currentPageIdx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, fontFamily: fontCss }}>
                {page.isChapterStart && page.title && (
                  <h2 className="font-serif text-center font-bold mb-6 text-primary/60 text-[1.1em]">{page.title}</h2>
                )}

                <div className="space-y-2">
                  {page.paragraphs.map((para, pi) => {
                    const sentences = splitSentences(para);
                    return (
                      <p key={pi} className="text-foreground/90 text-justify">
                        {sentences.map((sentence, si) => {
                          // Split sentence into body + trailing punctuation
                          const punctMatch = sentence.match(/^([\s\S]*?)([.!?…]+["'»]?\s*)$/);
                          const body = punctMatch ? punctMatch[1] : sentence;
                          const punct = punctMatch ? punctMatch[2] : '';
                          const isSelected = selectedSentence === sentence.trim();

                          return (
                            <span key={si} className={`rounded transition-colors ${isSelected ? 'bg-primary/10' : ''}`}>
                              {/* Word tokens in the body */}
                              {body.split(/(\s+)/).map((token, wi) => {
                                if (token.trim() === '') return <span key={wi}>{token}</span>;
                                const clean = token.replace(/[.,!?;:"'()[\]{}—…«»]/g, '');
                                return (
                                  <span key={wi}
                                    className="hover:bg-primary/25 rounded px-[1px] transition-colors cursor-default"
                                    onMouseEnter={e => { e.stopPropagation(); handleWordMouseEnter(e, clean); }}
                                    onMouseLeave={handleWordMouseLeave}
                                    onClick={e => e.stopPropagation()}>
                                    {token}
                                  </span>
                                );
                              })}
                              {/* Clickable punctuation dot */}
                              {punct && (
                                <button
                                  onClick={() => handleSentenceClick(sentence)}
                                  title="Нажмите для перевода и разбора предложения"
                                  className={`inline font-bold transition-colors rounded px-[1px] ${isSelected ? 'text-primary' : 'text-primary/50 hover:text-primary'}`}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {punct}
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </p>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Sentence panel (right) — Translation + Grammar */}
        <AnimatePresence>
          {selectedSentence && (
            <motion.aside key="panel" initial={{ x: 380 }} animate={{ x: 0 }} exit={{ x: 380 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed right-0 top-14 bottom-0 w-[380px] bg-card border-l border-border flex flex-col z-30 shadow-xl">

              {/* Panel header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-0 shrink-0">
                <div className="flex gap-1 bg-muted p-1 rounded-xl">
                  <button onClick={() => setPanelTab('translate')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${panelTab === 'translate' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Languages size={14} /> Перевод
                  </button>
                  <button onClick={() => setPanelTab('grammar')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${panelTab === 'grammar' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Microscope size={14} /> Грамматика
                  </button>
                </div>
                <button onClick={() => { setSelectedSentence(null); setSentenceTranslation(null); setSentenceGrammar(null); }}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground ml-2">
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Original sentence (always shown) */}
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wide">Оригинал</p>
                  <p className="text-sm text-foreground/90 leading-relaxed font-serif italic">{selectedSentence}</p>
                </div>

                {/* Tab: Translation */}
                {panelTab === 'translate' && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1.5 uppercase tracking-wide">Перевод</p>
                    {translating
                      ? <div className="flex items-center gap-2 text-muted-foreground text-sm p-3"><Loader2 size={16} className="animate-spin" />Переводим…</div>
                      : <p className="text-sm text-foreground leading-relaxed bg-primary/5 rounded-xl p-3 border border-primary/10">{sentenceTranslation}</p>
                    }
                  </div>
                )}

                {/* Tab: Grammar */}
                {panelTab === 'grammar' && sentenceGrammar && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/60 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground mb-1">Тип предложения</p>
                        <p className="text-sm font-semibold text-foreground">{sentenceGrammar.sentenceType}</p>
                      </div>
                      <div className="bg-muted/60 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground mb-1">Время</p>
                        <p className="text-sm font-semibold text-primary">{sentenceGrammar.tense}</p>
                      </div>
                    </div>
                    <div className="bg-muted/60 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-1">Залог</p>
                      <p className="text-sm font-semibold text-foreground">{sentenceGrammar.voice}</p>
                    </div>
                    {sentenceGrammar.constructions.length > 0 && (
                      <div className="bg-muted/60 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground mb-2">Конструкции</p>
                        <ul className="space-y-1">
                          {sentenceGrammar.constructions.map((c, i) => (
                            <li key={i} className="text-sm text-foreground/85 flex items-start gap-2">
                              <span className="text-primary mt-0.5 shrink-0">•</span>{c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {sentenceGrammar.tip && (
                      <div className="bg-primary/5 border border-primary/15 rounded-xl p-3">
                        <p className="text-xs text-primary font-medium mb-1">📚 {sentenceGrammar.tense}</p>
                        <p className="text-xs text-foreground/80 leading-relaxed">{sentenceGrammar.tip}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="h-9 shrink-0 flex items-center justify-center gap-3 text-xs text-muted-foreground border-t border-border/30">
        <button onClick={handlePrev} disabled={currentPageIdx === 0} className="p-1 hover:text-foreground disabled:opacity-30 transition-colors">
          <ChevronLeft size={14} />
        </button>
        {editingPage ? (
          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1">
            <input autoFocus type="number" min={1} max={pages.length} value={jumpValue}
              onChange={e => setJumpValue(e.target.value)}
              onBlur={() => { setEditingPage(false); setJumpValue(''); }}
              className="w-16 text-center text-xs border border-border rounded px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <span>/ {pages.length}</span>
          </form>
        ) : (
          <button onClick={() => { setEditingPage(true); setJumpValue(String(currentPageIdx + 1)); }}
            className="hover:text-foreground transition-colors hover:bg-muted px-2 py-0.5 rounded" title="Нажмите для перехода на страницу">
            Страница {currentPageIdx + 1} из {pages.length}
          </button>
        )}
        <button onClick={handleNext} disabled={currentPageIdx === pages.length - 1} className="p-1 hover:text-foreground disabled:opacity-30 transition-colors">
          <ChevronRight size={14} />
        </button>
      </footer>

      {/* Word tooltip */}
      <AnimatePresence>
        {hoveredWord && (
          <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.12 }} className="fixed z-50 pointer-events-auto"
            style={{ left: hoveredWord.x, top: hoveredWord.y, transform: 'translate(-50%, -100%)' }}
            onMouseEnter={() => clearTimeout(hoverTimeoutRef.current)}
            onMouseLeave={handleWordMouseLeave}>
            <div className="bg-card border border-border shadow-2xl rounded-2xl p-4 w-60">
              <div className="flex justify-between items-start mb-2 gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold text-lg text-foreground leading-tight truncate">{hoveredWord.word}</h4>
                  {hoveredWord.pos && <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{hoveredWord.pos}</span>}
                </div>
                <button onClick={e => { e.stopPropagation(); speak(hoveredWord.word); }}
                  className="p-1.5 bg-muted text-muted-foreground hover:text-primary rounded-full transition-colors shrink-0 text-base">🔊</button>
              </div>
              {hoveredWord.translating ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-3"><Loader2 size={13} className="animate-spin" />Переводим…</div>
              ) : (
                <p className={`text-sm mb-3 leading-snug ${hoveredWord.translation ? 'text-foreground font-medium' : 'text-muted-foreground italic'}`}>
                  {hoveredWord.translation ?? 'Перевод недоступен'}
                </p>
              )}
              {hoveredWord.translation && !hoveredWord.translating && (
                <button onClick={handleAddWord}
                  className="w-full flex items-center justify-center gap-1.5 bg-primary/10 text-primary font-medium py-2 rounded-xl hover:bg-primary/20 transition-colors text-sm">
                  <Plus size={14} /> В словарь
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
