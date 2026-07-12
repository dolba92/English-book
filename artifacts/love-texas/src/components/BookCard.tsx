import { Book } from '@/lib/storage';
import { Link } from 'wouter';
import { Play, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface BookCardProps {
  book: Book;
  progress?: number;
  onDelete?: (id: number) => void;
}

export function BookCard({ book, progress = 0, onDelete }: BookCardProps) {
  const levelColors: Record<string, string> = {
    A1: 'bg-emerald-100 text-emerald-700',
    A2: 'bg-blue-100 text-blue-700',
    B1: 'bg-amber-100 text-amber-700',
    B2: 'bg-orange-100 text-orange-700',
    C1: 'bg-rose-100 text-rose-700',
  };

  const badgeColor = levelColors[book.level] || levelColors['B1'];
  const titleInitial = book.title.charAt(0).toUpperCase();

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (book.id !== undefined && onDelete) {
      onDelete(book.id);
    }
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group flex flex-col bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-md border border-border/50 transition-shadow"
    >
      {/* Cover */}
      <div className="relative w-full overflow-hidden bg-muted" style={{ paddingBottom: '150%' }}>
        <div className="absolute inset-0">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/30 to-secondary p-4 text-center">
              <span className="font-serif text-6xl font-bold text-primary/60 leading-none">{titleInitial}</span>
              <span className="text-xs font-medium text-muted-foreground mt-3 line-clamp-2">{book.author}</span>
            </div>
          )}

          {/* Level badge */}
          <div className="absolute top-2 right-2">
            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${badgeColor}`}>
              {book.level || 'B1'}
            </span>
          </div>

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Link
              href={`/reader/${book.id}`}
              data-testid={`btn-read-${book.id}`}
              className="w-10 h-10 rounded-full bg-white/90 text-primary flex items-center justify-center shadow hover:scale-110 transition-transform"
            >
              <Play size={18} className="ml-0.5" />
            </Link>
            <button
              onClick={handleDelete}
              data-testid={`btn-delete-${book.id}`}
              className="w-10 h-10 rounded-full bg-white/90 text-destructive flex items-center justify-center shadow hover:scale-110 transition-transform"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1">
        <h3 className="font-bold text-sm text-foreground line-clamp-1" title={book.title}>
          {book.title}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-1">{book.author}</p>

        <div className="mt-2">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
