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
    {
      id: 'flashcards',
      name: 'Карточки',
      desc: 'Переворачивайте карточки: английский — на лицевой стороне, русский — на обратной',
      icon: Layers,
      minWords: 1,
    },
    {
      id: 'choose',
      name: 'Выбор перевода',
      desc: 'Выберите правильный перевод из четырёх вариантов',
      icon: TextSelect,
      minWords: 4,
    },
    {
      id: 'anagram',
      name: 'Собери слово',
      desc: 'Нажимайте на буквы, чтобы составить английское слово',
      icon: Shuffle,
      minWords: 1,
    },
    {
      id: 'write-ru',
      name: 'Пишем по-русски',
      desc: 'Видите английское слово — напишите перевод на русском',
      icon: PenTool,
      minWords: 1,
    },
    {
      id: 'write-en',
      name: 'Пишем по-английски',
      desc: 'Видите русский перевод — напишите слово по-английски',
      icon: Languages,
      minWords: 1,
    },
    {
      id: 'tf',
      name: 'Верно или нет',
      desc: 'Правильный ли перевод показан для слова?',
      icon: CheckSquare,
      minWords: 2,
    },
    {
      id: 'hard',
      name: 'Сложные слова',
      desc: 'Повторите слова, в которых раньше делали ошибки',
      icon: BrainCircuit,
      minWords: 1,
    },
  ];

  if (loading) return <div className="p-10 text-center text-muted-foreground">Загрузка…</div>;

  if (activeMode) {
    return <TrainingSession mode={activeMode} words={words} onFinish={() => setActiveMode(null)} />;
  }

  // Склонение слов
  const wordCount = words.length;
  const wordForm = wordCount === 1 ? 'слово' : wordCount >= 2 && wordCount <= 4 ? 'слова' : 'слов';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-serif font-bold text-foreground">Тренировка</h1>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          {wordCount} {wordForm} в словаре. Выберите режим тренировки.
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
                  {isHard ? 'Пока нет ошибок' : `Нужно ${mode.minWords} ${mode.minWords === 1 ? 'слово' : 'слова'}`}
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

  const [flipped, setFlipped] = useState(false);

  const [inputVal, setInputVal] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [choiceOptions, setChoiceOptions] = useState<string[]>([]);
  const [choicePicked, setChoicePicked] = useState<string | null>(null);

  const [anagramTiles, setAnagramTiles] = useState<{ letter: string; id: number; used: boolean }[]>([]);
  const [anagramAnswer, setAnagramAnswer] = useState<{ letter: string; id: number }[]>([]);

  const [tfShown, setTfShown] = useState('');
  const [tfCorrect, setTfCorrect] = useState(false);

  useEffect(() => {
    let pool = [...words];
    if (mode === 'hard') pool = pool.filter(w => w.errorCount > 0);
    pool.sort(() => Math.random() - 0.5);
    setSessionWords(pool.slice(0, 10));
  }, []);

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
      <p className="text-muted-foreground">Подготовка сессии…</p>
    </div>
  );

  if (finished) return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
        <Award size={48} />
      </div>
      <h2 className="text-3xl font-serif font-bold mb-2">Сессия завершена!</h2>
      <p className="text-xl text-muted-foreground mb-8">
        {correctCount} из {sessionWords.length} правильно
      </p>
      <button onClick={onFinish}
        className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105">
        К режимам
      </button>
    </motion.div>
  );

  const currentWord = sessionWords[currentIndex];
  const feedbackBg = feedback === 'correct' ? 'bg-green-500/10 border-green-400' : feedback === 'incorrect' ? 'bg-destructive/10 border-destructive/40' : '';

  const renderMode = () => {
    switch (mode) {
      // ── КАРТОЧКИ ──────────────────────────────────────────────────────────
      case 'flashcards':
      case 'hard':
        return (
          <div className="flex flex-col items-center w-full max-w-sm mx-auto">
            <div className="w-full aspect-[4/3] relative cursor-pointer mb-8" onClick={() => !flipped && setFlipped(true)}>
              <motion.div
                className="w-full h-full absolute inset-0 bg-card border-2 border-border rounded-3xl flex flex-col items-center justify-center shadow-md text-center p-6"
                animate={{ rotateY: flipped ? 90 : 0, opacity: flipped ? 0 : 1 }}
                transition={{ duration: 0.2 }}
              >
                <h3 className="text-3xl font-bold">{currentWord.word}</h3>
                <p className="mt-6 text-sm text-muted-foreground">Нажмите, чтобы перевернуть</p>
              </motion.div>
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
                    Ещё учу
                  </button>
                  <button onClick={() => advance(true)}
                    className="flex-1 py-4 rounded-2xl bg-green-100 text-green-700 font-bold border border-green-200 hover:bg-green-500 hover:text-white transition-colors">
                    Знаю!
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );

      // ── ВЫБОР ПЕРЕВОДА ─────────────────────────────────────────────────────
      case 'choose':
        return (
          <div className="w-full max-w-md mx-auto text-center">
            <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wide">Выберите перевод</p>
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
                  <button key={i} disabled={!!choicePicked}
                    onClick={() => { setChoicePicked(opt); setTimeout(() => advance(isCorrect), 700); }}
                    className={`py-4 px-3 rounded-2xl border-2 text-sm font-medium transition-all ${cls}`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        );

      // ── АНАГРАММА ──────────────────────────────────────────────────────────
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
            <p className="text-sm text-muted-foreground mb-2 uppercase tracking-wide">Составьте слово по-английски</p>
            <h3 className="text-3xl font-serif font-bold mb-8">{currentWord.translation}</h3>
            <div className="min-h-14 mb-6 flex items-center justify-center gap-1 flex-wrap">
              {anagramAnswer.length === 0 ? (
                <span className="text-muted-foreground text-sm">Нажимайте на буквы ниже…</span>
              ) : (
                anagramAnswer.map((a, i) => (
                  <span key={i}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl text-lg font-bold border-2 ${feedback === 'correct' ? 'border-green-400 bg-green-50 text-green-700' : feedback === 'incorrect' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-primary bg-primary/10 text-primary'}`}>
                    {a.letter}
                  </span>
                ))
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {anagramTiles.map(tile => (
                <button key={tile.id} onClick={() => handleTileClick(tile)} disabled={tile.used || !!feedback}
                  className={`w-11 h-11 rounded-xl text-lg font-bold border-2 transition-all ${tile.used ? 'border-border bg-muted/30 text-muted-foreground/30 cursor-not-allowed' : 'border-border bg-card hover:border-primary hover:bg-primary/10 text-foreground shadow-sm active:scale-95'}`}>
                  {tile.letter}
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={handleUndo} disabled={anagramAnswer.length === 0 || !!feedback}
                className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors disabled:opacity-40">
                <RotateCcw size={16} />
              </button>
              <button onClick={handleSubmitAnagram} disabled={!allUsed || !!feedback}
                className="px-6 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-40">
                Проверить
              </button>
            </div>
          </div>
        );
      }

      // ── НАПИСАТЬ ──────────────────────────────────────────────────────────
      case 'write-ru':
      case 'write-en': {
        const isEn = mode === 'write-en';
        const target = isEn ? currentWord.word : currentWord.translation;
        const prompt = isEn ? currentWord.translation : currentWord.word;
        return (
          <div className="w-full max-w-md mx-auto text-center">
            <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wide">
              {isEn ? 'Напишите по-английски' : 'Напишите по-русски'}
            </p>
            <h3 className="text-4xl font-bold mb-10">{prompt}</h3>
            <form onSubmit={e => { e.preventDefault(); if (!feedback) advance(inputVal.trim().toLowerCase() === target.toLowerCase()); }}>
              <input
                ref={inputRef} value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder={isEn ? 'Введите английское слово…' : 'Введите перевод на русском…'}
                disabled={!!feedback}
                className={`w-full text-center text-2xl p-4 border-b-2 bg-transparent outline-none transition-colors ${feedback === 'correct' ? 'border-green-500 text-green-600' : feedback === 'incorrect' ? 'border-destructive text-destructive' : 'border-primary text-foreground'}`}
              />
              <button type="submit" className="hidden" />
            </form>
            <AnimatePresence>
              {feedback === 'incorrect' && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-destructive font-medium">
                  Правильный ответ: <strong>{target}</strong>
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        );
      }

      // ── ВЕРНО / НЕТ ───────────────────────────────────────────────────────
      case 'tf':
        return (
          <div className="w-full max-w-sm mx-auto text-center">
            <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wide">Перевод верный?</p>
            <div className={`rounded-3xl p-8 border-2 mb-8 transition-colors ${feedbackBg || 'border-border bg-card'}`}>
              <h3 className="text-3xl font-bold mb-4">{currentWord.word}</h3>
              <div className="w-12 h-0.5 bg-muted mx-auto mb-4" />
              <p className="text-2xl font-serif">{tfShown}</p>
            </div>
            <div className="flex gap-4">
              <button disabled={!!feedback} onClick={() => advance(!tfCorrect)}
                className="flex-1 py-4 rounded-2xl border-2 border-destructive/30 bg-destructive/5 text-destructive font-bold hover:bg-destructive hover:text-white transition-colors disabled:opacity-50">
                ✗ Нет
              </button>
              <button disabled={!!feedback} onClick={() => advance(tfCorrect)}
                className="flex-1 py-4 rounded-2xl border-2 border-green-300 bg-green-50 text-green-700 font-bold hover:bg-green-500 hover:text-white transition-colors disabled:opacity-50">
                ✓ Да
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
      <div className="flex items-center justify-between px-6 pt-6 pb-2 shrink-0">
        <button onClick={onFinish} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Выйти
        </button>
        <div className="text-sm font-medium text-muted-foreground">
          {currentIndex + 1} / {sessionWords.length}
        </div>
      </div>

      <div className="h-1.5 bg-muted mx-6 rounded-full overflow-hidden mb-4">
        <motion.div className="h-full bg-primary rounded-full"
          animate={{ width: `${(currentIndex / sessionWords.length) * 100}%` }}
          transition={{ duration: 0.4 }} />
      </div>

      <AnimatePresence>
        {feedback && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`mx-6 mb-4 py-2 rounded-xl text-center text-sm font-bold ${feedback === 'correct' ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
            {feedback === 'correct' ? '✓ Верно!' : '✗ Неверно'}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex items-center justify-center p-6">
        <AnimatePresence mode="wait">
          <motion.div key={currentIndex}
            initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }} className="w-full">
            {renderMode()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
