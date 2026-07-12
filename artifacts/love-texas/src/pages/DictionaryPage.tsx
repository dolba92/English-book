import React, { useEffect, useState } from 'react';
import { DictionaryWord, getDictionaryWords, removeDictionaryWord, clearDictionary } from '@/lib/storage';
import { Search, Trash2, Volume2, BookX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { speak } from '@/lib/speech';

export function DictionaryPage() {
  const [words, setWords] = useState<DictionaryWord[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest');
  const [loading, setLoading] = useState(true);

  const loadWords = async () => {
    try {
      const data = await getDictionaryWords();
      setWords(data);
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
          <h1 className="text-3xl font-serif font-bold text-foreground">Your Dictionary</h1>
          <p className="text-muted-foreground mt-1">
             {words.length} {words.length === 1 ? 'word' : 'words'} saved from your reading
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
              type="text" 
              placeholder="Search words..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-full border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-64 transition-all"
            />
          </div>
          <select 
            value={sort} 
            onChange={(e) => setSort(e.target.value as any)}
            className="px-4 py-2 rounded-full border border-border bg-card focus:outline-none text-sm appearance-none pr-8 cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="az">A to Z</option>
            <option value="za">Z to A</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
           {[1,2,3,4,5,6].map(i => <div key={i} className="h-32 bg-muted rounded-2xl animate-pulse"></div>)}
        </div>
      ) : words.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto py-20">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6">
            <BookX size={48} />
          </div>
          <h2 className="text-2xl font-serif font-bold mb-3 text-foreground">No words yet</h2>
          <p className="text-muted-foreground mb-8">
            Your dictionary is empty. Start reading a book and hover over any word you don't know to save it here.
          </p>
        </div>
      ) : filteredWords.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">No words match your search.</div>
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
                className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group flex flex-col"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-xl font-bold text-foreground capitalize">{word.word}</h3>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => speak(word.word)}
                      className="p-1.5 text-muted-foreground hover:text-primary bg-muted rounded-full"
                    >
                      <Volume2 size={16} />
                    </button>
                    <button 
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
                  <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded-md">{word.partOfSpeech || 'word'}</span>
                  <span className="text-xs text-muted-foreground">{new Date(word.dateAdded).toLocaleDateString()}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
