import { defineConfig } from 'vite'

export default defineConfig(({ command }) => {
  return {
    server: { port: 3000 },
    build: { target: 'es2020', sourcemap: true }
  }
})