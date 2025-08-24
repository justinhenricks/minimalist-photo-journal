import { PhotoPayload } from '../components/photo-modal'

function pickPreferredSource(picture: HTMLPictureElement | null) {
  if (!picture) return null
  const sources = Array.from(picture.querySelectorAll('source[srcset]'))
  if (!sources.length) return null
  return sources.find((s) => (s.getAttribute('type') || '').includes('webp')) || sources[0]
}

export function getPhotoPayloadFromImg(img: HTMLImageElement): PhotoPayload {
  const modalSizes = '(min-width: 1600px) 1600px, 96vw'
  const picture = img.closest('picture')
  const preferred = pickPreferredSource(picture)

  return {
    src: img.currentSrc || img.src,
    srcset: preferred?.getAttribute('srcset') || undefined,
    sizes: modalSizes,
    alt: img.alt || '',
    date: img.dataset.date,
    camera: img.dataset.camera,
    film: img.dataset.film,
    description: img.dataset.description,
    location: img.dataset.location,
    placeholder: img.dataset.placeholder,
    curIndex: img.dataset.index || '0',
  }
}
