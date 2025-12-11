import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Evita errores con process.env en el navegador
    'process.env': {} 
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})