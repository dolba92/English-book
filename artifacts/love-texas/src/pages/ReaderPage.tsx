import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'wouter';
import { Book, getBook, getProgress, saveProgress, addWordToDictionary } from '@/lib/storage';
import { paginateBook } from '@/lib/paginator';
import { useReaderSettings } from '@/contexts/ReaderSettingsContext';
import { getFontCss } from '@/lib/fonts';
import { ArrowLeft, ChevronLeft, ChevronRight, Settings, X, Plus, Loader2 } from 'lucide-react';
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

interface PageData {
  title: string;
  paragraphs: string[];
  isChapterStart: boolean;
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
  const translateAbortRef = useRef<AbortController | null>(null);

  // Sentence translation panel
  const [selectedSentence, setSelectedSentence] = useState<string | null>(null);
  const [sentenceTranslation, setSentenceTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

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

  const handleNext = useCallback(() => { if (currentPageIdx < pages.length - 1) setCurrentPageIdx(p => p + 1); }, [currentPageIdx, pages.length]);
  const handlePrev = useCallback(() => { if (currentPageIdx > 0) setCurrentPageIdx(p => p - 1); }, [currentPageIdx]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') handleNext(); if (e.key === 'ArrowLeft') handlePrev(); };
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
      // Show tooltip immediately with loading state
      const entry = lookupWord(word);
      if (entry) {
        setHoveredWord({ word, x: rect.left + rect.width / 2, y: rect.top - 10, translation: entry.t, pos: entry.pos, translating: false });
        return;
      }
      // Unknown word — show loading, then translate
      setHoveredWord({ word, x: rect.left + rect.width / 2, y: rect.top - 10, translation: null, pos: '', translating: true });
      translateAbortRef.current?.abort();
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
  const handleParagraphClick = async (text: string) => {
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
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-full hover:bg-muted">
            <ArrowLeft size={20} />
          </Link>
          <div className="hidden md:block">
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
        {/* Reader */}
        <main className={`flex-1 relative flex items-center justify-center overflow-hidden transition-all duration-300 ${selectedSentence ? 'mr-[360px]' : ''}`}>
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
                className="space-y-6"
                style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, fontFamily: fontCss }}
              >
                {/* Chapter title only on first page of each chapter */}
                {page.isChapterStart && (
                  <h2 className="font-serif text-center font-bold mb-8 text-primary/60 text-[1.1em]">
                    {page.title}
                  </h2>
                )}

                {page.paragraphs.map((para, i) => (
                  <p
                    key={i}
                    className="text-foreground/90 text-justify cursor-pointer rounded-lg px-2 -mx-2 hover:bg-primary/5 transition-colors"
                    title="Click to translate paragraph"
                    onClick={() => handleParagraphClick(para)}
                  >
                    {para.split(/(\s+)/).map((token, wi) => {
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
                  </p>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Sentence translation panel */}
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
                <button onClick={() => { setSelectedSentence(null); setSentenceTranslation(null); }}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground">
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

      <footer className="h-8 shrink-0 flex items-center justify-center text-xs text-muted-foreground border-t border-border/30">
        Page {currentPageIdx + 1} of {pages.length}
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
