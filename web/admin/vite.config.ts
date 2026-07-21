import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const repoStaticAdmin = resolve(rootDir, '../../static/admin')

// Assets under /static/admin/ (existing Go static handler).
// Vue Router uses Hash mode (see src/router); only /admin shell is needed.
export default defineConfig({
  base: '/static/admin/',
  plugins: [
    vue(),
    {
      name: 'copy-to-repo-static-admin',
      closeBundle() {
        // Local/dev convenience: mirror dist -> ../../static/admin when path exists.
        try {
          const dist = resolve(rootDir, 'dist')
          if (!existsSync(dist)) return
          mkdirSync(repoStaticAdmin, { recursive: true })
          // empty then copy
          rmSync(repoStaticAdmin, { recursive: true, force: true })
          mkdirSync(repoStaticAdmin, { recursive: true })
          cpSync(dist, repoStaticAdmin, { recursive: true })
          console.log('[build] copied dist ->', repoStaticAdmin)
        } catch (e) {
          console.warn('[build] skip copy to repo static/admin:', e)
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/admin/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1500,
  },
})
