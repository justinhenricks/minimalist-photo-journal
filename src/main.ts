import './components/photo-modal.ts'
import { initPhotoClicks } from './lib/initPhotoClicks'

document.addEventListener('DOMContentLoaded', () => {
  initPhotoClicks('.photo-clickable', 'photo-modal')
})
