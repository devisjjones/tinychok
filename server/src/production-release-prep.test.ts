import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('production release prep keeps branch split, env contracts and deploy automation explicit', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const packageJson = readFileSync(join(repoRoot, 'package.json'), 'utf8')
  const stagingEnvExample = readFileSync(join(repoRoot, '.env.staging.example'), 'utf8')
  const productionEnvExample = readFileSync(join(repoRoot, '.env.production.example'), 'utf8')
  const productionDeployScript = readFileSync(join(repoRoot, 'scripts', 'deploy-production.sh'), 'utf8')
  const productionDistVerifier = readFileSync(join(repoRoot, 'scripts', 'verify-production-dist.mjs'), 'utf8')
  const releaseVerifier = readFileSync(join(repoRoot, 'scripts', 'verify-release-runtime.mjs'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const releaseContractsDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')
  const productionRunbook = readFileSync(join(repoRoot, 'docs', 'production-deploy-runbook.md'), 'utf8')
  const readinessChecklist = readFileSync(
    join(repoRoot, 'docs', 'production-readiness-checklist.md'),
    'utf8',
  )

  assert.ok(existsSync(join(repoRoot, 'scripts', 'deploy-production.sh')))
  assert.ok(existsSync(join(repoRoot, 'scripts', 'verify-production-dist.mjs')))
  assert.ok(existsSync(join(repoRoot, 'docs', 'production-deploy-runbook.md')))
  assert.ok(existsSync(join(repoRoot, 'docs', 'production-readiness-checklist.md')))

  assert.match(packageJson, /"deploy:production": "bash scripts\/deploy-production\.sh"/u)
  assert.match(
    packageJson,
    /"build:production": "tsc -b && npm run build:server && npm run build:frontend:production && npm run verify:production-dist"/u,
  )
  assert.match(
    packageJson,
    /"build:frontend:production": "VITE_API_BASE_URL=https:\/\/api\.tinychok\.ru VITE_WS_BASE_URL=wss:\/\/api\.tinychok\.ru vite build"/u,
  )
  assert.match(packageJson, /"verify:production-dist": "node scripts\/verify-production-dist\.mjs"/u)
  assert.match(
    packageJson,
    /"verify:production-runtime": "node scripts\/verify-release-runtime\.mjs --client-config-url https:\/\/api\.tinychok\.ru\/api\/client-config --health-url https:\/\/api\.tinychok\.ru\/healthz --ready-url https:\/\/api\.tinychok\.ru\/readyz --require-analytics --expected-analytics-provider \$\{TINYCHOK_EXPECTED_ANALYTICS_PROVIDER:-log\} --forbid-metrica-counter-id 108249405 --expected-ready-environment production --expected-admin-environment production --expected-public-app-url https:\/\/tinychok\.ru --expected-public-api-url https:\/\/api\.tinychok\.ru --expected-captcha-provider smartcaptcha --require-trust-proxy"/u,
  )

  for (const envSource of [stagingEnvExample, productionEnvExample]) {
    assert.match(envSource, /PUBLIC_ADMIN_STAGING_URL=https:\/\/admin\.staging\.tinychok\.ru/u)
    assert.match(envSource, /PUBLIC_ADMIN_PRODUCTION_URL=https:\/\/admin\.tinychok\.ru/u)
    assert.match(envSource, /ADMIN_STAGING_HOST=admin\.staging\.tinychok\.ru/u)
    assert.match(envSource, /ADMIN_PRODUCTION_HOST=admin\.tinychok\.ru/u)
    assert.match(envSource, /TINYCHOK_TRUST_PROXY=true/u)
    assert.match(envSource, /SMS_OTP_LENGTH=4/u)
  }

  assert.match(stagingEnvExample, /ADMIN_PANEL_ENABLED=true/u)
  assert.match(stagingEnvExample, /SMS_OTP_TEST_MODE=true/u)
  assert.match(productionEnvExample, /ADMIN_PANEL_ENABLED=false/u)
  assert.match(productionEnvExample, /SMS_OTP_TEST_MODE=false/u)

  assert.match(productionDeployScript, /BRANCH="\$\{TINYCHOK_PRODUCTION_BRANCH:-codex\/global-release-prep\}"/u)
  assert.match(productionDeployScript, /Production deploy requires a clean commit-backed worktree\./u)
  assert.match(productionDeployScript, /npm run build:production/u)
  assert.match(productionDeployScript, /https:\/\/api\.tinychok\.ru\/api\/client-config/u)
  assert.match(productionDeployScript, /--forbid-metrica-counter-id/u)
  assert.match(productionDeployScript, /https:\/\/tinychok\.ru/u)

  assert.match(productionDistVerifier, /const productionApiBaseUrl = 'https:\/\/api\.tinychok\.ru'/u)
  assert.match(productionDistVerifier, /const productionWsBaseUrl = 'wss:\/\/api\.tinychok\.ru'/u)
  assert.match(productionDistVerifier, /Production dist verification failed/u)
  assert.match(productionDistVerifier, /dedicated api\.tinychok\.ru host/u)

  assert.match(releaseVerifier, /expected-ready-environment/u)
  assert.match(releaseVerifier, /expected-admin-environment/u)
  assert.match(releaseVerifier, /expected-public-app-url/u)
  assert.match(releaseVerifier, /expected-public-api-url/u)
  assert.match(releaseVerifier, /expected-captcha-provider/u)
  assert.match(releaseVerifier, /require-trust-proxy/u)
  assert.match(releaseVerifier, /must not reuse/u)

  assert.match(handoffDoc, /## Release Branch Strategy/u)
  assert.match(handoffDoc, /`codex\/global-release-prep`/u)
  assert.match(handoffDoc, /docs\/production-deploy-runbook\.md/u)
  assert.match(handoffDoc, /docs\/production-readiness-checklist\.md/u)
  assert.match(handoffDoc, /npm run build:production/u)
  assert.match(handoffDoc, /npm run verify:production-runtime/u)

  assert.match(releaseContractsDoc, /### 1\.1\. Production Build Contract/u)
  assert.match(releaseContractsDoc, /npm run build:production/u)
  assert.match(releaseContractsDoc, /`codex\/staging-deploy` остаётся staging-only/u)
  assert.match(releaseContractsDoc, /`readyz\.environment = production`/u)
  assert.match(releaseContractsDoc, /`server\.trustProxy = true`/u)

  assert.match(productionRunbook, /# Production Deploy Runbook/u)
  assert.match(productionRunbook, /codex\/global-release-prep/u)
  assert.match(productionRunbook, /api\.tinychok\.ru/u)
  assert.match(productionRunbook, /tinychok\.com/u)
  assert.match(readinessChecklist, /# Production Readiness Checklist/u)
  assert.match(readinessChecklist, /tinychok-prod/u)
  assert.match(readinessChecklist, /Managed PostgreSQL/u)
  assert.match(readinessChecklist, /SMS_RU_BASE_URL=https:\/\/sms\.ru/u)
})
