import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('password login turns generic captcha failures into the dedicated password captcha step', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')

  assert.match(appSource, /normalizePasswordLoginFailureMessage\(rawMessage\)/u)
  assert.match(appSource, /if \(shouldActivatePasswordLoginCaptcha\(rawMessage\)\) \{/u)
  assert.match(appSource, /setPasswordLoginCaptchaRequired\(true\)/u)
  assert.match(
    appSource,
    /onIdentifierChange=\{\(value\) => \{[\s\S]*setPasswordLoginCaptchaRequired\(false\)/u,
  )
})
