import React, { useState, useEffect, useRef } from 'react';
import { Book, getAllBooks, getProgress, saveBook, deleteBook } from '@/lib/storage';
import { BookCard } from '@/components/BookCard';
import { parseEpub } from '@/lib/epub-parser';
import { parseFb2 } from '@/lib/fb2-parser';
import { paginateBook } from '@/lib/paginator';
import { Plus, Book as BookIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function LibraryPage() {
  const [books, setBooks] = useState<{ book: Book; progress: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBooks = async () => {
    try {
      const allBooks = await getAllBooks();
      const booksWithProgress = await Promise.all(
        allBooks.map(async (book) => {
          const prog = await getProgress(book.id!);
          return { book, progress: prog?.percentComplete || 0 };
        })
      );
      setBooks(booksWithProgress.sort((a, b) => b.book.addedAt - a.book.addedAt));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBooks();
    const checkSample = async () => {
      const b = await getAllBooks();
      if (b.length === 0) {
        await saveBook({
          title: "The Little Prince (Sample)",
          author: "Antoine de Saint-Exupéry",
          level: "A2",
          fileSizeKb: 10,
          addedAt: Date.now(),
          totalPages: 3,
          content: [
            {
              title: "Chapter 1",
              paragraphs: [
                "Once when I was six years old I saw a magnificent picture in a book, called True Stories from Nature, about the primeval forest. It was a picture of a boa constrictor in the act of swallowing an animal.",
                "In the book it said: \"Boa constrictors swallow their prey whole, without chewing it. After that they are not able to move, and they sleep through the six months that they need for digestion.\"",
                "I pondered deeply, then, over the adventures of the jungle. And after some work with a colored pencil I succeeded in making my first drawing. My Drawing Number One.",
                "I showed my masterpiece to the grown-ups, and asked them whether the drawing frightened them. But they answered: \"Frighten? Why should any one be frightened by a hat?\"",
                "My drawing was not a picture of a hat. It was a picture of a boa constrictor digesting an elephant. But since the grown-ups were not able to understand it, I made another drawing.",
              ]
            },
            {
              title: "Chapter 2",
              paragraphs: [
                "So I lived my life alone, without anyone that I could really talk to, until I had an accident with my plane in the Desert of Sahara, six years ago.",
                "Something was broken in my engine. And as I had with me neither a mechanic nor any passengers, I set myself to attempt the difficult repairs all alone.",
                "It was a question of life or death for me: I had scarcely enough drinking water to last a week.",
                "The first night, then, I went to sleep on the sand, a thousand miles from any human habitation. I was more isolated than a shipwrecked sailor on a raft in the middle of the ocean.",
                "Thus you can imagine my amazement, at sunrise, when I was awakened by an odd little voice. It said: \"If you please — draw me a sheep!\"",
              ]
            }
          ]
        });
        loadBooks();
      }
    };
    checkSample();
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      let parsed;
      if (file.name.endsWith('.epub')) {
        parsed = await parseEpub(file);
      } else if (file.name.endsWith('.fb2')) {
        parsed = await parseFb2(file);
      } else {
        alert("Only EPUB and FB2 files are supported.");
        return;
      }

      const { totalPages } = paginateBook(parsed.chapters, 6);
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1'];
      const randomLevel = levels[Math.floor(Math.random() * levels.length)];

      await saveBook({
        title: parsed.title,
        author: parsed.author,
        coverUrl: parsed.coverUrl,
        level: randomLevel,
        content: parsed.chapters,
        fileSizeKb: Math.round(file.size / 1024),
        addedAt: Date.now(),
        totalPages,
      });

      await loadBooks();
    } catch (err) {
      console.error(err);
      alert("Failed to parse book. The file may be corrupted or unsupported.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    await deleteBook(id);
    await loadBooks();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 md:p-10 max-w-7xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Your Library</h1>
          <p className="text-muted-foreground mt-1">Cozy corner for your English journey</p>
        </div>

        {/* Add Book button */}
        <div className="flex items-center gap-3">
          {uploading && (
            <span className="text-sm text-primary animate-pulse font-medium">Adding to shelf…</span>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full font-medium hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-60"
          >
            <Plus size={18} />
            Add Book
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.fb2"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          />
        </div>
      </div>

      {/* Books grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-2xl bg-muted animate-pulse" style={{ paddingBottom: '160%' }} />
          ))}
        </div>
      ) : books.length > 0 ? (
        <AnimatePresence>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {books.map((item, idx) => (
              <motion.div
                key={item.book.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: idx * 0.04 }}
              >
                <BookCard
                  book={item.book}
                  progress={item.progress}
                  onDelete={handleDelete}
                />
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center text-muted-foreground mb-4">
            <BookIcon size={40} />
          </div>
          <h2 className="text-xl font-medium text-foreground mb-2">Your shelf is empty</h2>
          <p className="text-muted-foreground max-w-sm mb-6">
            Upload an EPUB or FB2 book to start reading and collecting new words.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-medium hover:bg-primary/90 transition-colors shadow"
          >
            <Plus size={18} />
            Add your first book
          </button>
        </div>
      )}
    </motion.div>
  );
}
