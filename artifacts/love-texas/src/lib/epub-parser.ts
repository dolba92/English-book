import ePub from 'epubjs';

async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function parseEpub(file: File) {
  return new Promise<{ title: string; author: string; coverUrl?: string; chapters: { title: string; paragraphs: string[] }[] }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const book = ePub(arrayBuffer);

        await book.ready;

        const metadata = await book.loaded.metadata;
        const title = metadata.title || 'Unknown Title';
        const author = (metadata as any).creator || 'Unknown Author';

        // Cover — convert blob URL → persistent data URL
        let coverUrl: string | undefined = undefined;
        try {
          const coverHref = await book.loaded.cover;
          if (coverHref) {
            const blobUrl = await (book as any).archive.createUrl(coverHref, { base64: false });
            coverUrl = await blobUrlToDataUrl(blobUrl);
          }
        } catch {
          // no cover
        }

        // Chapters
        const chapters: { title: string; paragraphs: string[] }[] = [];
        const spine = (book as any).spine;
        const spineItems: any[] = spine.items || spine.spineItems || [];

        for (const item of spineItems) {
          try {
            await item.load((book as any).load.bind(book));
            const doc: Document = item.document;
            if (!doc) continue;

            const body = doc.querySelector('body');
            if (!body) continue;

            const paragraphs: string[] = [];
            body.querySelectorAll('p').forEach(p => {
              const text = p.textContent?.trim();
              if (text && text.length > 10) paragraphs.push(text);
            });

            // Fallback to divs if no <p> tags
            if (paragraphs.length === 0) {
              body.querySelectorAll('div').forEach(div => {
                const text = div.textContent?.trim();
                if (text && text.length > 10 && !div.querySelector('div')) paragraphs.push(text);
              });
            }

            let chapterTitle = `Chapter ${chapters.length + 1}`;
            const heading = body.querySelector('h1, h2, h3');
            if (heading?.textContent?.trim()) chapterTitle = heading.textContent.trim();

            if (paragraphs.length > 0) {
              chapters.push({ title: chapterTitle, paragraphs });
            }

            item.unload?.();
          } catch {
            // skip spine item
          }
        }

        resolve({
          title,
          author,
          coverUrl,
          chapters: chapters.length
            ? chapters
            : [{ title: 'Content', paragraphs: ['Could not extract text from this EPUB.'] }],
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
