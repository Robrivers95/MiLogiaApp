import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Permite que process.env.API_KEY pase desde el entorno del sistema al código del cliente
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    // Mantiene compatibilidad para otras referencias a process.env
    'process.env': {} 
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})