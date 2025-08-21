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

const IMAGE_WIDTHS = [480, 800, 1200, 1600, 2000, 2400, 3200];

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

function checkImageMagick() {
  try { execSync('convert -version', { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function magick(cmd) {
  execSync(cmd, { stdio: 'ignore' });
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

/**
 * sizes that match your CSS:
 * - XL (≥1800px): containers jump to 1600px
 * - Desktop (≥1024px): containers at 1250px, grid is 2 columns
 * - Below: 1 column, full width
 */
function sizesFor(role) {
  if (role === 'hero') {
    // Hero displays as 100vw until container caps; then 1250px (desktop) or 1600px (XL)
    return '(min-width: 1800px) 1600px, (min-width: 1024px) 1250px, 100vw';
  }
  if (role === 'grid') {
    // Two columns inside the capped container on desktop:
    // ~ (container - gap)/2; gap is 1rem; we’ll approximate to 620px/800px
    return '(min-width: 1800px) 800px, (min-width: 1024px) 620px, 100vw';
  }
  // default conservative
  return '100vw';
}

export function optimizeImage(sourcePath, filename, imagickOK) {
  const baseName = basename(filename, extname(filename));
  const photoFolder = join(PHOTOS_DIR, baseName);
  if (!existsSync(photoFolder)) mkdirSync(photoFolder, { recursive: true });

  const out = [];

  if (!imagickOK) {
    out.push({ width: 'original', webp: filename, jpg: filename });
    return out;
  }

  // Common flags aimed at crisp result + lean bytes
  // - Lanczos resize + strip metadata
  // - WebP at q=82 with good effort, JPEG slightly lower to keep bytes down
  for (const w of IMAGE_WIDTHS) {
    const webpPath = join(photoFolder, `${w}w.webp`);
    const jpgPath  = join(photoFolder, `${w}w.jpg`);

    // WEBP
    magick(
      `convert "${sourcePath}" -filter Lanczos -resize ${w}x ` +
      `-strip -define webp:method=6 -quality 82 "${webpPath}"`
    );

    // JPEG
    magick(
      `convert "${sourcePath}" -filter Lanczos -resize ${w}x ` +
      `-strip -sampling-factor 4:2:0 -quality 85 "${jpgPath}"`
    );

    out.push({ width: w, webp: `${baseName}/${w}w.webp`, jpg: `${baseName}/${w}w.jpg` });
  }

  // High-quality original webp as last resort
  const originalWebp = join(photoFolder, 'original.webp');
  magick(`convert "${sourcePath}" -strip -define webp:method=6 -quality 90 "${originalWebp}"`);
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

function buildSrcset(images, kind /* 'webp' | 'jpg' */) {
  return images
    .filter(x => x.width !== 'original')
    .map(x => `/photos/${x[kind]} ${x.width}w`)
    .join(', ');
}


function imgAttrs({ isHero }) {
  const base = [
    `class="opacity-0"`,
    `onload="this.classList.remove('opacity-0'); this.classList.add('z-index-2');"`
  ];

  if (isHero) {
    // load first image fast
    base.push(`loading="eager"`, `fetchpriority="high"`);
  } else {
    base.push(`loading="lazy"`);
  }
  return base.join(' ');
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

export function buildPictureHTML(photo, role = 'grid', placeholder) {
  const isHero = role === 'hero';

  // No optimization available -> simple <img>
  if (!photo.optimizedImages?.length) {
    return `<img src="/photos/${photo.filename}" alt="${photo.alt || photo.description || ''}" ${imgAttrs({ isHero })}>`;
  }

  const sizes = sizesFor(role);
  const webpSet = buildSrcset(photo.optimizedImages, 'webp');
  const jpgSet  = buildSrcset(photo.optimizedImages, 'jpg');

  // IMPORTANT: Provide a reasonable default src (not original) for browsers ignoring srcset.
  // Choose the closest width to the primary display target for each role.
  const defaultJpg =
    role === 'hero'
      ? photo.optimizedImages.find(x => x.width === 1600)?.jpg
        || photo.optimizedImages.find(x => x.width === 1200)?.jpg
        || photo.filename
      : photo.optimizedImages.find(x => x.width === 800)?.jpg
        || photo.optimizedImages.find(x => x.width === 1200)?.jpg
        || photo.filename;

  return `
    <picture>
      <source type="image/webp" srcset="${webpSet}" sizes="${sizes}">
      <source type="image/jpeg" srcset="${jpgSet}" sizes="${sizes}">
      <img class="photo-clickable" 
       data-date="${formatShort(photo.date)}"
       data-placeholder="${placeholder || ''}"
       data-description="${photo.description}"
       data-camera="${photo.camera}"
       data-film="${photo.film}"
       data-location="${photo.location}"
       ${imgAttrs({ isHero })} src="/photos/${defaultJpg}" alt="${photo.alt || photo.description || ''}">
      <noscript><img class="z-index-2" src="/photos/${defaultJpg}" alt="${photo.alt || photo.description || ''}" loading="eager"></noscript>
    </picture>`.trim();
}

async function buildHeroHTML(photo) {
  if (!photo) return `<div class="no-photo"><p>No photos yet</p></div>`;


    // Generate placeholder from the smallest image if we have it
    const placeholder = await generatePlaceholder(photo.optimizedImages ? photo.optimizedImages[0]?.jpg : photo.filename);
  const picture = buildPictureHTML(photo, 'hero', placeholder);

  // If your caption fully describes the image, you may set img alt="" and put the description here.
  const iso = (new Date(photo.date)).toISOString().slice(0,10);

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

async function buildGridHTML(photos) {
  const items = await Promise.all(photos.map(async (p) => {
    const placeholder = await generatePlaceholder(p.optimizedImages ? p.optimizedImages[0]?.jpg : p.filename);
    const picture = buildPictureHTML(p, 'grid', placeholder);
    const iso = (() => {
      try {
        const d = new Date(p.date);
        return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
      } catch { return ''; }
    })();

    const details = [p.film, p.camera].filter(Boolean).map(esc).join(', ');

    return `
        <figure>
          <div class="image-container">
            ${placeholder ? `
            <img class="placeholder" src="${placeholder}" alt="${p.alt || p.description}" />
            <div class="backdrop-blur"></div>
          ` : ''}
            ${picture}
          </div>
          <figcaption class="meta">
            <p class="meta-title">
              ${iso ? `<time datetime="${esc(iso)}">${esc(formatShort(p.date))}</time>` : esc(formatShort(p.date))}
              ${p.description ? ` // ${esc(p.description)}` : ''}
              ${p.location ? ` // ${esc(p.location)}` : ''}
            </p>
            ${details ? `<p class="meta-details">${details}</p>` : ''}
          </figcaption>
        </figure>`.trim();
  }));

  return `<div class="grid">${items.join('\n')}</div>`.trim();
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
  const grid   = await buildGridHTML(photos.slice(1)); // grid excludes hero
  const hero   = await buildHeroHTML(latest);

  writeFileSync('src/_photos-grid.html', pretty(grid || ''), {ocd:true});
  writeFileSync('src/_hero.html', pretty(hero || ''), {ocd:true});

  console.log('🎉 partials written: _hero.html, _photos-grid.html');
}

run();