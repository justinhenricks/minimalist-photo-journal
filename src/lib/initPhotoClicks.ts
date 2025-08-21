// src/lib/initPhotoClicks.ts
// Assumes you've augmented HTMLElementTagNameMap so that
// document.querySelector('photo-modal') returns your PhotoModal type.

function pickPreferredSource(picture: HTMLPictureElement | null): HTMLSourceElement | null {
  if (!picture) return null
  const sources = Array.from(picture.querySelectorAll('source[srcset]'))
  if (!sources.length) return null
  // Prefer AVIF or WebP if you generate them; fall back to the first <source>
  return (
    sources.find((s) => (s.getAttribute('type') || '').includes('avif')) ||
    sources.find((s) => (s.getAttribute('type') || '').includes('webp')) ||
    sources[0]
  )
}

/** Modal sizing rule: up to 1600px wide image, else ~96vw */
function modalSizes(): string {
  return '(min-width: 1600px) 1600px, 96vw'
}

/**
 * Attach a single delegated click handler that opens <photo-modal>
 * for any IMG matching `imgSelector`.
 */
export function initPhotoClicks(
  imgSelector = '.photo-clickable',
  modalSelector: 'photo-modal' = 'photo-modal',
) {
  console.log('init photo clicks')
  const modal = document.querySelector(modalSelector)
  if (!modal) {
    console.warn(`[photo] No <${modalSelector}> found.`)
    return
  }

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      const img = target.closest(imgSelector) as HTMLImageElement | null
      if (!img || img.tagName !== 'IMG') return

      e.preventDefault?.()

      // Mirror the preferred <source> srcset onto the modal <img>
      const picture = img.closest('picture')
      const preferred = pickPreferredSource(picture)

      modal.openWith({
        src: img.currentSrc || img.src,
        srcset: preferred?.getAttribute('srcset') || undefined,
        sizes: modalSizes(),
        alt: img.alt || '',
        date: img.dataset.date,
        camera: img.dataset.camera,
        film: img.dataset.film,
        description: img.dataset.description,
        placeholder: img.dataset.placeholder,
      })
    },
    // Not passive because we may call preventDefault()
    { passive: false },
  )
}
