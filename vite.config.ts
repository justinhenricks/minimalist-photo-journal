import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig(({ command }) => {
  return {
    plugins: [{
      name: 'inject-photos-grid',
      transformIndexHtml(html) {
        try {
          const grid = readFileSync(join(process.cwd(), 'src', '_photos-grid.html'), 'utf8')
          const hero = readFileSync(join(process.cwd(), 'src', '_hero.html'), 'utf8')
          let outHtml = html.replace('<!-- PHOTOS_GRID -->', grid)
          outHtml = outHtml.replace('<!-- HERO -->', hero)
          return outHtml
        } catch {
          return html
        }
      }
    }],
    server: { port: 3000 },
    build: { target: 'es2020', sourcemap: true }
  }
})