import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
        avatarUploadRules: resolve(__dirname, 'avatar-upload-rules.html'),
        main: resolve(__dirname, 'index.html'),
        privacyPolicy: resolve(__dirname, 'privacy-policy.html'),
        userAgreement: resolve(__dirname, 'user-agreement.html'),
      },
    },
  },
})
