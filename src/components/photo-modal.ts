import { getPhotoPayloadFromImg } from '../lib/utilities'

export type PhotoPayload = {
  src: string // fallback if no srcset
  srcset?: string // copy from preferred <source>
  sizes?: string // modal rule, e.g. '(min-width:1600px) 1600px, 96vw'
  alt?: string

  date?: string
  camera?: string
  film?: string
  description?: string
  location?: string
  placeholder?: string // tiny blur data URL (keep using data-placeholder)
  curIndex: string
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
  private locationEl!: HTMLElement

  private curIndex!: number

  private decodedOnce

  // const decodedOnce = new Set<number>()

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })
    this.decodedOnce = new Set<number>()
    this.root.innerHTML = `
        <dialog id="dlg" aria-labelledby="title">
          <button id="close" class="btn-close" aria-label="Close">&times;</button>
  
          <figure class="card">
            <div class="image-container" id="stage">
              <img id="ph" class="placeholder" alt="">
              <div class="backdrop-blur"></div>
              <img id="img" alt="" decoding="async">
            </div>
  
            <figcaption class="cap">
              <div class="row primary">
                <span class="date"></span>
                <span class="desc"></span>
                <span class="location"></location>
              </div>
              <div class="row secondary">
                <span class="camera"></span>
                <span class="film"></span>
              </div>
            </figcaption>
          </figure>
        </dialog>
  
        <style>
          /* Dialog shell */
          #dlg { border: 0; padding: 0; background: transparent; width: fit-content; }
          #dlg::backdrop { backdrop-filter: blur(8px); background: rgba(0,0,0,.35); }
  
          .card {
            margin: 0; display: grid; grid-template-rows: 1fr auto;
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
            transition: opacity 260ms ease-out;
            will-change: opacity
          }
  
          /* When main is ready, fade it in and hide placeholder */
          .ready .full { 
            opacity: 1; 
            transition: opacity 260ms ease-out;
          }
          .ready .placeholder { opacity: 0; }
  
          /* Caption */
          .cap { padding: .75rem 1rem 1rem; color:#000; display: grid; gap: 0.25rem; font-size: 0.8rem; }
          .row.primary { display:flex; flex-wrap:wrap; gap:.5rem; align-items:baseline; font-weight: 600; }
          .row.secondary { font-style: italic; }
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
    this.titleEl = this.root.querySelector('.date') as HTMLElement
    this.cameraEl = this.root.querySelector('.camera') as HTMLElement
    this.filmEl = this.root.querySelector('.film') as HTMLElement
    this.descEl = this.root.querySelector('.desc') as HTMLElement
    this.locationEl = this.root.querySelector('.location') as HTMLElement

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

    console.log('p cure indec', p.curIndex)

    // Placeholder blur
    if (!this.decodedOnce.has(parseInt(p.curIndex)) && p.placeholder) {
      this.ph.src = p.placeholder
      this.ph.style.display = ''
    } else {
      console.log('ok no placeholder')
      this.ph.removeAttribute('src')
      this.ph.style.display = 'none'
    }

    // Metadata
    this.img.alt = p.alt ?? ''
    this.titleEl.textContent = `${p.date} // `
    this.cameraEl.textContent = p.camera ?? '—'
    this.filmEl.textContent = p.film ?? '—'
    this.descEl.textContent = `${p.description} //`
    this.locationEl.textContent = p.location ?? ''
    this.curIndex = parseInt(p.curIndex)

    // Fade-in when the full image is ready
    // const onLoad = () => {
    //   // INSERT_YOUR_CODE
    //   // setTimeout(() => {
    //   //   this.container.classList.add('ready')
    //   //   this.img.removeEventListener('load', onLoad)
    //   // }, 125)
    //   // return
    //   this.container.classList.add('ready')
    //   this.img.removeEventListener('load', onLoad)
    // }
    // this.img.addEventListener('load', onLoad, { once: true })

    if (p.srcset) {
      if (p.sizes) this.img.sizes = p.sizes // set sizes first
      this.img.srcset = p.srcset // then srcset (browser picks one)
    } else {
      this.img.src = p.src
    }

    console.log('this.decodedOnce', this.decodedOnce)

    if (this.decodedOnce.has(this.curIndex)) {
      // force a frame before enabling ready so opacity animates
      requestAnimationFrame(() => {
        console.log('adding ready')
        this.container.classList.add('ready')
      })
    } else {
      // Make sure we fade only after the image is actually decodable
      // (works for cached and networked images)
      this.img
        .decode()
        .then(() => {
          this.decodedOnce.add(this.curIndex)
          requestAnimationFrame(() => {
            this.container.classList.add('ready')
          })
        })
        .catch(() => {
          // Fallback: if decode failed (rare), still reveal on load
          const onLoad = () => {
            this.decodedOnce.add(this.curIndex)
            this.container.classList.add('ready')
            this.img.removeEventListener('load', onLoad)
          }
          this.img.addEventListener('load', onLoad, { once: true })
        })
    }

    if (!this.dlg.open) {
      this.dlg.showModal()
      document.body.style.overflow = 'hidden'
    }
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
    document.body.style.overflow = ''
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

    if (this.dlg.open && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      let img
      let modalPhotoPayload
      switch (e.key) {
        case 'ArrowLeft':
          console.log('arrow left index', this.curIndex)
          if (this.curIndex === 0) return

          img = document.querySelector(`img[data-index="${this.curIndex - 1}"]`) as HTMLImageElement
          modalPhotoPayload = getPhotoPayloadFromImg(img)

          this.openWith(modalPhotoPayload)
          break
        case 'ArrowRight':
          console.log('arrow right index', this.curIndex)
          img = document.querySelector(`img[data-index="${this.curIndex + 1}"]`) as HTMLImageElement
          if (!img) return null
          modalPhotoPayload = getPhotoPayloadFromImg(img)

          this.openWith(modalPhotoPayload)
          break
      }
    }
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
