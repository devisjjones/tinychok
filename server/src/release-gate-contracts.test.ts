import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('release gate keeps lint and ui contracts inside the final local validation path', () => {
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
  ) as {
    scripts?: Record<string, string>
  }

  const testGate = packageJson.scripts?.['test:gate'] ?? ''
  const testUiContracts = packageJson.scripts?.['test:ui-contracts'] ?? ''

  assert.match(testGate, /npm run lint/u)
  assert.match(testGate, /npm run test:ui-contracts/u)
  assert.match(testGate, /npm run build:staging/u)
  assert.match(testUiContracts, /ui-runtime-regressions\.test\.ts/u)
  assert.match(testUiContracts, /release-gate-contracts\.test\.ts/u)
  assert.match(testUiContracts, /persisted-auth-storage\.test\.ts/u)
  assert.match(testUiContracts, /json-file-persistence\.test\.ts/u)
})
