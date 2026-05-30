import * as fs from 'fs';
import * as path from 'path';

interface Landmark {
  id: string;
  name: string;
  address: string;
  photoUrl?: string;
  [key: string]: any;
}

const LANDMARKS_FILE = path.join(__dirname, '../data/landmarks.ts');
const OUTPUT_FILE = path.join(__dirname, '../data/photo_urls.json');
const DELAY_MS = 250;

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BerkeleyToursBot/1.0 (educational project)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function searchWikimedia(query: string): Promise<string | null> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6&format=json&srlimit=5`;
    const data = await fetchJSON(url);
    const results = data.query?.search;
    if (!results || results.length === 0) return null;

    // Try first few results
    for (const result of results) {
      const title = result.title; // e.g. "File:Something.jpg"
      const imgUrl = await getImageUrl(title);
      if (imgUrl) return imgUrl;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function getImageUrl(fileTitle: string): Promise<string | null> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json`;
    const data = await fetchJSON(url);
    const pages = data.query?.pages;
    if (!pages) return null;
    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      const thumbUrl = page.imageinfo?.[0]?.thumburl;
      if (thumbUrl) return thumbUrl;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function searchWikipedia(name: string): Promise<string | null> {
  try {
    // Search for article
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name + ' Berkeley California')}&format=json&srlimit=3`;
    const searchData = await fetchJSON(searchUrl);
    const results = searchData.query?.search;
    if (!results || results.length === 0) return null;

    // Get thumbnail for first result
    const pageTitle = results[0].title;
    const thumbUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageimages&pithumbsize=800&format=json`;
    const thumbData = await fetchJSON(thumbUrl);
    const pages = thumbData.query?.pages;
    if (!pages) return null;
    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      if (page.thumbnail?.source) return page.thumbnail.source;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function main() {
  // Parse landmarks from TS file
  const content = fs.readFileSync(LANDMARKS_FILE, 'utf8');
  
  // Extract landmark objects using regex - find id and name and photoUrl status
  const landmarkRegex = /\{\s*id:\s*'([^']+)'[\s\S]*?name:\s*'([^']+)'/g;
  const landmarks: { id: string; name: string; hasPhotoUrl: boolean }[] = [];
  
  // Better approach: parse more carefully
  // Split by landmark objects
  const blocks = content.split(/\n\s*\{(\s*\n\s*id:)/);
  
  interface ParsedLandmark {
    id: string;
    name: string;
    hasPhotoUrl: boolean;
  }
  
  const parsed: ParsedLandmark[] = [];
  
  // Use simpler regex approach
  const fullBlockRegex = /\{[\s\S]*?id:\s*'(lm-\d+)'[\s\S]*?name:\s*'([^']+)'[\s\S]*?(?:photoUrl:\s*'[^']+'[\s\S]*?)?\}/g;
  
  let match;
  while ((match = fullBlockRegex.exec(content)) !== null) {
    const block = match[0];
    const id = match[1];
    const name = match[2];
    const hasPhotoUrl = /photoUrl:\s*'/.test(block);
    parsed.push({ id, name, hasPhotoUrl });
  }

  const needPhotos = parsed.filter(l => !l.hasPhotoUrl);
  console.log(`Total landmarks: ${parsed.length}, with photos: ${parsed.filter(l => l.hasPhotoUrl).length}, need photos: ${needPhotos.length}`);

  // Load existing results if any
  let results: Record<string, string> = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    results = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  }

  let found = 0;
  let failed = 0;

  for (let i = 0; i < needPhotos.length; i++) {
    const landmark = needPhotos[i];
    if (results[landmark.id]) {
      found++;
      continue; // Already have a result
    }

    let photoUrl: string | null = null;

    // Try Wikimedia Commons first
    photoUrl = await searchWikimedia(`${landmark.name} Berkeley California`);
    await delay(DELAY_MS);

    // Fallback to Wikipedia
    if (!photoUrl) {
      photoUrl = await searchWikipedia(landmark.name);
      await delay(DELAY_MS);
    }

    if (photoUrl) {
      results[landmark.id] = photoUrl;
      found++;
      console.log(`  ✓ ${landmark.name}`);
    } else {
      failed++;
      console.log(`  ✗ ${landmark.name}`);
    }

    if ((i + 1) % 10 === 0) {
      console.log(`Progress: ${i + 1}/${needPhotos.length} (found: ${found}, failed: ${failed})`);
      // Save intermediate results
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    }
  }

  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nDone! Found ${found} photos, failed ${failed}. Saved to ${OUTPUT_FILE}`);
}

main().catch(console.error);
