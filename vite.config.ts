import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const viteConfigDir = dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        avatarUploadRules: resolve(viteConfigDir, 'avatar-upload-rules.html'),
        contacts: resolve(viteConfigDir, 'contacts.html'),
        main: resolve(viteConfigDir, 'index.html'),
        premiumTerms: resolve(viteConfigDir, 'premium-terms.html'),
        privacyPolicy: resolve(viteConfigDir, 'privacy-policy.html'),
        userAgreement: resolve(viteConfigDir, 'user-agreement.html'),
      },
    },
  },
})
