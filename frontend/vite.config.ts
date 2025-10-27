import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'global': 'globalThis',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    alias: {
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['@ton/core', '@ton/ton', '@ton/crypto', 'buffer'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
})
