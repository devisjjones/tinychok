import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('support settings back exits settings instead of bouncing through an intermediate profile step', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')

  assert.match(
    appSource,
    /const handleSupportSettingsBack = useCallback\(\(\) => \{[\s\S]*?setSupportError\(''\)[\s\S]*?leaveSettingsToMain\(\)[\s\S]*?\}, \[leaveSettingsToMain\]\)/u,
  )
})
