import { BookChapter } from './storage';

// In a real e-reader, pagination is dynamic based on container size and font size.
// For this simple implementation, we chunk paragraphs into pages roughly.

export function paginateBook(chapters: BookChapter[], paragraphsPerPage = 6) {
  let totalPages = 0;
  
  const paginatedChapters = chapters.map(chapter => {
    const pages: string[][] = [];
    let currentPage: string[] = [];
    let currentParagraphCount = 0;
    
    // We try to make pages have a certain amount of text roughly
    let currentChars = 0;
    const MAX_CHARS_PER_PAGE = 1200; // rough heuristic

    for (const p of chapter.paragraphs) {
      if (currentChars + p.length > MAX_CHARS_PER_PAGE && currentPage.length > 0) {
         pages.push([...currentPage]);
         currentPage = [];
         currentChars = 0;
         currentParagraphCount = 0;
      }
      
      currentPage.push(p);
      currentChars += p.length;
      currentParagraphCount++;
      
      if (currentParagraphCount >= paragraphsPerPage) {
         pages.push([...currentPage]);
         currentPage = [];
         currentChars = 0;
         currentParagraphCount = 0;
      }
    }
    
    if (currentPage.length > 0) {
      pages.push(currentPage);
    }
    
    // If a chapter is totally empty, give it one empty page
    if (pages.length === 0) {
      pages.push([]);
    }

    totalPages += pages.length;
    
    return {
      title: chapter.title,
      pages
    };
  });
  
  return {
    paginatedChapters,
    totalPages
  };
}
