import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves under /<repo>/
export default defineConfig({
  plugins: [react()],
  base: '/POOLS/',
})
