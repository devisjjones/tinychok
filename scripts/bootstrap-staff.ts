import type { StaffRole } from '../src/shared/types'
import { createStore } from '../server/src/store-factory'

function printUsage() {
  console.error('Usage: npm run bootstrap:staff -- <identifier> <owner|moderator|support>')
}

function readStaffRole(value: string | undefined): StaffRole | null {
  if (value === 'owner' || value === 'moderator' || value === 'support') {
    return value
  }

  return null
}

const identifier = process.argv[2]?.trim()
const role = readStaffRole(process.argv[3]?.trim())

if (!identifier || !role) {
  printUsage()
  process.exit(1)
}

const { store } = await createStore()
const user = await store.bootstrapStaffRole(identifier, role)

console.info(`Staff role assigned: ${user.identifier} -> ${user.staffRole}`)
process.exit(0)
