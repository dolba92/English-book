import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'wouter';
import { Book, getBook, getProgress, saveProgress, addWordToDictionary } from '@/lib/storage';
import { paginateBook } from '@/lib/paginator';
import { useReaderSettings } from '@/contexts/ReaderSettingsContext';
import { getFontCss } from '@/lib/fonts';
import { ArrowLeft, ChevronLeft, ChevronRight, Settings, X, Plus, Loader2, List, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { lookupWord } from '@/lib/dictionary';
import { speak } from '@/lib/speech';
import { useToast } from '@/hooks/use-toast';

async function googleTranslate(text: string, target = 'ru'): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('translate failed');
  const json = await res.json();
  return (json[0] as any[]).map((c: any) => c[0]).join('');
}

/** Split paragraph text into individual sentences */
function splitSentences(text: string): string[] {
  const results: string[] = [];
  // Match sequences ending with . ! ? (including quotes/ellipsis after)
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

interface PageData {
  title: string;
  paragraphs: string[];
  isChapterStart: boolean;
}

interface TocEntry {
  title: string;
  pageIdx: number;
}

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
    translation: string | null;
    pos: string;
    translating: boolean;
  } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Sentence translation panel
  const [selectedSentence, setSelectedSentence] = useState<string | null>(null);
  const [sentenceTranslation, setSentenceTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  // TOC panel
  const [showToc, setShowToc] = useState(false);

  // Page jump (in footer)
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

  // Build TOC from pages
  const tocEntries: TocEntry[] = useMemo(() => {
    const entries: TocEntry[] = [];
    pages.forEach((p, idx) => {
      if (p.isChapterStart) entries.push({ title: p.title, pageIdx: idx });
    });
    return entries;
  }, [pages]);

  // Which chapter is active
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
      setSelectedSentence(null);
      setSentenceTranslation(null);
    }
  }, [currentPageIdx, pages.length]);

  const handlePrev = useCallback(() => {
    if (currentPageIdx > 0) {
      setCurrentPageIdx(p => p - 1);
      setSelectedSentence(null);
      setSentenceTranslation(null);
    }
  }, [currentPageIdx]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [handleNext, handlePrev]);

  // ── Word hover ──────────────────────────────────────────────────────────────
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
    toast({ title: 'Added to Dictionary', description: `"${hoveredWord.word}" saved.`, duration: 2000 });
    setHoveredWord(null);
  };

  // ── Sentence click ──────────────────────────────────────────────────────────
  const handleSentenceClick = async (sentence: string) => {
    const text = sentence.trim();
    if (!text) return;
    setHoveredWord(null);
    setSelectedSentence(text);
    setSentenceTranslation(null);
    setTranslating(true);
    try {
      const result = await googleTranslate(text);
      setSentenceTranslation(result);
    } catch {
      setSentenceTranslation('Не удалось получить перевод. Проверьте интернет-соединение.');
    } finally {
      setTranslating(false);
    }
  };

  // ── Page jump ───────────────────────────────────────────────────────────────
  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(jumpValue, 10);
    if (!isNaN(n) && n >= 1 && n <= pages.length) {
      setCurrentPageIdx(n - 1);
      setSelectedSentence(null);
      setSentenceTranslation(null);
    }
    setEditingPage(false);
    setJumpValue('');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!book || pages.length === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground text-lg">Book has no readable text.</p>
      <Link href="/" className="text-primary underline">← Back to Library</Link>
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
          {/* TOC button */}
          <button
            onClick={() => setShowToc(v => !v)}
            className={`p-2 rounded-full transition-colors ${showToc ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            title="Table of Contents"
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
            <motion.aside
              key="toc"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed left-0 top-14 bottom-0 w-[300px] bg-card border-r border-border flex flex-col z-30 shadow-xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <BookOpen size={15} className="text-primary" />
                  Оглавление
                </span>
                <button
                  onClick={() => setShowToc(false)}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Chapter list */}
              <div className="flex-1 overflow-y-auto py-2">
                {tocEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Нет глав</p>
                ) : (
                  tocEntries.map((entry, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setCurrentPageIdx(entry.pageIdx);
                        setSelectedSentence(null);
                        setSentenceTranslation(null);
                        setShowToc(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-muted/70 flex items-start gap-3 ${
                        i === activeChapterIdx ? 'text-primary font-semibold bg-primary/5' : 'text-foreground/80'
                      }`}
                    >
                      <span className="text-xs text-muted-foreground mt-0.5 shrink-0 w-5 text-right">{i + 1}</span>
                      <span className="leading-snug">{entry.title || `Chapter ${i + 1}`}</span>
                    </button>
                  ))
                )}
              </div>

              {/* Page jump */}
              <div className="p-4 border-t border-border shrink-0">
                <p className="text-xs text-muted-foreground mb-2">Перейти на страницу</p>
                <form onSubmit={handleJumpSubmit} className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={pages.length}
                    placeholder={`1 – ${pages.length}`}
                    value={jumpValue}
                    onChange={e => setJumpValue(e.target.value)}
                    className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg font-medium hover:bg-primary/90 transition-colors"
                  >
                    →
                  </button>
                </form>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Сейчас: {currentPageIdx + 1} / {pages.length}
                </p>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Reader */}
        <main
          className={`flex-1 relative flex items-center justify-center overflow-hidden transition-all duration-300 ${
            selectedSentence ? 'mr-[360px]' : ''
          } ${showToc ? 'ml-[300px]' : ''}`}
        >
          <button onClick={handlePrev} className="absolute left-0 top-0 bottom-0 w-[8%] md:w-16 hover:bg-foreground/[0.02] flex items-center justify-center transition-colors text-transparent hover:text-foreground/20 z-10">
            <ChevronLeft size={36} />
          </button>
          <button onClick={handleNext} className="absolute right-0 top-0 bottom-0 w-[8%] md:w-16 hover:bg-foreground/[0.02] flex items-center justify-center transition-colors text-transparent hover:text-foreground/20 z-10">
            <ChevronRight size={36} />
          </button>

          <div className={`w-full ${widthClass} px-8 md:px-12 py-10 max-h-full overflow-y-auto`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPageIdx}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, fontFamily: fontCss }}
              >
                {/* Chapter title only on first page of each chapter */}
                {page.isChapterStart && page.title && (
                  <h2 className="font-serif text-center font-bold mb-6 text-primary/60 text-[1.1em]">
                    {page.title}
                  </h2>
                )}

                {/* Paragraphs — split into sentences, each sentence clickable */}
                <div className="space-y-2">
                  {page.paragraphs.map((para, pi) => {
                    const sentences = splitSentences(para);
                    return (
                      <p key={pi} className="text-foreground/90 text-justify">
                        {sentences.map((sentence, si) => (
                          <span
                            key={si}
                            className={`rounded cursor-pointer transition-colors hover:bg-primary/8 ${
                              selectedSentence === sentence.trim() ? 'bg-primary/12' : ''
                            }`}
                            title="Click to translate"
                            onClick={() => handleSentenceClick(sentence)}
                          >
                            {sentence.split(/(\s+)/).map((token, wi) => {
                              if (token.trim() === '') return <span key={wi}>{token}</span>;
                              const clean = token.replace(/[.,!?;:"'()[\]{}—…«»]/g, '');
                              return (
                                <span
                                  key={wi}
                                  className="hover:bg-primary/25 rounded px-[1px] transition-colors cursor-default"
                                  onMouseEnter={e => { e.stopPropagation(); handleWordMouseEnter(e, clean); }}
                                  onMouseLeave={handleWordMouseLeave}
                                  onClick={e => e.stopPropagation()}
                                >
                                  {token}
                                </span>
                              );
                            })}
                          </span>
                        ))}
                      </p>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Sentence translation panel (right) */}
        <AnimatePresence>
          {selectedSentence && (
            <motion.aside
              key="panel"
              initial={{ x: 360 }}
              animate={{ x: 0 }}
              exit={{ x: 360 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed right-0 top-14 bottom-0 w-[360px] bg-card border-l border-border flex flex-col z-30 shadow-xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                <span className="font-semibold text-sm">Перевод предложения</span>
                <button
                  onClick={() => { setSelectedSentence(null); setSentenceTranslation(null); }}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1.5 uppercase tracking-wide">Оригинал</p>
                  <p className="text-sm text-foreground/90 leading-relaxed font-serif italic bg-muted/50 rounded-xl p-3">{selectedSentence}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1.5 uppercase tracking-wide">Перевод</p>
                  {translating
                    ? <div className="flex items-center gap-2 text-muted-foreground text-sm p-3"><Loader2 size={16} className="animate-spin" />Переводим…</div>
                    : <p className="text-sm text-foreground leading-relaxed bg-primary/5 rounded-xl p-3 border border-primary/10">{sentenceTranslation}</p>
                  }
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Footer with page indicator + clickable jump */}
      <footer className="h-9 shrink-0 flex items-center justify-center gap-3 text-xs text-muted-foreground border-t border-border/30">
        <button onClick={handlePrev} disabled={currentPageIdx === 0} className="p-1 hover:text-foreground disabled:opacity-30 transition-colors">
          <ChevronLeft size={14} />
        </button>

        {editingPage ? (
          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1">
            <input
              autoFocus
              type="number"
              min={1}
              max={pages.length}
              value={jumpValue}
              onChange={e => setJumpValue(e.target.value)}
              onBlur={() => { setEditingPage(false); setJumpValue(''); }}
              className="w-16 text-center text-xs border border-border rounded px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <span>/ {pages.length}</span>
          </form>
        ) : (
          <button
            onClick={() => { setEditingPage(true); setJumpValue(String(currentPageIdx + 1)); }}
            className="hover:text-foreground transition-colors hover:bg-muted px-2 py-0.5 rounded"
            title="Click to jump to page"
          >
            Page {currentPageIdx + 1} of {pages.length}
          </button>
        )}

        <button onClick={handleNext} disabled={currentPageIdx === pages.length - 1} className="p-1 hover:text-foreground disabled:opacity-30 transition-colors">
          <ChevronRight size={14} />
        </button>
      </footer>

      {/* Word tooltip */}
      <AnimatePresence>
        {hoveredWord && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="fixed z-50 pointer-events-auto"
            style={{ left: hoveredWord.x, top: hoveredWord.y, transform: 'translate(-50%, -100%)' }}
            onMouseEnter={() => clearTimeout(hoverTimeoutRef.current)}
            onMouseLeave={handleWordMouseLeave}
          >
            <div className="bg-card border border-border shadow-2xl rounded-2xl p-4 w-60">
              <div className="flex justify-between items-start mb-2 gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold text-lg text-foreground leading-tight truncate">{hoveredWord.word}</h4>
                  {hoveredWord.pos && <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{hoveredWord.pos}</span>}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); speak(hoveredWord.word); }}
                  className="p-1.5 bg-muted text-muted-foreground hover:text-primary rounded-full transition-colors shrink-0 text-base"
                >
                  🔊
                </button>
              </div>

              {hoveredWord.translating ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-3">
                  <Loader2 size={13} className="animate-spin" />
                  Translating…
                </div>
              ) : (
                <p className={`text-sm mb-3 leading-snug ${hoveredWord.translation ? 'text-foreground font-medium' : 'text-muted-foreground italic'}`}>
                  {hoveredWord.translation ?? 'Translation unavailable'}
                </p>
              )}

              {hoveredWord.translation && !hoveredWord.translating && (
                <button
                  onClick={handleAddWord}
                  className="w-full flex items-center justify-center gap-1.5 bg-primary/10 text-primary font-medium py-2 rounded-xl hover:bg-primary/20 transition-colors text-sm"
                >
                  <Plus size={14} />
                  Add to Dictionary
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
