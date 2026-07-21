import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
// Built SPA lives beside the legacy multi-page admin (static/admin/*.html).
// Never overwrite static/admin — that tree is the production multi-page UI.
const repoStaticAdminSpa = resolve(rootDir, '../../static/admin-spa')

// Assets under /static/admin-spa/ (served by GET /static/{file...}).
// Vue Router uses Hash mode (see src/router); only /admin shell is needed.
export default defineConfig({
  base: '/static/admin-spa/',
  plugins: [
    vue(),
    {
      name: 'copy-to-repo-static-admin-spa',
      closeBundle() {
        try {
          const dist = resolve(rootDir, 'dist')
          if (!existsSync(dist)) return
          rmSync(repoStaticAdminSpa, { recursive: true, force: true })
          mkdirSync(repoStaticAdminSpa, { recursive: true })
          cpSync(dist, repoStaticAdminSpa, { recursive: true })
          writeFileSync(resolve(repoStaticAdminSpa, '.admin-ui'), 'spa\n')
          console.log('[build] copied dist ->', repoStaticAdminSpa)
        } catch (e) {
          console.warn('[build] skip copy to repo static/admin-spa:', e)
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
