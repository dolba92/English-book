import React, { useState, useEffect, useRef } from 'react';
import { getDictionaryWords, DictionaryWord, updateStats } from '@/lib/storage';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Languages, Shuffle, PenTool, TextSelect, CheckSquare, Layers, Award, RotateCcw } from 'lucide-react';

type TrainingMode = 'flashcards' | 'choose' | 'anagram' | 'write-ru' | 'write-en' | 'tf' | 'hard';

export function LearnPage() {
  const [words, setWords] = useState<DictionaryWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMode, setActiveMode] = useState<TrainingMode | null>(null);

  useEffect(() => {
    getDictionaryWords().then(w => { setWords(w); setLoading(false); });
  }, []);

  const modes = [
    { id: 'flashcards', name: 'Flashcards', desc: 'Flip cards — English front, Russian back', icon: Layers, minWords: 1 },
    { id: 'choose', name: 'Choose Translation', desc: 'Pick the correct Russian from 4 options', icon: TextSelect, minWords: 4 },
    { id: 'anagram', name: 'Word Builder', desc: 'Tap letters to spell the English word', icon: Shuffle, minWords: 1 },
    { id: 'write-ru', name: 'Type in Russian', desc: 'See English — type Russian translation', icon: PenTool, minWords: 1 },
    { id: 'write-en', name: 'Type in English', desc: 'See Russian — type the English word', icon: Languages, minWords: 1 },
    { id: 'tf', name: 'True or False', desc: 'Is the translation correct?', icon: CheckSquare, minWords: 2 },
    { id: 'hard', name: 'Hard Words', desc: 'Review words you got wrong before', icon: BrainCircuit, minWords: 1 },
  ];

  if (loading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;

  if (activeMode) {
    return <TrainingSession mode={activeMode} words={words} onFinish={() => setActiveMode(null)} />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-serif font-bold text-foreground">Train Vocabulary</h1>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          {words.length} {words.length === 1 ? 'word' : 'words'} in your dictionary. Choose a mode below.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modes.map(mode => {
          const isHard = mode.id === 'hard';
          const hardWords = words.filter(w => w.errorCount > 0);
          const isLocked = words.length < mode.minWords || (isHard && hardWords.length === 0);
          return (
            <motion.div
              key={mode.id}
              whileHover={!isLocked ? { scale: 1.02, y: -2 } : {}}
              onClick={() => !isLocked && setActiveMode(mode.id as TrainingMode)}
              className={`p-6 rounded-3xl border-2 transition-all ${isLocked ? 'bg-muted/50 border-transparent opacity-50 cursor-not-allowed' : 'bg-card border-border hover:border-primary/50 cursor-pointer shadow-sm hover:shadow-md'}`}
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
                <mode.icon size={24} />
              </div>
              <h3 className="font-bold text-lg mb-1">{mode.name}</h3>
              <p className="text-sm text-muted-foreground mb-3">{mode.desc}</p>
              {isLocked && (
                <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-1 rounded-md">
                  {isHard ? 'No mistakes yet' : `Need ${mode.minWords} words`}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Training Session ────────────────────────────────────────────────────────

function TrainingSession({ mode, words, onFinish }: { mode: TrainingMode; words: DictionaryWord[]; onFinish: () => void }) {
  const [sessionWords, setSessionWords] = useState<DictionaryWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  // Flashcard
  const [flipped, setFlipped] = useState(false);

  // Write modes
  const [inputVal, setInputVal] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Choose mode — 4 options
  const [choiceOptions, setChoiceOptions] = useState<string[]>([]);
  const [choicePicked, setChoicePicked] = useState<string | null>(null);

  // Anagram mode
  const [anagramTiles, setAnagramTiles] = useState<{ letter: string; id: number; used: boolean }[]>([]);
  const [anagramAnswer, setAnagramAnswer] = useState<{ letter: string; id: number }[]>([]);

  // True / False
  const [tfShown, setTfShown] = useState('');
  const [tfCorrect, setTfCorrect] = useState(false);

  // Setup pool
  useEffect(() => {
    let pool = [...words];
    if (mode === 'hard') pool = pool.filter(w => w.errorCount > 0);
    pool.sort(() => Math.random() - 0.5);
    setSessionWords(pool.slice(0, 10));
  }, []);

  // Per-word setup (runs when word or sessionWords changes)
  useEffect(() => {
    if (sessionWords.length === 0) return;
    const word = sessionWords[currentIndex];
    if (!word) return;

    setFlipped(false);
    setInputVal('');
    setFeedback(null);
    setChoicePicked(null);
    setAnagramAnswer([]);

    if (mode === 'choose') {
      const correct = word.translation;
      const pool = sessionWords.filter((_, i) => i !== currentIndex).map(w => w.translation);
      const wrong = [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
      // Pad with dummy if not enough words
      while (wrong.length < 3) wrong.push('—');
      setChoiceOptions([correct, ...wrong].sort(() => Math.random() - 0.5));
    }

    if (mode === 'anagram') {
      const tiles = word.word.split('').map((letter, id) => ({ letter, id, used: false }));
      setAnagramTiles([...tiles].sort(() => Math.random() - 0.5));
    }

    if (mode === 'tf') {
      const showCorrect = Math.random() > 0.45;
      setTfCorrect(showCorrect);
      if (showCorrect) {
        setTfShown(word.translation);
      } else {
        const others = sessionWords.filter((_, i) => i !== currentIndex);
        const pick = others[Math.floor(Math.random() * others.length)];
        setTfShown(pick?.translation || word.translation);
      }
    }

    setTimeout(() => inputRef.current?.focus(), 100);
  }, [currentIndex, sessionWords]);

  const advance = (correct: boolean) => {
    setFeedback(correct ? 'correct' : 'incorrect');
    if (correct) setCorrectCount(c => c + 1);
    setTimeout(async () => {
      setFeedback(null);
      if (currentIndex < sessionWords.length - 1) {
        setCurrentIndex(c => c + 1);
      } else {
        await updateStats({ totalTrainingsDone: 1 });
        setFinished(true);
      }
    }, 900);
  };

  if (sessionWords.length === 0) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Preparing session…</p>
    </div>
  );

  if (finished) return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
        <Award size={48} />
      </div>
      <h2 className="text-3xl font-serif font-bold mb-2">Session Complete!</h2>
      <p className="text-xl text-muted-foreground mb-8">
        {correctCount} / {sessionWords.length} correct
      </p>
      <button onClick={onFinish}
        className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105">
        Back to Modes
      </button>
    </motion.div>
  );

  const currentWord = sessionWords[currentIndex];

  // ── Feedback overlay colours ───────────────────────────────────────────────
  const feedbackBg = feedback === 'correct' ? 'bg-green-500/10 border-green-400' : feedback === 'incorrect' ? 'bg-destructive/10 border-destructive/40' : '';

  const renderMode = () => {
    switch (mode) {
      // ── FLASHCARDS ─────────────────────────────────────────────────────────
      case 'flashcards':
      case 'hard':
        return (
          <div className="flex flex-col items-center w-full max-w-sm mx-auto">
            <div className="w-full aspect-[4/3] relative cursor-pointer mb-8" onClick={() => !flipped && setFlipped(true)}>
              {/* Front */}
              <motion.div
                className="w-full h-full absolute inset-0 bg-card border-2 border-border rounded-3xl flex flex-col items-center justify-center shadow-md text-center p-6"
                animate={{ rotateY: flipped ? 90 : 0, opacity: flipped ? 0 : 1 }}
                transition={{ duration: 0.2 }}
              >
                <h3 className="text-3xl font-bold">{currentWord.word}</h3>
                <p className="mt-6 text-sm text-muted-foreground">Tap to flip</p>
              </motion.div>
              {/* Back */}
              <motion.div
                className="w-full h-full absolute inset-0 bg-primary/10 border-2 border-primary/30 rounded-3xl flex flex-col items-center justify-center shadow-md text-center p-6"
                initial={{ opacity: 0, rotateY: -90 }}
                animate={{ rotateY: flipped ? 0 : -90, opacity: flipped ? 1 : 0 }}
                transition={{ duration: 0.2, delay: flipped ? 0.2 : 0 }}
              >
                <h3 className="text-2xl font-serif font-bold">{currentWord.translation}</h3>
              </motion.div>
            </div>

            <AnimatePresence>
              {flipped && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4 w-full">
                  <button onClick={() => advance(false)}
                    className="flex-1 py-4 rounded-2xl bg-destructive/10 text-destructive font-bold border border-destructive/20 hover:bg-destructive hover:text-white transition-colors">
                    Still Learning
                  </button>
                  <button onClick={() => advance(true)}
                    className="flex-1 py-4 rounded-2xl bg-green-100 text-green-700 font-bold border border-green-200 hover:bg-green-500 hover:text-white transition-colors">
                    Know It
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );

      // ── CHOOSE TRANSLATION ────────────────────────────────────────────────
      case 'choose':
        return (
          <div className="w-full max-w-md mx-auto text-center">
            <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wide">Choose the translation</p>
            <h3 className="text-4xl font-bold mb-10">{currentWord.word}</h3>
            <div className="grid grid-cols-2 gap-3">
              {choiceOptions.map((opt, i) => {
                const isCorrect = opt === currentWord.translation;
                const isPicked = opt === choicePicked;
                let cls = 'border-border bg-card hover:border-primary/50 text-foreground';
                if (choicePicked) {
                  if (isCorrect) cls = 'border-green-400 bg-green-50 text-green-800 font-bold';
                  else if (isPicked) cls = 'border-destructive bg-destructive/10 text-destructive';
                  else cls = 'border-border bg-muted/30 text-muted-foreground';
                }
                return (
                  <button
                    key={i}
                    disabled={!!choicePicked}
                    onClick={() => {
                      setChoicePicked(opt);
                      setTimeout(() => advance(isCorrect), 700);
                    }}
                    className={`py-4 px-3 rounded-2xl border-2 text-sm font-medium transition-all ${cls}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        );

      // ── ANAGRAM ───────────────────────────────────────────────────────────
      case 'anagram': {
        const handleTileClick = (tile: { letter: string; id: number; used: boolean }) => {
          if (tile.used || feedback) return;
          setAnagramAnswer(prev => [...prev, { letter: tile.letter, id: tile.id }]);
          setAnagramTiles(prev => prev.map(t => t.id === tile.id ? { ...t, used: true } : t));
        };

        const handleUndo = () => {
          if (anagramAnswer.length === 0 || feedback) return;
          const last = anagramAnswer[anagramAnswer.length - 1];
          setAnagramAnswer(prev => prev.slice(0, -1));
          setAnagramTiles(prev => prev.map(t => t.id === last.id ? { ...t, used: false } : t));
        };

        const handleSubmitAnagram = () => {
          const typed = anagramAnswer.map(a => a.letter).join('');
          advance(typed.toLowerCase() === currentWord.word.toLowerCase());
        };

        const allUsed = anagramTiles.every(t => t.used);

        return (
          <div className="w-full max-w-md mx-auto text-center">
            <p className="text-sm text-muted-foreground mb-2 uppercase tracking-wide">Spell the English word</p>
            <h3 className="text-3xl font-serif font-bold mb-8">{currentWord.translation}</h3>

            {/* Answer area */}
            <div className="min-h-14 mb-6 flex items-center justify-center gap-1 flex-wrap">
              {anagramAnswer.length === 0 ? (
                <span className="text-muted-foreground text-sm">Tap letters below…</span>
              ) : (
                anagramAnswer.map((a, i) => (
                  <span key={i}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl text-lg font-bold border-2 ${feedback === 'correct' ? 'border-green-400 bg-green-50 text-green-700' : feedback === 'incorrect' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-primary bg-primary/10 text-primary'}`}>
                    {a.letter}
                  </span>
                ))
              )}
            </div>

            {/* Letter tiles */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {anagramTiles.map(tile => (
                <button
                  key={tile.id}
                  onClick={() => handleTileClick(tile)}
                  disabled={tile.used || !!feedback}
                  className={`w-11 h-11 rounded-xl text-lg font-bold border-2 transition-all ${tile.used ? 'border-border bg-muted/30 text-muted-foreground/30 cursor-not-allowed' : 'border-border bg-card hover:border-primary hover:bg-primary/10 text-foreground shadow-sm active:scale-95'}`}
                >
                  {tile.letter}
                </button>
              ))}
            </div>

            <div className="flex gap-3 justify-center">
              <button onClick={handleUndo} disabled={anagramAnswer.length === 0 || !!feedback}
                className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors disabled:opacity-40">
                <RotateCcw size={16} />
              </button>
              <button
                onClick={handleSubmitAnagram}
                disabled={!allUsed || !!feedback}
                className="px-6 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                Check
              </button>
            </div>
          </div>
        );
      }

      // ── WRITE MODES ────────────────────────────────────────────────────────
      case 'write-ru':
      case 'write-en': {
        const isEn = mode === 'write-en';
        const target = isEn ? currentWord.word : currentWord.translation;
        const prompt = isEn ? currentWord.translation : currentWord.word;

        return (
          <div className="w-full max-w-md mx-auto text-center">
            <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wide">{isEn ? 'Type in English' : 'Type in Russian'}</p>
            <h3 className="text-4xl font-bold mb-10">{prompt}</h3>
            <form onSubmit={e => { e.preventDefault(); if (!feedback) advance(inputVal.trim().toLowerCase() === target.toLowerCase()); }}>
              <input
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder={isEn ? 'Type English word…' : 'Type Russian translation…'}
                disabled={!!feedback}
                className={`w-full text-center text-2xl p-4 border-b-2 bg-transparent outline-none transition-colors ${feedback === 'correct' ? 'border-green-500 text-green-600' : feedback === 'incorrect' ? 'border-destructive text-destructive' : 'border-primary text-foreground'}`}
              />
              <button type="submit" className="hidden" />
            </form>
            <AnimatePresence>
              {feedback === 'incorrect' && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-destructive font-medium">
                  Correct answer: <strong>{target}</strong>
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        );
      }

      // ── TRUE / FALSE ──────────────────────────────────────────────────────
      case 'tf':
        return (
          <div className="w-full max-w-sm mx-auto text-center">
            <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wide">Is this translation correct?</p>
            <div className={`rounded-3xl p-8 border-2 mb-8 transition-colors ${feedbackBg || 'border-border bg-card'}`}>
              <h3 className="text-3xl font-bold mb-4">{currentWord.word}</h3>
              <div className="w-12 h-0.5 bg-muted mx-auto mb-4" />
              <p className="text-2xl font-serif">{tfShown}</p>
            </div>
            <div className="flex gap-4">
              <button
                disabled={!!feedback}
                onClick={() => advance(!tfCorrect)}
                className="flex-1 py-4 rounded-2xl border-2 border-destructive/30 bg-destructive/5 text-destructive font-bold hover:bg-destructive hover:text-white transition-colors disabled:opacity-50"
              >
                ✗ False
              </button>
              <button
                disabled={!!feedback}
                onClick={() => advance(tfCorrect)}
                className="flex-1 py-4 rounded-2xl border-2 border-green-300 bg-green-50 text-green-700 font-bold hover:bg-green-500 hover:text-white transition-colors disabled:opacity-50"
              >
                ✓ True
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2 shrink-0">
        <button onClick={onFinish} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Exit
        </button>
        <div className="text-sm font-medium text-muted-foreground">
          {currentIndex + 1} / {sessionWords.length}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted mx-6 rounded-full overflow-hidden mb-4">
        <motion.div
          className="h-full bg-primary rounded-full"
          animate={{ width: `${((currentIndex) / sessionWords.length) * 100}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      {/* Feedback banner */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mx-6 mb-4 py-2 rounded-xl text-center text-sm font-bold ${feedback === 'correct' ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'}`}
          >
            {feedback === 'correct' ? '✓ Correct!' : '✗ Wrong'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {renderMode()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
