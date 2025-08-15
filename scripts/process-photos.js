#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, extname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(fileURLToPath(new URL('.', import.meta.url)));

const PHOTO_INBOX = './photo-inbox';
const PHOTOS_DIR = './public/photos';
const PHOTOS_JSON = './src/photos.manifest.json';

const FILM_ORGANIZER_CONFIG = '/Users/justin/workspace/film-organizer/config.yml';

const IMAGE_SIZES = [
  { width: 800,  suffix: '800w'  },
  { width: 1600, suffix: '1600w' },
  { width: 2400, suffix: '2400w' },
  { width: 3000, suffix: '3000w' }
];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

function checkImageMagick() {
  try { execSync('convert -version', { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function loadFilmOrganizerConfig() {
  try {
    if (!existsSync(FILM_ORGANIZER_CONFIG)) return { cameras: {}, films: {} };
    const text = readFileSync(FILM_ORGANIZER_CONFIG, 'utf8');
    const cameras = {}, films = {};
    let section = '';
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (line === 'cameras:') { section = 'cameras'; continue; }
      if (line === 'films:')   { section = 'films';   continue; }
      if (!line || line.startsWith('#') || !line.includes(':')) continue;
      const [code, name] = line.split(':').map(s => s.trim());
      if (section === 'cameras') cameras[code] = name;
      if (section === 'films') films[code] = name;
    }
    return { cameras, films };
  } catch { return { cameras: {}, films: {} }; }
}

function parseFilename(filename, config) {
  const base = basename(filename, extname(filename));
  const parts = base.split('-');
  let date = '', film = '', camera = '';

  if (parts[0] && /^\d{6}$/.test(parts[0])) {
    const yy = 2000 + Number(parts[0].slice(0,2));
    const mm = Number(parts[0].slice(2,4));
    const dd = Number(parts[0].slice(4,6));
    const d = new Date(yy, mm - 1, dd);
    if (!Number.isNaN(d.getTime())) {
      date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
  }
  for (const p of parts) if (config.films[p])  { film = config.films[p]; break; }
  for (const p of parts) if (config.cameras[p]){ camera = config.cameras[p]; break; }
  return { date, film, camera };
}

function generatePhotoId(filename) {
  const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD
  return `${today}-${basename(filename, extname(filename))}`;
}

function optimizeImage(sourcePath, filename, imagickOK) {
  const baseName = basename(filename, extname(filename));
  const photoFolder = join(PHOTOS_DIR, baseName);
  if (!existsSync(photoFolder)) mkdirSync(photoFolder, { recursive: true });

  const out = [];

  if (!imagickOK) {
    // no optimization, only “original”
    out.push({ width: 'original', webp: filename, jpg: filename });
    return out;
  }

  for (const size of IMAGE_SIZES) {
    const webpPath = join(photoFolder, `${size.suffix}.webp`);
    const jpgPath  = join(photoFolder, `${size.suffix}.jpg`);
    execSync(`convert "${sourcePath}" -resize ${size.width}x -quality 90 "${webpPath}"`, { stdio: 'ignore' });
    execSync(`convert "${sourcePath}" -resize ${size.width}x -quality 85 "${jpgPath}"`, { stdio: 'ignore' });
    out.push({ width: size.width, webp: `${baseName}/${size.suffix}.webp`, jpg: `${baseName}/${size.suffix}.jpg` });
  }

  // high-quality original webp
  const originalWebp = join(photoFolder, 'original.webp');
  execSync(`convert "${sourcePath}" -quality 95 "${originalWebp}"`, { stdio: 'ignore' });
  out.push({ width: 'original', webp: `${baseName}/original.webp`, jpg: filename });

  return out;
}

function formatShort(dateString) {
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString || '';
    const short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    return `${short} ${d.getDate()}, ${d.getFullYear()}`;
  } catch { return dateString || ''; }
}

function buildPictureHTML(photo) {
  if (!photo.optimizedImages?.length) {
    return `<img src="/photos/${photo.filename}" alt="${photo.alt || photo.description || ''}" loading="lazy" decoding="async">`;
  }
  const sizesAttr = `(min-width:1440px) 20vw, (min-width:1024px) 24vw, (min-width:768px) 31vw, (min-width:480px) 48vw, 100vw`;
  const webp = photo.optimizedImages.filter(x => x.width !== 'original').map(x => `/photos/${x.webp} ${x.width}w`).join(', ');
  const jpg  = photo.optimizedImages.filter(x => x.width !== 'original').map(x => `/photos/${x.jpg} ${x.width}w`).join(', ');
  return `
<picture>
  <source type="image/webp" srcset="${webp}" sizes="${sizesAttr}">
  <img src="/photos/${photo.filename}" alt="${photo.alt || photo.description || ''}" loading="lazy" decoding="async">
</picture>`.trim();
}

function buildHeroHTML(photo) {
  if (!photo) {
    return `<div class="no-photo"><p>No photos yet</p></div>`;
  }
  const sizesAttr = `(max-width: 1200px) 100vw, (max-width: 2000px) 1200px, 1600px`;
  const picture = photo.optimizedImages?.length
    ? `
<picture>
  <source type="image/webp" srcset="${
    photo.optimizedImages.filter(x => x.width !== 'original').map(x => `/photos/${x.webp} ${x.width}w`).join(', ')
  }" sizes="${sizesAttr}">
  <img src="/photos/${photo.filename}" alt="${photo.alt || photo.description || ''}" class="photo-clickable" loading="eager" decoding="async">
</picture>`.trim()
    : `<img src="/photos/${photo.filename}" alt="${photo.alt || photo.description || ''}" class="photo-clickable" loading="eager" decoding="async">`;

  return `
<article class="photo-card hero-card" data-photo-id="${photo.id}">
  <div class="image-container">
    ${picture}
  </div>
  <div class="meta">
    <div class="meta-title">${formatShort(photo.date)} ${photo.description ? `// ${photo.description}` : ''} ${photo.location ? `// ${photo.location}` : ''}</div>
    <div class="meta-details">${[photo.film, photo.camera].filter(Boolean).join(', ')}</div>
  </div>
</article>`.trim();
}

function buildGridHTML(photos) {
  return photos.map((p) => `
<article class="photo-card" data-photo-id="${p.id}">
  <a class="image-container" href="/photos/${p.filename}">
    ${buildPictureHTML(p)}
  </a>
  <div class="meta">
    <div class="meta-title">${formatShort(p.date)} ${p.description ? `// ${p.description}` : ''} ${p.location ? `// ${p.location}` : ''}</div>
    <div class="meta-details">${[p.film, p.camera].filter(Boolean).join(', ')}</div>
  </div>
</article>`.trim()).join('\n');
}

async function run() {
  console.log('📸 processing photos…');
  const imagickOK = checkImageMagick();
  const config = loadFilmOrganizerConfig();

  if (!existsSync(PHOTOS_DIR))     mkdirSync(PHOTOS_DIR, { recursive: true });

  let photos = [];
  if (existsSync(PHOTOS_JSON)) {
    const raw = readFileSync(PHOTOS_JSON, 'utf8');
    photos = JSON.parse(raw).photos || [];
  }

  if (!existsSync(PHOTO_INBOX)) {
    console.log('📭 no photo-inbox found; only regenerating partials from manifest…');
  } else {
    const files = readdirSync(PHOTO_INBOX).filter(f => IMAGE_EXTENSIONS.includes(extname(f).toLowerCase()));
    for (const filename of files) {
      if (photos.some(p => p.filename === filename)) {
        console.log(`⏭️  skip existing: ${filename}`);
        continue;
      }
      const source = join(PHOTO_INBOX, filename);
      const dest   = join(PHOTOS_DIR, filename);
      copyFileSync(source, dest);
      unlinkSync(source);

      const meta = parseFilename(filename, config);
      const entry = {
        id: generatePhotoId(filename),
        filename,
        date: meta.date || new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
        description: "",
        alt: "",
        location: "",
        tags: [],
        film: meta.film || "",
        camera: meta.camera || "",
        optimizedImages: optimizeImage(dest, filename, imagickOK)
      };
      // newest first
      photos.unshift(entry);
      console.log(`✅ processed ${filename}`);
    }
  }

  // persist manifest
  writeFileSync(PHOTOS_JSON, JSON.stringify({ photos }, null, 2));

  // build partials
  const latest = photos[0] || null;
  const grid   = buildGridHTML(photos.slice(1)); // grid excludes hero
  const hero   = buildHeroHTML(latest);

  writeFileSync('src/_photos-grid.html', grid || '');
  writeFileSync('src/_hero.html', hero || '');

  console.log('🎉 partials written: _hero.html, _photos-grid.html');
}

run();
