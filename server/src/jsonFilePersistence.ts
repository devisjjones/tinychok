import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function persistJsonFileValue<T>(filePath: string, value: T) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(value, null, 2))
}

type CoalescedJsonFilePersistenceOptions = {
  onWriteStart?: () => void
}

export function createCoalescedJsonFilePersistence<T>(
  filePath: string,
  options: CoalescedJsonFilePersistenceOptions = {},
) {
  let activeWrite: Promise<void> | null = null
  let pendingValue: T | null = null

  const flush = async (value: T): Promise<void> => {
    options.onWriteStart?.()
    await persistJsonFileValue(filePath, value)

    if (pendingValue !== null) {
      const nextValue = pendingValue
      pendingValue = null
      activeWrite = flush(nextValue)
      await activeWrite
      return
    }

    activeWrite = null
  }

  return async (value: T) => {
    if (activeWrite) {
      pendingValue = value
      await activeWrite
      return
    }

    activeWrite = flush(value)
    await activeWrite
  }
}
