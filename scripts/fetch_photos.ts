import { landmarks } from '../data/landmarks';
import * as fs from 'fs';

const withoutPhotos = landmarks.filter(l => !l.photoUrl);
console.log(`Searching photos for ${withoutPhotos.length} landmarks...`);

const results: Record<string, string> = {};

async function searchWikimedia(name: string): Promise<string | null> {
  try {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name + ' Berkeley California')}&srnamespace=6&format=json&srlimit=3`;
    const res = await fetch(searchUrl);
    const data = await res.json();
    const hits = data.query?.search;
    if (!hits || hits.length === 0) return null;
    
    for (const hit of hits) {
      const title = hit.title.replace('File:', '');
      // Skip PDFs, SVGs, and non-image files
      if (title.endsWith('.pdf') || title.endsWith('.svg') || title.endsWith('.ogg') || title.endsWith('.ogv')) continue;
      
      const imgUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json`;
      const imgRes = await fetch(imgUrl);
      const imgData = await imgRes.json();
      const pages = imgData.query?.pages;
      if (!pages) continue;
      for (const page of Object.values(pages) as any[]) {
        const thumb = page.imageinfo?.[0]?.thumburl;
        if (thumb && thumb.includes('.jpg') || thumb?.includes('.png') || thumb?.includes('.jpeg')) {
          return thumb;
        }
      }
    }
    return null;
  } catch { return null; }
}

async function searchWikipedia(name: string): Promise<string | null> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name + ' Berkeley California')}&format=json&srlimit=1`;
    const res = await fetch(searchUrl);
    const data = await res.json();
    const hit = data.query?.search?.[0];
    if (!hit) return null;
    
    const thumbUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(hit.title)}&prop=pageimages&pithumbsize=800&format=json`;
    const thumbRes = await fetch(thumbUrl);
    const thumbData = await thumbRes.json();
    const pages = thumbData.query?.pages;
    if (!pages) return null;
    for (const page of Object.values(pages) as any[]) {
      if (page.thumbnail?.source) return page.thumbnail.source;
    }
    return null;
  } catch { return null; }
}

async function main() {
  let found = 0;
  let checked = 0;
  
  // Prioritize notable buildings first
  const priority = withoutPhotos.sort((a, b) => {
    const notable = ['civic', 'religious', 'educational', 'cultural'];
    return notable.indexOf(a.category) - notable.indexOf(b.category);
  });
  
  for (const lm of priority) {
    checked++;
    if (checked % 20 === 0) console.log(`Checked ${checked}/${priority.length}, found ${found}`);
    
    let url = await searchWikimedia(lm.name);
    if (!url) url = await searchWikimedia(lm.name + ' ' + lm.address);
    if (!url) url = await searchWikipedia(lm.name);
    
    if (url) {
      results[lm.id] = url;
      found++;
      console.log(`  ✓ ${lm.name}: ${url.substring(0, 80)}...`);
    }
    
    // 300ms delay
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log(`\nDone. Found ${found} photos out of ${checked} landmarks`);
  fs.writeFileSync('data/photo_urls_new.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
