import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const viteConfigDir = dirname(fileURLToPath(import.meta.url))

function resolveFrontendBuildId() {
  const explicitBuildId = process.env.TINYCHOK_BUILD_ID?.trim()
  if (explicitBuildId) {
    return explicitBuildId
  }

  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: viteConfigDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return '0.0.0'
  }
}

const frontendBuildId = resolveFrontendBuildId()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __TINYCHOK_FRONTEND_BUILD_ID__: JSON.stringify(frontendBuildId),
  },
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
        moderationRules: resolve(viteConfigDir, 'moderation-rules.html'),
        premiumTerms: resolve(viteConfigDir, 'premium-terms.html'),
        privacyPolicy: resolve(viteConfigDir, 'privacy-policy.html'),
        refundPolicy: resolve(viteConfigDir, 'refund-policy.html'),
        userAgreement: resolve(viteConfigDir, 'user-agreement.html'),
      },
    },
  },
})
