// src/components/PhotoModal.ts
export type PhotoPayload = {
  src: string
  srcset?: string
  sizes?: string
  alt?: string
  date?: string
  camera?: string
  film?: string
  description?: string
}

class PhotoModal extends HTMLElement {
  private root: ShadowRoot
  private dlg!: HTMLDialogElement
  private closeBtn!: HTMLButtonElement

  // NEW: refs for content
  private img!: HTMLImageElement
  private titleEl!: HTMLElement
  private cameraEl!: HTMLElement
  private filmEl!: HTMLElement
  private descEl!: HTMLElement
  private content!: HTMLElement

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })

    this.root.innerHTML = `
        <dialog id="dlg" aria-labelledby="title">
          <button id="close" class="btn-close" aria-label="Close">&times;</button>
          <figure class="content card">
            <img id="img" alt="" decoding="async" />
            <figcaption class="cap">
              <div class="row primary">
                <strong id="title" class="date"></strong>
                <span class="dot">•</span><span class="camera"></span>
                <span class="dot">•</span><span class="film"></span>
              </div>
              <div class="row secondary desc"></div>
            </figcaption>
          </figure>
        </dialog>
        <style>
          #dlg { border: none; padding: 0; background: transparent; width: fit-content; max-width: min(96vw, 1600px); }
          #dlg::backdrop { backdrop-filter: blur(8px); background: rgba(0,0,0,.35); }
  
          .card {
            margin: 0; display: grid; grid-template-rows: 1fr auto; gap: .5rem;
            background: rgba(255,255,255,.92); border-radius: 16px; overflow: hidden;
            box-shadow: 0 10px 40px rgba(0,0,0,.35);
          }
          /* Image sizing */
          #img { display:block; max-width:min(96vw,1600px); max-height:calc(96vh - 120px); object-fit:contain; }
  
          .cap { padding: .75rem 1rem 1rem; color:#000; font:14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
          .row.primary { display:flex; flex-wrap:wrap; gap:.5rem; align-items:baseline; font-size:.95rem; }
          .row.secondary { margin-top:.25rem; color:#444; }
          .dot { opacity:.4; }
  
          .btn-close {
            position: absolute; top: .5rem; right: .5rem;
            border: 0; cursor: pointer; width: 2.25rem; height: 2.25rem; border-radius: 999px;
            background: rgba(0,0,0,.55); color: #fff; font-size: 1.5rem; line-height: 1;
          }
          .btn-close:focus { outline: 2px solid #fff; outline-offset: 2px; }
        </style>
      `

    // Cache refs
    this.dlg = this.root.querySelector('#dlg') as HTMLDialogElement
    this.closeBtn = this.root.querySelector('#close') as HTMLButtonElement

    // NEW: content refs
    this.content = this.root.querySelector('.content') as HTMLElement
    this.img = this.root.querySelector('#img') as HTMLImageElement
    this.titleEl = this.root.querySelector('#title') as HTMLElement
    this.cameraEl = this.root.querySelector('.camera') as HTMLElement
    this.filmEl = this.root.querySelector('.film') as HTMLElement
    this.descEl = this.root.querySelector('.desc') as HTMLElement

    // Bind handlers
    this.onBackdropClick = this.onBackdropClick.bind(this)
    this.onCloseClick = this.onCloseClick.bind(this)
    this.onKeyDown = this.onKeyDown.bind(this)
  }

  connectedCallback() {
    this.dlg.addEventListener('click', this.onBackdropClick)
    this.closeBtn.addEventListener('click', this.onCloseClick)
    window.addEventListener('keydown', this.onKeyDown)
  }

  disconnectedCallback() {
    this.dlg.removeEventListener('click', this.onBackdropClick)
    this.closeBtn.removeEventListener('click', this.onCloseClick)
    window.removeEventListener('keydown', this.onKeyDown)
  }

  /** Public: open with an image + metadata */

  openWith(p: PhotoPayload) {
    this.img.alt = p.alt ?? ''

    // 1) clear previous to avoid mixed state
    this.img.removeAttribute('src')
    this.img.removeAttribute('srcset')
    this.img.removeAttribute('sizes')

    // 2) if we have a srcset, let the browser choose exactly once
    if (p.srcset) {
      if (p.sizes) this.img.sizes = p.sizes // set sizes first
      this.img.srcset = p.srcset // then srcset (fetches optimal)
    } else {
      // fallback: just use src
      this.img.src = p.src
    }

    // metadata
    this.titleEl.textContent = p.date ?? ''
    this.cameraEl.textContent = p.camera ?? '—'
    this.filmEl.textContent = p.film ?? '—'
    this.descEl.textContent = p.description ?? ''

    if (!this.dlg.open) this.dlg.showModal()
  }

  /** Public: open/close without payload (for testing) */
  open() {
    if (!this.dlg.open) this.dlg.showModal()
  }

  close() {
    if (this.dlg.open) this.dlg.close()
    // Clear to free memory and avoid stale selections on resize
    this.img.removeAttribute('src')
    this.img.removeAttribute('srcset')
    this.img.removeAttribute('sizes')
  }

  /** Close when clicking the *backdrop* (outside the content card) */
  private onBackdropClick(e: MouseEvent) {
    // IMPORTANT: check against the content box, not the dialog's rect.
    const r = this.content.getBoundingClientRect()
    const inside =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom

    if (!inside) this.close()
  }

  private onCloseClick() {
    this.close()
  }

  private onKeyDown(e: KeyboardEvent) {
    if (!this.dlg.open) return
    if (e.key === 'Escape') this.close()
  }
}

// HMR‑safe define for Vite
if (!customElements.get('photo-modal')) {
  customElements.define('photo-modal', PhotoModal)
}

export default PhotoModal

// TS: let querySelector('photo-modal') return the right type
declare global {
  interface HTMLElementTagNameMap {
    'photo-modal': PhotoModal
  }
}
