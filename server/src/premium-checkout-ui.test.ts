import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const repoRoot = process.cwd()

test('premium checkout UI stays wired to the real YooKassa redirect and return-status flow', () => {
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')

  assert.match(appSource, /createPremiumCheckoutRequest\(/u)
  assert.match(appSource, /fetchPremiumCheckoutStatusRequest\(/u)
  assert.match(appSource, /window\.location\.assign\(response\.checkoutUrl\)/u)
  assert.match(appSource, /new URLSearchParams\(window\.location\.search\)\.get\('premiumCheckout'\)/u)
  assert.match(appSource, /trackPremiumPurchaseSucceeded\(latestResponse\.purchase\.plan/u)
  assert.match(appSource, /const requiresReceiptEmail = \(errorMessage: string\) => \/\(email\|receipt\|чек\)\/iu\.test\(errorMessage\)/u)
  assert.match(appSource, /window\.prompt\('Укажите email для чека ЮKassa'/u)
  assert.doesNotMatch(appSource, /Реальная .* покупка пока не подключена/u)

  assert.match(backendSource, /\/api\/premium\/checkout/u)
  assert.match(backendSource, /\/api\/premium\/purchases\//u)
})
