// src/components/photo-modal.ts
import { getPhotoPayloadFromImg } from '../lib/utilities'

export type PhotoPayload = {
  src: string
  srcset?: string
  sizes?: string
  alt?: string
  date?: string
  camera?: string
  film?: string
  description?: string
  location?: string
  placeholder?: string
  curIndex: string
}

type SlideEls = {
  root: HTMLDivElement
  ph: HTMLImageElement
  img: HTMLImageElement
}

const decodedOnce = new Set<number>()
const MAX_SLIDES = 40

class PhotoModal extends HTMLElement {
  private root: ShadowRoot
  private dlg!: HTMLDialogElement
  private closeBtn!: HTMLButtonElement
  private container!: HTMLElement
  private slidesWrap!: HTMLDivElement

  private dateEl!: HTMLElement
  private cameraEl!: HTMLElement
  private filmEl!: HTMLElement
  private descEl!: HTMLElement
  private locationEl!: HTMLElement

  private curIndex = 0
  private slides = new Map<number, SlideEls>()
  private lru: number[] = []

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })

    this.root.innerHTML = `
      <dialog id="dlg" aria-modal="true">
        <button id="close" class="btn-close" aria-label="Close">&times;</button>

        <figure class="card">
          <div class="image-container" id="stage">
            <div class="slides" id="slides" aria-live="polite"></div>
          </div>

          <figcaption class="cap">
            <div class="row primary">
              <span class="date"></span>
              <span class="dot" aria-hidden="true">•</span>
              <span class="desc"></span>
              <span class="dot" aria-hidden="true">•</span>
              <span class="location"></span>
            </div>
            <div class="row secondary">
              <span class="camera"></span>
              <span class="dot" aria-hidden="true">•</span>
              <span class="film"></span>
            </div>
          </figcaption>
        </figure>
      </dialog>

      <style>
      *, *::before, *::after { box-sizing: border-box; }

      #dlg { border: 0; padding: 0; background: transparent; width: fit-content; max-width: 100vw; }
      #dlg::backdrop { backdrop-filter: blur(8px); background: rgba(0,0,0,.35); }

      .card {
        margin: 0;
        display: grid;
        grid-template-rows: 1fr auto;
        border-radius: 8px;
        overflow: hidden;
        background: transparent;
        box-shadow: none;
        width: min(96vw, 1250px);
      }

      .image-container {
        position: relative;
        width: 100%;
        aspect-ratio: var(--ratio, 3 / 2);
      }

      .slides { position: absolute; inset: 0; }
      .slide {
        position: absolute; inset: 0;
        opacity: 0; pointer-events: none;
        transition: opacity 260ms ease-out;
        will-change: opacity;
      }
      .slide.active { opacity: 1; pointer-events: auto; }
      .slide[aria-hidden="true"] { pointer-events: none; }

      .slide .placeholder {
        position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: cover;
        filter: blur(16px);
      }
      .slide.ready .placeholder { opacity: 0; }

      .slide .full {
        position: absolute; inset: 0; width: 100%; height: 100%;
        opacity: 0; will-change: opacity;
        transition: opacity 260ms linear;
      }
      .slide.ready .full { opacity: 1; }

      .cap { display: none; }

      @media (min-width: 768px) {
        .card {
          background: rgba(255,255,255,.92);
          box-shadow: 0 10px 40px rgba(0,0,0,.35);
        }
        .cap {
          display: grid;
          padding: .75rem 1rem 1rem;
          color: #000;
          gap: 0.25rem;
          font-size: 0.8rem;
        }
      }

      .row.primary { display:flex; flex-wrap:wrap; gap:.5rem; align-items:baseline; font-weight: 600; }
      .row.secondary { display:flex; flex-wrap:wrap; gap:.5rem; font-style: italic; }
      .dot { opacity:.4; }

      .btn-close {
        position: absolute; top: .5rem; right: .5rem;
        border: 0; cursor: pointer; width: 2.25rem; height: 2.25rem; border-radius: 999px;
        background: rgba(0,0,0,.55); color: #fff; font-size: 1.5rem; line-height: 1;
        z-index: 3;
      }
      .btn-close:focus { outline: 2px solid #fff; outline-offset: 2px; }
      </style>
    `

    this.dlg = this.root.querySelector('#dlg') as HTMLDialogElement
    this.closeBtn = this.root.querySelector('#close') as HTMLButtonElement
    this.container = this.root.querySelector('#stage') as HTMLElement
    this.slidesWrap = this.root.querySelector('#slides') as HTMLDivElement
    this.dateEl = this.root.querySelector('.date') as HTMLElement
    this.cameraEl = this.root.querySelector('.camera') as HTMLElement
    this.filmEl = this.root.querySelector('.film') as HTMLElement
    this.descEl = this.root.querySelector('.desc') as HTMLElement
    this.locationEl = this.root.querySelector('.location') as HTMLElement

    this.onBackdropClick = this.onBackdropClick.bind(this)
    this.onCloseClick = this.onCloseClick.bind(this)
    this.onKeyDown = this.onKeyDown.bind(this)
    this.onBackdropPointerUp = this.onBackdropPointerUp.bind(this)
  }

  connectedCallback() {
    this.dlg.addEventListener('click', this.onBackdropClick)
    this.dlg.addEventListener('pointerup', this.onBackdropPointerUp)
    this.closeBtn.addEventListener('click', this.onCloseClick)
    window.addEventListener('keydown', this.onKeyDown)
  }

  disconnectedCallback() {
    this.dlg.removeEventListener('click', this.onBackdropClick)
    this.dlg.removeEventListener('pointerup', this.onBackdropPointerUp)
    this.closeBtn.removeEventListener('click', this.onCloseClick)
    window.removeEventListener('keydown', this.onKeyDown)
  }

  openWith(p: PhotoPayload) {
    const index = parseInt(p.curIndex)
    this.curIndex = index

    this.updateCaption(p)
    this.ensureSlide(index, p)
    this.activateSlide(index)

    if (!this.dlg.open) {
      this.dlg.showModal()
      document.body.style.overflow = 'hidden'
    }

    this.preloadNeighbors(index)
  }

  close() {
    if (this.dlg.open) this.dlg.close()
    document.body.style.overflow = ''
  }

  isOpen() {
    return this.dlg.open
  }

  private onBackdropClick(e: MouseEvent) {
    const r = this.container.getBoundingClientRect()
    const inside =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!inside) this.close()
  }

  private onBackdropPointerUp(e: PointerEvent) {
    if (!this.dlg.open) return
    const r = this.container.getBoundingClientRect()
    const inside =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (inside) return

    const stop = (ev: Event) => {
      ev.preventDefault()
      ev.stopPropagation()
    }
    document.addEventListener('click', stop, { once: true, capture: true })

    this.close()
  }

  private onCloseClick() {
    this.close()
  }

  private onKeyDown(e: KeyboardEvent) {
    if (!this.dlg.open) return

    if (e.key === 'Escape') {
      this.close()
      return
    }

    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()

    let next = this.curIndex
    if (e.key === 'ArrowLeft') {
      if (this.curIndex === 0) return
      next = this.curIndex - 1
    } else {
      const candidate = document.querySelector(
        `img[data-index="${this.curIndex + 1}"]`,
      ) as HTMLImageElement | null
      if (!candidate) return
      next = this.curIndex + 1
    }

    if (next === this.curIndex) return
    this.navigateTo(next)
  }

  private ensureSlide(index: number, p: PhotoPayload): SlideEls {
    const existing = this.slides.get(index)
    if (existing) {
      this.touchLRU(index)
      return existing
    }

    this.evictIfNeeded()

    const root = document.createElement('div')
    root.className = 'slide'
    root.setAttribute('data-index', String(index))
    root.setAttribute('aria-hidden', 'true')

    const ph = document.createElement('img')
    ph.className = 'placeholder'
    ph.alt = ''
    if (p.placeholder && !decodedOnce.has(index)) {
      ph.src = p.placeholder
      ph.style.display = ''
    } else {
      ph.style.display = 'none'
    }

    const img = document.createElement('img') as HTMLImageElement
    img.className = 'full'
    img.alt = p.alt ?? ''
    img.decoding = 'async'

    if (p.sizes) img.sizes = p.sizes
    if (p.srcset) {
      img.srcset = p.srcset
      if (p.src) img.src = p.src
    } else {
      img.src = p.src
    }

    root.appendChild(ph)
    root.appendChild(img)
    this.slidesWrap.appendChild(root)

    const reveal = () => {
      decodedOnce.add(index)
      requestAnimationFrame(() => {
        root.classList.add('ready')
      })
    }

    if (decodedOnce.has(index)) {
      reveal()
    } else if ('decode' in img && typeof img.decode === 'function') {
      img
        .decode()
        .then(reveal)
        .catch(() => {
          img.addEventListener('load', reveal, { once: true })
        })
    } else {
      img.addEventListener('load', reveal, { once: true })
    }

    const rec: SlideEls = { root, ph, img }
    this.slides.set(index, rec)
    this.touchLRU(index)
    return rec
  }

  private activateSlide(index: number) {
    this.slides.forEach((slide, i) => {
      const isActive = i === index
      slide.root.classList.toggle('active', isActive)
      slide.root.setAttribute('aria-hidden', isActive ? 'false' : 'true')
    })
  }

  private updateCaption(p: PhotoPayload) {
    this.dateEl.textContent = p.date ?? ''
    this.descEl.textContent = p.description ?? ''
    this.locationEl.textContent = p.location ?? ''
    this.cameraEl.textContent = p.camera ?? '—'
    this.filmEl.textContent = p.film ?? '—'
  }

  private preloadNeighbors(index: number) {
    const ids = [index - 1, index + 1]
    for (const i of ids) {
      if (i < 0) continue
      if (this.slides.has(i)) continue
      const thumb = document.querySelector(`img[data-index="${i}"]`) as HTMLImageElement | null
      if (!thumb) continue
      const payload = getPhotoPayloadFromImg(thumb)
      this.ensureSlide(i, payload)
    }
  }

  private evictIfNeeded() {
    if (this.slides.size < MAX_SLIDES) return
    for (const victim of this.lru) {
      if (victim === this.curIndex) continue
      const rec = this.slides.get(victim)
      if (rec) {
        rec.root.remove()
        this.slides.delete(victim)
      }
      this.lru = this.lru.filter((v) => v !== victim)
      break
    }
  }

  private touchLRU(index: number) {
    this.lru = this.lru.filter((i) => i !== index)
    this.lru.push(index)
  }

  private navigateTo(nextIndex: number) {
    const img = document.querySelector(`img[data-index="${nextIndex}"]`) as HTMLImageElement | null
    if (!img) return
    const payload = getPhotoPayloadFromImg(img)
    this.curIndex = nextIndex
    this.updateCaption(payload)
    this.ensureSlide(nextIndex, payload)
    this.activateSlide(nextIndex)
    this.preloadNeighbors(nextIndex)
  }
}

if (!customElements.get('photo-modal')) customElements.define('photo-modal', PhotoModal)
export default PhotoModal

declare global {
  interface HTMLElementTagNameMap {
    'photo-modal': PhotoModal
  }
}
