import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { BookOpen, BookMarked, Brain, BarChart2, Settings, Heart, Sparkles } from 'lucide-react';
import { getTheme, applyTheme } from '@/lib/theme';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = getTheme();
    applyTheme(t);
    setMounted(true);
  }, []);

  const navItems = [
    { href: '/', label: 'Библиотека', shortLabel: 'Книги', icon: BookOpen },
    { href: '/dictionary', label: 'Словарь', shortLabel: 'Слова', icon: BookMarked },
    { href: '/learn', label: 'Тренировка', shortLabel: 'Учить', icon: Brain },
    { href: '/stats', label: 'Прогресс', shortLabel: 'Рост', icon: BarChart2 },
    { href: '/settings', label: 'Настройки', shortLabel: 'Ещё', icon: Settings },
  ];

  if (!mounted) return null;

  return (
    <div className="paper-grain min-h-[100dvh] flex flex-col md:flex-row bg-background transition-colors duration-300">
      <nav className="md:w-[232px] bg-sidebar border-r border-sidebar-border flex md:flex-col px-3 py-3 md:p-4 md:sticky md:top-0 md:h-[100dvh] z-20 shrink-0 shadow-[4px_0_24px_rgba(57,35,26,.06)]">
        <div className="hidden md:flex items-center gap-3 px-2 py-4 mb-7">
          <div className="w-9 h-9 rounded-[11px] bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center shadow-sm">
            <Heart size={18} fill="currentColor" />
          </div>
          <div>
            <span className="font-serif font-bold text-xl tracking-tight text-sidebar-foreground block leading-none">Love Texas</span>
            <span className="text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/55">read a little</span>
          </div>
        </div>
        <div className="flex w-full md:flex-col gap-1.5 overflow-x-auto md:overflow-visible no-scrollbar pb-0">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`group flex min-w-[64px] flex-1 md:flex-none items-center justify-center md:justify-start gap-3 px-2 md:px-3 py-2.5 rounded-xl transition-all duration-200 ${isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`nav-${item.shortLabel.toLowerCase()}`}>
                <item.icon size={18} className="shrink-0" />
                <span className="hidden md:block text-sm">{item.label}</span>
                <span className="md:hidden text-[10px] font-medium">{item.shortLabel}</span>
              </Link>
            );
          })}
        </div>
        <div className="hidden md:block mt-auto rounded-2xl bg-sidebar-accent/70 p-4 text-sidebar-foreground/75">
          <Sparkles size={16} className="text-sidebar-primary mb-2" />
          <p className="font-serif text-sm leading-snug">Пять страниц сегодня — и английский становится ближе.</p>
        </div>
      </nav>
      
      <main className="flex-1 w-full min-h-full max-w-full overflow-x-hidden relative">
        {children}
      </main>
    </div>
  );
}
