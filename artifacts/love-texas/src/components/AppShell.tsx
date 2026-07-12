import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { BookOpen, BookMarked, Brain, BarChart2, Settings, Heart } from 'lucide-react';
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
    { href: '/', label: 'Library', icon: BookOpen },
    { href: '/dictionary', label: 'Dictionary', icon: BookMarked },
    { href: '/learn', label: 'Learn', icon: Brain },
    { href: '/stats', label: 'Statistics', icon: BarChart2 },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  if (!mounted) return null;

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background transition-colors duration-300">
      <nav className="md:w-64 bg-sidebar border-r border-sidebar-border flex flex-col p-4 md:sticky md:top-0 md:h-[100dvh] z-10 shrink-0">
        <div className="flex items-center gap-2 px-2 py-4 mb-6">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
            <Heart size={18} fill="currentColor" />
          </div>
          <span className="font-serif font-bold text-xl tracking-tight text-foreground hidden md:block">Love Texas</span>
        </div>
        
        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible no-scrollbar pb-2 md:pb-0">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} data-testid={`nav-${item.label.toLowerCase()}`}>
                <item.icon size={20} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                <span className="hidden md:block">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      
      <main className="flex-1 w-full min-h-full max-w-full overflow-x-hidden relative">
        {children}
      </main>
    </div>
  );
}
