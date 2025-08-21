export type PhotoPayload = {
  src: string // fallback if no srcset
  srcset?: string // copy from preferred <source>
  sizes?: string // modal rule, e.g. '(min-width:1600px) 1600px, 96vw'
  alt?: string

  date?: string
  camera?: string
  film?: string
  description?: string

  placeholder?: string // tiny blur data URL (keep using data-placeholder)
}

class PhotoModal extends HTMLElement {
  private root: ShadowRoot
  private dlg!: HTMLDialogElement
  private closeBtn!: HTMLButtonElement

  private container!: HTMLElement
  private ph!: HTMLImageElement
  private img!: HTMLImageElement

  private titleEl!: HTMLElement
  private cameraEl!: HTMLElement
  private filmEl!: HTMLElement
  private descEl!: HTMLElement

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })

    this.root.innerHTML = `
        <dialog id="dlg" aria-labelledby="title">
          <button id="close" class="btn-close" aria-label="Close">&times;</button>
  
          <figure class="card">
            <div class="image-container" id="stage">
              <img id="ph" class="placeholder" alt="">
              <div class="backdrop-blur"></div>
              <img id="img" class="full" alt="" decoding="async">
            </div>
  
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
          /* Dialog shell */
          #dlg { border: 0; padding: 0; background: transparent; width: fit-content; }
          #dlg::backdrop { backdrop-filter: blur(8px); background: rgba(0,0,0,.35); }
  
          .card {
            margin: 0; display: grid; grid-template-rows: 1fr auto; gap: .5rem;
            background: rgba(255,255,255,.92); border-radius: 16px; overflow: hidden;
            box-shadow: 0 10px 40px rgba(0,0,0,.35);
          }
  
          .image-container { position: relative; width: min(96vw,1250px); aspect-ratio: 3 / 2 }
          .image-container::before { content: ""; display: block; width: 100%; } /* aspect box via inline aspect-ratio */
  
          .image-container > img,
          .image-container > .backdrop-blur {
            position: absolute; inset: 0; width: 100%; height: 100%;
          }
  
          .placeholder {
            object-fit: cover;
            filter: blur(16px);
            transform: scale(1.03);
            transition: opacity 180ms ease-out;
          }
  
          .backdrop-blur {
            pointer-events: none;
            /* If you use more fancy styles on your site, mirror them here */
            background: transparent;
          }
  
          .full {
            opacity: 0;
            transition: opacity 180ms ease-out;
          }
  
          /* When main is ready, fade it in and hide placeholder */
          .ready .full { opacity: 1; }
          .ready .placeholder { opacity: 0; }
  
          /* Caption */
          .cap { padding: .75rem 1rem 1rem; color:#000; font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
          .row.primary { display:flex; flex-wrap:wrap; gap:.5rem; align-items:baseline; font-size:.95rem; }
          .row.secondary { margin-top:.25rem; color:#444; }
          .dot { opacity:.4; }
  
          /* Close button */
          .btn-close {
            position: absolute; top: .5rem; right: .5rem;
            border: 0; cursor: pointer; width: 2.25rem; height: 2.25rem; border-radius: 999px;
            background: rgba(0,0,0,.55); color: #fff; font-size: 1.5rem; line-height: 1;
            z-index: 3;
          }
          .btn-close:focus { outline: 2px solid #fff; outline-offset: 2px; }
        </style>
      `

    // refs
    this.dlg = this.root.querySelector('#dlg') as HTMLDialogElement
    this.closeBtn = this.root.querySelector('#close') as HTMLButtonElement
    this.container = this.root.querySelector('#stage') as HTMLElement
    this.ph = this.root.querySelector('#ph') as HTMLImageElement
    this.img = this.root.querySelector('#img') as HTMLImageElement
    this.titleEl = this.root.querySelector('#title') as HTMLElement
    this.cameraEl = this.root.querySelector('.camera') as HTMLElement
    this.filmEl = this.root.querySelector('.film') as HTMLElement
    this.descEl = this.root.querySelector('.desc') as HTMLElement

    // binds
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

  /** Open with payload (matches your page behavior) */
  openWith(p: PhotoPayload) {
    // Reset state
    this.container.classList.remove('ready')
    this.img.removeAttribute('src')
    this.img.removeAttribute('srcset')
    this.img.removeAttribute('sizes')

    // Placeholder blur
    if (p.placeholder) {
      this.ph.src = p.placeholder
      this.ph.style.display = ''
    } else {
      this.ph.removeAttribute('src')
      this.ph.style.display = 'none'
    }

    // Metadata
    this.img.alt = p.alt ?? ''
    this.titleEl.textContent = p.date ?? ''
    this.cameraEl.textContent = p.camera ?? '—'
    this.filmEl.textContent = p.film ?? '—'
    this.descEl.textContent = p.description ?? ''

    // Fade-in when the full image is ready
    const onLoad = () => {
      this.container.classList.add('ready')
      this.img.removeEventListener('load', onLoad)
    }
    this.img.addEventListener('load', onLoad, { once: true })

    // Source order to avoid double download:
    if (p.srcset) {
      if (p.sizes) this.img.sizes = p.sizes // set sizes first
      this.img.srcset = p.srcset // then srcset (browser picks one)
    } else {
      this.img.src = p.src
    }

    if (!this.dlg.open) this.dlg.showModal()
  }

  /** Simple open/close helpers */
  open() {
    if (!this.dlg.open) this.dlg.showModal()
  }
  close() {
    if (this.dlg.open) this.dlg.close()
    this.container.classList.remove('ready')
    this.img.removeAttribute('src')
    this.img.removeAttribute('srcset')
    this.img.removeAttribute('sizes')
    this.ph.removeAttribute('src')
  }

  /** Close when clicking outside the content card */
  private onBackdropClick(e: MouseEvent) {
    // check vs *content* box so clicks inside don't close
    const r = this.container.getBoundingClientRect()
    const inside =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!inside) this.close()
  }
  private onCloseClick() {
    this.close()
  }
  private onKeyDown(e: KeyboardEvent) {
    if (this.dlg.open && e.key === 'Escape') this.close()
  }
}

// HMR-safe define
if (!customElements.get('photo-modal')) customElements.define('photo-modal', PhotoModal)
export default PhotoModal

declare global {
  interface HTMLElementTagNameMap {
    'photo-modal': PhotoModal
  }
}
