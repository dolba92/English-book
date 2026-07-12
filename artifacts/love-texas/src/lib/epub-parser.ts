import JSZip from 'jszip';

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function parseHtml(text: string): Document {
  return new DOMParser().parseFromString(text, 'text/html');
}

function extractTextFromHtml(htmlText: string): string[] {
  const doc = parseHtml(htmlText);
  const paragraphs: string[] = [];

  // Remove script, style, head
  doc.querySelectorAll('script, style, head').forEach(el => el.remove());

  // Try p tags first
  const pTags = doc.querySelectorAll('p');
  if (pTags.length > 0) {
    pTags.forEach(p => {
      const text = p.textContent?.replace(/\s+/g, ' ').trim();
      if (text && text.length > 15) paragraphs.push(text);
    });
  }

  // Fallback: block-level elements
  if (paragraphs.length === 0) {
    doc.querySelectorAll('div, section, article').forEach(el => {
      if (el.children.length === 0 || !el.querySelector('div, section')) {
        const text = el.textContent?.replace(/\s+/g, ' ').trim();
        if (text && text.length > 15) paragraphs.push(text);
      }
    });
  }

  // Last resort: body text split by double newlines
  if (paragraphs.length === 0) {
    const body = doc.body?.textContent || '';
    body.split(/\n{2,}/).forEach(chunk => {
      const text = chunk.replace(/\s+/g, ' ').trim();
      if (text.length > 15) paragraphs.push(text);
    });
  }

  return paragraphs;
}

async function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function parseEpub(file: File): Promise<{
  title: string;
  author: string;
  coverUrl?: string;
  chapters: { title: string; paragraphs: string[] }[];
}> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. Read container.xml → find OPF path
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('Not a valid EPUB: missing container.xml');

  const containerDoc = parseXml(containerXml);
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('Cannot find OPF path in container.xml');

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // 2. Read OPF
  const opfText = await zip.file(opfPath)?.async('text');
  if (!opfText) throw new Error('Cannot read OPF file');
  const opfDoc = parseXml(opfText);

  // 3. Metadata
  const title = opfDoc.querySelector('metadata > *|title, metadata > title')?.textContent?.trim() || file.name.replace(/\.epub$/i, '');
  const author = opfDoc.querySelector('metadata > *|creator, metadata > creator')?.textContent?.trim() || 'Unknown Author';

  // 4. Manifest: id → href map
  const manifest: Record<string, { href: string; mediaType: string }> = {};
  opfDoc.querySelectorAll('manifest item').forEach(item => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type') || '';
    if (id && href) manifest[id] = { href: opfDir + href, mediaType };
  });

  // 5. Cover image
  let coverUrl: string | undefined;
  try {
    // Try meta cover id
    const coverId = opfDoc.querySelector('meta[name="cover"]')?.getAttribute('content');
    const coverHref = coverId
      ? manifest[coverId]?.href
      : Object.values(manifest).find(m => m.mediaType.startsWith('image/') && /cover/i.test(m.href))?.href;

    if (coverHref) {
      const coverFile = zip.file(coverHref) || zip.file(decodeURIComponent(coverHref));
      if (coverFile) {
        const blob = await coverFile.async('blob');
        coverUrl = await fileToBase64(blob);
      }
    }
  } catch {
    // no cover
  }

  // 6. Spine → ordered list of manifest ids
  const spineIds: string[] = [];
  opfDoc.querySelectorAll('spine itemref').forEach(ref => {
    const id = ref.getAttribute('idref');
    if (id) spineIds.push(id);
  });

  // 7. Extract chapters from spine items
  const chapters: { title: string; paragraphs: string[] }[] = [];
  let chapterNum = 0;

  for (const id of spineIds) {
    const item = manifest[id];
    if (!item) continue;
    if (!item.mediaType.includes('html') && !item.href.match(/\.(html|xhtml|htm)$/i)) continue;

    try {
      const htmlText = await (zip.file(item.href) || zip.file(decodeURIComponent(item.href)))?.async('text');
      if (!htmlText) continue;

      const paragraphs = extractTextFromHtml(htmlText);
      if (paragraphs.length === 0) continue;

      chapterNum++;
      const doc = parseHtml(htmlText);
      const heading = doc.querySelector('h1, h2, h3')?.textContent?.trim();
      const chapterTitle = heading || `Chapter ${chapterNum}`;

      // Merge very short chapters into the previous one (e.g. cover pages)
      if (paragraphs.length < 3 && chapters.length > 0) {
        chapters[chapters.length - 1].paragraphs.push(...paragraphs);
      } else {
        chapters.push({ title: chapterTitle, paragraphs });
      }
    } catch {
      // skip broken item
    }
  }

  if (chapters.length === 0) {
    throw new Error('Could not extract any text from this EPUB file.');
  }

  return { title, author, coverUrl, chapters };
}
