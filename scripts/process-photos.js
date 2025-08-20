#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, extname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import pretty from 'pretty';
import { getPlaiceholder } from 'plaiceholder'

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

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
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

const generatePlaceholder = async (filename) => {
  const imagePath = `./public/photos/${filename}`
  
  if (!existsSync(imagePath)) {
    console.warn(`Image file not found: ${imagePath}`)
    return null
  }
  
  try {
    const { base64 } = await getPlaiceholder(imagePath)
    
    return base64
  } catch (error) {
    console.error(`❌ Failed to generate plaiceholder for ${filename}:`, error.message)
    return null
  }
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
      <img class="opacity-0" onload="this.classList.remove('opacity-0'); this.classList.add('z-index-2');" src="/photos/${photo.filename}" alt="${photo.alt || photo.description || ''}" loading="eager">
      <noscript><img class="z-index-2" src="/photos/${photo.filename}" alt="${photo.alt || photo.description || ''}" loading="eager"></noscript>

    </picture>`.trim();
}

async function buildHeroHTML(photo) {
  if (!photo) return `<div class="no-photo"><p>No photos yet</p></div>`;

  // TODO: Fix the size stuff its fucked
  const sizesAttr = `(max-width: 1200px) 100vw, (max-width: 2000px) 1200px, 1600px`;
  const picture = buildPictureHTML(photo, sizesAttr);

  // If your caption fully describes the image, you may set img alt="" and put the description here.
  const iso = (new Date(photo.date)).toISOString().slice(0,10);

  // Generate placeholder from the smallest image if we have it
  const placeholder = await generatePlaceholder(photo.optimizedImages ? photo.optimizedImages[0]?.jpg : photo.filename);

  return `
      <figure>
      <div class="image-container">
        ${placeholder ? `
            <img class="placeholder" src="${placeholder}" alt="${photo.alt || photo.description}" />
            <div class="backdrop-blur"></div>
          ` : ''}
        ${picture}
      </div>
      <figcaption class="meta">
        <p class="meta-title">
          <time datetime="${esc(iso)}">${formatShort(photo.date)}</time>
          ${photo.description ? ` // ${esc(photo.description)}` : ''}
          ${photo.location ? ` // ${esc(photo.location)}` : ''}
        </p>
        ${(photo.film || photo.camera) ? `
        <p class="meta-details">${[photo.film, photo.camera].filter(Boolean).map(esc).join(', ')}</p>` : ''}
      </figcaption>
      </figure>`.trim();
}

function buildGridHTML(photos) {
  const items = photos.map((p) => {
    const picture = buildPictureHTML(p);
    const iso = (() => {
      try {
        const d = new Date(p.date);
        return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
      } catch { return ''; }
    })();

    const details = [p.film, p.camera].filter(Boolean).map(esc).join(', ');

    return `
        <figure class="photo" data-photo-id="${esc(p.id)}">
            ${picture}
          <figcaption class="meta">
            <p class="meta-title">
              ${iso ? `<time datetime="${esc(iso)}">${esc(formatShort(p.date))}</time>` : esc(formatShort(p.date))}
              ${p.description ? ` // ${esc(p.description)}` : ''}
              ${p.location ? ` // ${esc(p.location)}` : ''}
            </p>
            ${details ? `<p class="meta-details">${details}</p>` : ''}
          </figcaption>
        </figure>`.trim();
    }).join('\n');


    return `<div class="grid">${items}</div>`.trim();
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
        description: "TODO_UPDATE_DESCRIPTION",
        alt: "TODO_UPDATE_ALT",
        location: "TODO_UPDATE_LOCATION",
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
  const hero   = await buildHeroHTML(latest);

  writeFileSync('src/_photos-grid.html', pretty(grid || ''), {ocd:true});
  writeFileSync('src/_hero.html', pretty(hero || ''), {ocd:true});

  console.log('🎉 partials written: _hero.html, _photos-grid.html');
}

run();