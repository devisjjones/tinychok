import assert from 'node:assert/strict'
import test from 'node:test'
import {
  coerceDatabasePayload,
  TinychokStore,
  type Database,
} from './store'

const originalConsoleInfo = console.info

function createStore() {
  const { database } = coerceDatabasePayload(undefined)
  return TinychokStore.create(database, async () => undefined)
}

function getStoreDatabase(store: TinychokStore) {
  return (store as unknown as Record<string, Database>)['database']
}

function createAccount(identifier: string) {
  return {
    accountId: `account_${identifier}`,
    avatarImage: undefined,
    archivedOriginalIdentifier: undefined,
    archivedProfile: undefined,
    blockedAt: undefined,
    blockedReason: undefined,
    blockedContactIds: [],
    createdAt: '2026-04-01T00:00:00.000Z',
    deletedAt: undefined,
    deletedBySelfService: undefined,
    deletionMode: undefined,
    displayName: `User ${identifier}`,
    gifLibrary: [],
    identifier,
    invisibilityEnabled: false,
    isTestEntity: false,
    lastActiveAt: '2026-04-01T00:00:00.000Z',
    nickname: '',
    passwordHash: undefined,
    passwordSetAt: undefined,
    premium: false,
    premiumExpiresAt: undefined,
    publicDeleted: undefined,
    quietModeEnabled: false,
    quietModeSettings: undefined,
    soundsDisabled: false,
    staffRole: undefined,
    status: '',
    surname: '',
  }
}

function createSession(database: Database, identifier: string, suffix: string) {
  const token = `session-${suffix}`
  database.sessions.push({
    createdAt: '2026-04-01T00:00:00.000Z',
    expiresAt: '2026-05-01T00:00:00.000Z',
    identifier,
    token,
  })
  return token
}

test.before(() => {
  console.info = () => undefined
})

test.after(() => {
  console.info = originalConsoleInfo
})

test('direct-chat online state requires live realtime presence instead of stored session rows', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const viewer = createAccount('+79992220001')
  const contact = createAccount('+79992220002')
  database.accounts.push(viewer, contact)

  const viewerToken = createSession(database, viewer.identifier, 'viewer')
  const contactToken = createSession(database, contact.identifier, 'contact')

  await store.openDirectDialog(viewerToken, { identifier: contact.identifier })

  let viewerChat = store.getSnapshotByToken(viewerToken)?.chats.find((chat) => chat.phone === contact.identifier)
  assert.equal(viewerChat?.online, false)
  assert.equal(viewerChat?.status, 'был(а) недавно в сети')

  store.markSessionLive(contactToken)
  viewerChat = store.getSnapshotByToken(viewerToken)?.chats.find((chat) => chat.phone === contact.identifier)
  assert.equal(viewerChat?.online, true)
  assert.equal(viewerChat?.status, 'в сети')

  store.markSessionOffline(contactToken)
  viewerChat = store.getSnapshotByToken(viewerToken)?.chats.find((chat) => chat.phone === contact.identifier)
  assert.equal(viewerChat?.online, false)
  assert.equal(viewerChat?.status, 'был(а) недавно в сети')
})

test('multiple live devices keep user online until the last live token disappears', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const viewer = createAccount('+79992220003')
  const contact = createAccount('+79992220004')
  database.accounts.push(viewer, contact)

  const viewerToken = createSession(database, viewer.identifier, 'viewer-multi')
  const contactPhoneToken = createSession(database, contact.identifier, 'contact-phone')
  const contactLaptopToken = createSession(database, contact.identifier, 'contact-laptop')
  await store.openDirectDialog(viewerToken, { identifier: contact.identifier })

  store.markSessionLive(contactPhoneToken)
  store.markSessionLive(contactLaptopToken)

  let viewerChat = store.getSnapshotByToken(viewerToken)?.chats.find((chat) => chat.phone === contact.identifier)
  assert.equal(viewerChat?.online, true)

  store.markSessionOffline(contactPhoneToken)
  viewerChat = store.getSnapshotByToken(viewerToken)?.chats.find((chat) => chat.phone === contact.identifier)
  assert.equal(viewerChat?.online, true)

  store.markSessionOffline(contactLaptopToken)
  viewerChat = store.getSnapshotByToken(viewerToken)?.chats.find((chat) => chat.phone === contact.identifier)
  assert.equal(viewerChat?.online, false)
})

test('server logout invalidates current token and clears online state immediately when it was the last live socket', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const viewer = createAccount('+79992220005')
  const contact = createAccount('+79992220006')
  database.accounts.push(viewer, contact)

  const viewerToken = createSession(database, viewer.identifier, 'viewer-logout')
  const contactToken = createSession(database, contact.identifier, 'contact-logout')
  await store.openDirectDialog(viewerToken, { identifier: contact.identifier })
  store.markSessionLive(contactToken)

  const logoutResponse = await store.logoutCurrentSession(contactToken)
  assert.equal(logoutResponse.ok, true)
  assert.equal(store.getIdentifierByToken(contactToken), null)

  const viewerChat = store.getSnapshotByToken(viewerToken)?.chats.find((chat) => chat.phone === contact.identifier)
  assert.equal(viewerChat?.online, false)
  assert.equal(viewerChat?.status, 'был(а) недавно в сети')
})
