import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { createCoalescedJsonFilePersistence } from './jsonFilePersistence'

test('coalesced json file persistence keeps only the latest queued snapshot during concurrent writes', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'tinychok-json-persist-'))
  const filePath = join(tempDir, 'db.json')
  let writeCount = 0

  try {
    const persist = createCoalescedJsonFilePersistence<{ version: number }>(filePath, {
      onWriteStart: () => {
        writeCount += 1
      },
    })

    await Promise.all([
      persist({ version: 1 }),
      persist({ version: 2 }),
      persist({ version: 3 }),
    ])

    const persistedRaw = await readFile(filePath, 'utf8')
    const persisted = JSON.parse(persistedRaw) as { version: number }

    assert.equal(persisted.version, 3)
    assert.equal(writeCount, 2)
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
