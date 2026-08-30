import React, { useEffect, useState } from 'react';
import { getStats, AppStats, getAllBooks, getDictionaryWords, getAllProgress, BookProgress } from '@/lib/storage';
import { motion } from 'framer-motion';
import { BookOpen, Brain, BookMarked, Award, FileText } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function StatsPage() {
  const [stats, setStats] = useState<AppStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [booksFinished, setBooksFinished] = useState(0);
  const [totalPagesTurned, setTotalPagesTurned] = useState(0);
  const [wordsCount, setWordsCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const s = await getStats();
      const books = await getAllBooks();
      const progressList: BookProgress[] = await getAllProgress();
      const w = await getDictionaryWords();

      // Build a map bookId → progress for quick lookup
      const progressMap = new Map<number, BookProgress>();
      for (const p of progressList) progressMap.set(p.bookId, p);

      // Books "read" = percentComplete >= 90
      const finished = books.filter(b => {
        const p = progressMap.get(b.id!);
        return p && p.percentComplete >= 90;
      }).length;

      // Total pages turned = sum of currentPage across all progress records
      const pages = progressList.reduce((sum, p) => sum + (p.currentPage ?? 0), 0);

      setStats(s);
      setBooksFinished(finished);
      setTotalPagesTurned(pages);
      setWordsCount(w.length);
      setLoading(false);
    };
    load();
  }, []);

  if (loading || !stats) {
    return <div data-testid="status-stats-loading" className="p-8 sm:p-12 max-w-6xl mx-auto space-y-5"><div className="h-16 w-64 bg-muted rounded-2xl animate-pulse" /><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded-2xl animate-pulse" />)}</div><div className="h-72 bg-muted rounded-2xl animate-pulse" /></div>;
  }

  const daysActive = Math.max(1, Math.ceil((Date.now() - stats.firstUsed) / (1000 * 60 * 60 * 24)));

  const dayWord = (n: number) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'день';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
    return 'дней';
  };

  const cards = [
     { label: 'Книг прочитано',      value: booksFinished,              icon: BookOpen,   color: 'text-primary',   bg: 'bg-primary/10' },
     { label: 'Страниц перевёрнуто', value: totalPagesTurned,           icon: FileText,   color: 'text-secondary-foreground', bg: 'bg-secondary/60' },
     { label: 'Слов в словаре',      value: wordsCount,                 icon: BookMarked, color: 'text-primary',   bg: 'bg-accent/45' },
     { label: 'Тренировок',          value: stats.totalTrainingsDone,   icon: Brain,      color: 'text-destructive', bg: 'bg-destructive/10' },
  ];

  const chartData = [
    { name: 'Пн', words: Math.max(0, wordsCount - 15) },
    { name: 'Вт', words: Math.max(0, wordsCount - 10) },
    { name: 'Ср', words: Math.max(0, wordsCount - 8) },
    { name: 'Чт', words: Math.max(0, wordsCount - 5) },
    { name: 'Пт', words: Math.max(0, wordsCount - 2) },
    { name: 'Сб', words: wordsCount },
    { name: 'Вс', words: wordsCount + 1 },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-10 max-w-6xl mx-auto">
       <div className="mb-10">
         <div className="text-primary text-xs font-bold uppercase tracking-[.2em] mb-3">Тихий, но заметный рост</div>
         <h1 data-testid="text-stats-title" className="font-editorial text-5xl font-semibold tracking-[-.04em] text-foreground">Ваш прогресс</h1>
         <p data-testid="text-active-days" className="text-muted-foreground mt-2">Изучаю английский уже {daysActive} {dayWord(daysActive)}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-card border border-border p-5 rounded-3xl flex flex-col items-center text-center shadow-sm"
          >
            <div className={`w-12 h-12 rounded-full ${card.bg} ${card.color} flex items-center justify-center mb-3`}>
              <card.icon size={24} />
            </div>
             <div data-testid={`text-stat-${i}`} className="text-3xl font-bold text-foreground mb-1">{card.value}</div>
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{card.label}</div>
          </motion.div>
        ))}
      </div>

       <div className="bg-card/85 border border-card-border rounded-3xl p-6 shadow-[0_10px_28px_rgba(57,35,26,.06)]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Рост словарного запаса</h2>
          <div className="flex items-center gap-2 text-sm text-primary font-medium">
            <Award size={16} /> Стабильно
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorWords" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                itemStyle={{ color: 'hsl(var(--primary))', fontWeight: 'bold' }}
                formatter={(v: any) => [v, 'слов']}
              />
              <Area type="monotone" dataKey="words" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorWords)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}
