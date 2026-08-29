import { execSync } from 'child_process'
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function getBackendTarget(): string {
  if (process.env.VITE_BACKEND_URL) {
    return process.env.VITE_BACKEND_URL
  }
  if (process.platform !== 'win32') {
    try {
      const route = execSync('ip route show default 2>/dev/null', { encoding: 'utf8' })
      const match = route.match(/default via ([^\s]+)/)
      if (match && match[1]) {
        return `http://${match[1]}:8000`
      }
    } catch {}
  }
  return 'http://127.0.0.1:8000'
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: getBackendTarget(),
        changeOrigin: true,
      },
    },
  },
})


