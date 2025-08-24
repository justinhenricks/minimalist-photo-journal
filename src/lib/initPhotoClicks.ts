import { getPhotoPayloadFromImg } from './utilities'

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

      modal.openWith(getPhotoPayloadFromImg(img))
    },
    // Not passive because we may call preventDefault()
    { passive: false },
  )
}
