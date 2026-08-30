import React, { useEffect, useState } from 'react';
import { DictionaryWord, getDictionaryWords, removeDictionaryWord, clearDictionary } from '@/lib/storage';
import { Search, Trash2, Volume2, BookX, ArrowDownAZ, Library } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { speak } from '@/lib/speech';

export function DictionaryPage() {
  const [words, setWords] = useState<DictionaryWord[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadWords = async () => {
    try {
      const data = await getDictionaryWords();
      setWords(data);
      setError('');
    } catch {
      setError('Не удалось открыть словарь.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWords();
  }, []);

  const handleDelete = async (id: number) => {
    await removeDictionaryWord(id);
    setWords(w => w.filter(word => word.id !== id));
  };

  const filteredWords = words
    .filter(w => w.word.includes(search.toLowerCase()) || w.translation.includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'newest') return b.dateAdded - a.dateAdded;
      if (sort === 'oldest') return a.dateAdded - b.dateAdded;
      if (sort === 'az') return a.word.localeCompare(b.word);
      return b.word.localeCompare(a.word);
    });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-10 max-w-7xl mx-auto min-h-screen flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-[.2em] mb-3"><Library size={15} /> Собранное из книг</div>
          <h1 data-testid="text-dictionary-title" className="font-editorial text-5xl font-semibold tracking-[-.04em] text-foreground">Словарь</h1>
          <p data-testid="text-dictionary-count" className="text-muted-foreground mt-2">
             {words.length} {words.length === 1 ? 'слово' : 'слов'} сохранено во время чтения
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
               data-testid="input-dictionary-search"
              type="text" 
               placeholder="Найти слово или перевод" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-full border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-64 transition-all"
            />
          </div>
             <select data-testid="select-dictionary-sort"
            value={sort} 
            onChange={(e) => setSort(e.target.value as any)}
            className="px-4 py-2 rounded-full border border-border bg-card focus:outline-none text-sm appearance-none pr-8 cursor-pointer"
          >
             <option value="newest">Сначала новые</option>
             <option value="oldest">Сначала старые</option>
             <option value="az">От А до Я</option>
             <option value="za">От Я до А</option>
          </select>
        </div>
      </div>

      {error ? (
        <div data-testid="status-dictionary-error" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">{error}</div>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
           {[1,2,3,4,5,6].map(i => <div key={i} className="h-32 bg-muted rounded-2xl animate-pulse"></div>)}
        </div>
      ) : words.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto py-20">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6">
            <BookX size={48} />
          </div>
           <h2 data-testid="text-dictionary-empty" className="text-3xl font-editorial font-semibold mb-3 text-foreground">Пока ни одного слова</h2>
          <p className="text-muted-foreground mb-8">
             Откройте книгу и наведите курсор на незнакомое слово — его можно сохранить одним нажатием.
          </p>
        </div>
      ) : filteredWords.length === 0 ? (
         <div data-testid="status-dictionary-no-results" className="py-20 text-center text-muted-foreground"><ArrowDownAZ className="mx-auto mb-3 text-primary" size={28} />Ничего не нашлось. Попробуйте другой запрос.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {filteredWords.map((word) => (
              <motion.div
                layout
                key={word.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                 data-testid={`card-dictionary-word-${word.id}`}
                 className="bg-card/85 border border-card-border rounded-2xl p-5 shadow-[0_8px_18px_rgba(57,35,26,.06)] hover:shadow-[0_12px_24px_rgba(57,35,26,.12)] transition-all group flex flex-col"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-xl font-bold text-foreground capitalize">{word.word}</h3>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button data-testid={`button-speak-word-${word.id}`}
                       aria-label={`Произнести ${word.word}`}
                      onClick={() => speak(word.word)}
                      className="p-1.5 text-muted-foreground hover:text-primary bg-muted rounded-full"
                    >
                      <Volume2 size={16} />
                    </button>
                     <button data-testid={`button-delete-word-${word.id}`}
                       aria-label={`Удалить ${word.word}`}
                      onClick={() => word.id && handleDelete(word.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive bg-muted rounded-full"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                {word.transcription && <p className="text-sm text-primary mb-2 font-medium">{word.transcription}</p>}
                
                <p className="text-foreground flex-1 font-serif">{word.translation}</p>
                
                <div className="flex justify-between items-center mt-4 pt-4 border-t border-border/50">
                   <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded-md">{word.partOfSpeech || 'слово'}</span>
                   <span data-testid={`text-word-date-${word.id}`} className="text-xs text-muted-foreground">{new Date(word.dateAdded).toLocaleDateString('ru-RU')}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
