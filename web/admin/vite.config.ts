import { resolve } from 'node:path';
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';

import { defineConfig } from './build/vite/index';

const repoStaticAdminSpa = resolve(import.meta.dirname, '../../static/admin-spa');

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      plugins: [
        {
          name: 'copy-to-repo-static-admin-spa',
          closeBundle() {
            try {
              const dist = resolve(import.meta.dirname, 'dist');
              if (!existsSync(dist)) return;
              rmSync(repoStaticAdminSpa, { recursive: true, force: true });
              mkdirSync(repoStaticAdminSpa, { recursive: true });
              cpSync(dist, repoStaticAdminSpa, { recursive: true });
              writeFileSync(resolve(repoStaticAdminSpa, '.admin-ui'), 'spa\n');
              console.log('[build] copied dist ->', repoStaticAdminSpa);
            } catch (e) {
              console.warn('[build] skip copy to repo static/admin-spa:', e);
            }
          },
        },
      ],
      resolve: {
        alias: {
          '@': resolve(import.meta.dirname, 'src'),
        },
      },
      server: {
        proxy: {
          '/admin/api': {
            changeOrigin: true,
            target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000',
          },
        },
      },
    },
  };
});
