import React, { useState } from 'react';
import { useReaderSettings } from '@/contexts/ReaderSettingsContext';
import { applyTheme, getTheme, Theme } from '@/lib/theme';
import { clearAllData, clearDictionary } from '@/lib/storage';
import { FONTS } from '@/lib/fonts';
import { motion } from 'framer-motion';
import { Trash2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function SettingsPage() {
  const { settings, updateSettings } = useReaderSettings();
  const [currentTheme, setCurrentTheme] = useState<Theme>(getTheme());
  const { toast } = useToast();

  const handleThemeChange = (theme: Theme) => {
    applyTheme(theme);
    setCurrentTheme(theme);
  };

  const handleClearDict = async () => {
    if (confirm("Delete all saved words?")) {
      await clearDictionary();
      toast({ title: "Dictionary cleared" });
    }
  };

  const handleClearAll = async () => {
    if (confirm("Delete ALL books, progress and words? This cannot be undone.")) {
      await clearAllData();
      toast({ title: "All data cleared", variant: "destructive" });
      window.location.reload();
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-10 max-w-3xl mx-auto min-h-screen">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Settings</h1>

      <div className="space-y-10">
        {/* Theme */}
        <section>
          <h2 className="text-xl font-bold mb-4">Theme</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { id: 'light', name: 'Light', bg: 'bg-[#faf9f6]', border: 'border-gray-200', text: 'text-gray-900' },
              { id: 'pink', name: 'Love Texas', bg: 'bg-[#fff5f6]', border: 'border-pink-200', text: 'text-pink-950' },
              { id: 'cream', name: 'Cream', bg: 'bg-[#f4ebd8]', border: 'border-[#e6d5b8]', text: 'text-[#4a3f35]' },
            ].map(t => (
              <div
                key={t.id}
                onClick={() => handleThemeChange(t.id as Theme)}
                className={`relative cursor-pointer rounded-2xl p-4 border-2 transition-all ${t.bg} ${t.border} ${currentTheme === t.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:scale-[1.02]'}`}
              >
                <div className="flex justify-between items-center mb-4">
                  <span className={`font-bold ${t.text}`}>{t.name}</span>
                  {currentTheme === t.id && <CheckCircle2 className={t.text} size={20} />}
                </div>
                <div className="space-y-2 opacity-70">
                  <div className={`h-2 rounded-full w-full ${t.text} bg-current`} />
                  <div className={`h-2 rounded-full w-2/3 ${t.text} bg-current`} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Reader Settings */}
        <section className="bg-card border border-border rounded-3xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6">Reading Experience</h2>

          <div className="space-y-6">
            {/* Font size */}
            <div>
              <label className="flex justify-between text-sm font-medium mb-3">
                <span>Font Size</span>
                <span className="text-muted-foreground">{settings.fontSize}px</span>
              </label>
              <input
                type="range" min="12" max="28" step="1"
                value={settings.fontSize}
                onChange={e => updateSettings({ fontSize: parseInt(e.target.value) })}
                className="w-full accent-primary h-2 bg-muted rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Line spacing */}
            <div>
              <label className="flex justify-between text-sm font-medium mb-3">
                <span>Line Spacing</span>
                <span className="text-muted-foreground">{settings.lineHeight}x</span>
              </label>
              <input
                type="range" min="1.4" max="2.4" step="0.1"
                value={settings.lineHeight}
                onChange={e => updateSettings({ lineHeight: parseFloat(e.target.value) })}
                className="w-full accent-primary h-2 bg-muted rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Page width */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Page Width</label>
              <div className="flex bg-muted p-1 rounded-xl">
                {['narrow', 'medium', 'wide'].map(w => (
                  <button
                    key={w}
                    onClick={() => updateSettings({ pageWidth: w as any })}
                    className={`px-4 py-1.5 rounded-lg text-sm capitalize transition-colors ${settings.pageWidth === w ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {/* Font family */}
            <div>
              <label className="text-sm font-medium block mb-3">Font Family</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FONTS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => updateSettings({ fontFamily: f.value })}
                    className={`px-3 py-2.5 rounded-xl text-sm border-2 transition-all text-left ${settings.fontFamily === f.value ? 'border-primary bg-primary/5 font-semibold' : 'border-border bg-muted/30 hover:border-primary/40'}`}
                    style={{ fontFamily: f.css }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Data Management */}
        <section className="bg-destructive/5 border border-destructive/20 rounded-3xl p-6">
          <h2 className="text-xl font-bold mb-4 text-destructive flex items-center gap-2">
            <Trash2 size={20} />
            Data Management
          </h2>
          <p className="text-sm text-muted-foreground mb-6">Manage your local storage. These actions cannot be reversed.</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleClearDict}
              className="bg-card border border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground px-4 py-3 rounded-xl font-medium transition-colors text-left"
            >
              Clear Dictionary
            </button>
            <button
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-3 rounded-xl font-medium transition-colors text-left"
            >
              Delete All Data
            </button>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
