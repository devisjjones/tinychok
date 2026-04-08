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

function createAccount(
  identifier: string,
  options?: {
    staffRole?: 'owner' | 'moderator' | 'support'
  },
) {
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
    staffRole: options?.staffRole,
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

test('support tickets start from 0 and increment globally', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const firstUser = createAccount('+79991110001')
  const secondUser = createAccount('+79991110002')

  database.accounts.push(firstUser, secondUser)
  const firstToken = createSession(database, firstUser.identifier, 'support-first')
  const secondToken = createSession(database, secondUser.identifier, 'support-second')

  const firstResponse = await store.sendSupportTicket(firstToken, {
    text: 'Первое обращение в поддержку',
  })
  const secondResponse = await store.sendSupportTicket(secondToken, {
    text: 'Второе обращение в поддержку',
  })

  assert.equal(firstResponse.snapshot.supportTickets[0]?.id, 0)
  assert.equal(firstResponse.snapshot.supportTickets[0]?.status, 'open')
  assert.equal(secondResponse.snapshot.supportTickets[0]?.id, 1)
  assert.equal(secondResponse.snapshot.supportTickets[0]?.status, 'open')
  assert.equal(database.nextSupportTicketNumber, 2)
})

test('admin sees brand-new support tickets as new until opening the card, then they become open', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const user = createAccount('+79991110008')
  const supportStaff = createAccount('+79991110009', { staffRole: 'support' })
  database.accounts.push(user, supportStaff)
  const userToken = createSession(database, user.identifier, 'support-new-user')
  const supportToken = createSession(database, supportStaff.identifier, 'support-new-staff')

  await store.sendSupportTicket(userToken, {
    text: 'Совсем новое обращение',
  })

  const listedBeforeOpen = store.adminListSupportTickets('')
  assert.equal(listedBeforeOpen[0]?.status, 'new')

  const detail = await store.adminGetSupportTicket(supportToken, 0)
  assert.equal(detail.status, 'open')
  assert.ok(database.supportTickets[0]?.openedByStaffAt)

  const listedAfterOpen = store.adminListSupportTickets('')
  assert.equal(listedAfterOpen[0]?.status, 'open')
})

test('support ticket cooldown blocks new root tickets but still allows comments in existing ticket', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const user = createAccount('+79991110003')
  database.accounts.push(user)
  const token = createSession(database, user.identifier, 'support-cooldown')

  const firstResponse = await store.sendSupportTicket(token, {
    text: 'Нужна помощь с первой проблемой',
  })
  const firstTicketId = firstResponse.snapshot.supportTickets[0]?.id
  assert.equal(firstTicketId, 0)
  assert.ok(firstResponse.snapshot.supportTicketCooldownUntil)

  await assert.rejects(
    () => store.sendSupportTicket(token, { text: 'Слишком быстрое второе обращение' }),
    /рано открывать/u,
  )

  const commentResponse = await store.sendSupportTicketComment(token, firstTicketId!, {
    text: 'Добавляю подробности к предыдущему обращению',
  })
  assert.equal(commentResponse.snapshot.supportTickets[0]?.comments.length, 1)
  assert.equal(commentResponse.snapshot.supportTickets[0]?.status, 'open')
})

test('support replies stay in ticket comments and unread resets after opening the thread', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const user = createAccount('+79991110004')
  const supportStaff = createAccount('+79991110005', { staffRole: 'support' })
  database.accounts.push(user, supportStaff)
  const userToken = createSession(database, user.identifier, 'support-user')
  const supportToken = createSession(database, supportStaff.identifier, 'support-staff')

  const ticketResponse = await store.sendSupportTicket(userToken, {
    text: 'Проблема с подпиской',
  })
  const ticketId = ticketResponse.snapshot.supportTickets[0]?.id
  assert.equal(ticketId, 0)

  const adminReply = await store.adminReplySupportTicket(supportToken, ticketId!, {
    status: 'needs_confirmation',
    text: 'Мы уже смотрим ваше обращение',
  })
  assert.deepEqual(adminReply.broadcastIdentifiers, [user.identifier])
  assert.equal(adminReply.ticket.status, 'needs_confirmation')

  const unreadSnapshot = store.getSnapshotByToken(userToken)
  assert.equal(unreadSnapshot?.supportUnreadCount, 1)
  assert.equal(unreadSnapshot?.supportTickets[0]?.comments.length, 1)
  assert.equal(unreadSnapshot?.supportTickets[0]?.status, 'needs_confirmation')
  assert.equal(unreadSnapshot?.supportTickets[0]?.text, 'Проблема с подпиской')

  const userComment = await store.sendSupportTicketComment(userToken, ticketId!, {
    text: 'Добавляю новую информацию по проблеме',
  })
  assert.equal(userComment.snapshot.supportTickets[0]?.status, 'needs_confirmation')

  const readResponse = await store.markSupportTicketRead(userToken, ticketId!)
  assert.equal(readResponse.snapshot.supportUnreadCount, 0)
  assert.equal(readResponse.snapshot.supportTickets[0]?.unreadCount, 0)
})

test('admin support ticket list sorts by support status priority before freshness', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const user = createAccount('+79991110006')
  const supportStaff = createAccount('+79991110007', { staffRole: 'support' })
  database.accounts.push(user, supportStaff)
  const userToken = createSession(database, user.identifier, 'support-sort-user')
  const supportToken = createSession(database, supportStaff.identifier, 'support-sort-staff')

  const first = await store.sendSupportTicket(userToken, { text: 'Первый тикет' })
  database.supportTickets[0]!.createdAt = '2026-04-01T00:00:00.000Z'
  database.supportTickets[0]!.updatedAt = '2026-04-01T00:00:00.000Z'

  await store.sendSupportTicketComment(userToken, first.snapshot.supportTickets[0]!.id, {
    text: 'подробности',
  })
  await store.adminReplySupportTicket(supportToken, first.snapshot.supportTickets[0]!.id, {
    status: 'resolved',
    text: 'Решили вопрос',
  })

  database.supportTickets[0]!.updatedAt = '2026-04-01T00:10:00.000Z'

  database.supportTickets.push({
    comments: [],
    createdAt: '2026-04-01T00:01:00.000Z',
    id: 1,
    openedByStaffAt: '2026-04-01T00:01:30.000Z',
    ownerIdentifier: user.identifier,
    status: 'open',
    text: 'Открытый тикет',
    threadId: 'support:1',
    time: '00:01',
    updatedAt: '2026-04-01T00:01:00.000Z',
  })
  database.supportTickets.push({
    comments: [],
    createdAt: '2026-04-01T00:02:00.000Z',
    id: 2,
    openedByStaffAt: '2026-04-01T00:02:30.000Z',
    ownerIdentifier: user.identifier,
    status: 'reopened',
    text: 'Переоткрытый тикет',
    threadId: 'support:2',
    time: '00:02',
    updatedAt: '2026-04-01T00:02:00.000Z',
  })
  database.supportTickets.push({
    comments: [],
    createdAt: '2026-04-01T00:03:00.000Z',
    id: 3,
    openedByStaffAt: '2026-04-01T00:03:30.000Z',
    ownerIdentifier: user.identifier,
    status: 'needs_confirmation',
    text: 'Требует подтверждения',
    threadId: 'support:3',
    time: '00:03',
    updatedAt: '2026-04-01T00:03:00.000Z',
  })
  database.supportTickets.push({
    comments: [],
    createdAt: '2026-04-01T00:04:00.000Z',
    id: 4,
    ownerIdentifier: user.identifier,
    status: 'open',
    text: 'Совсем новый тикет',
    threadId: 'support:4',
    time: '00:04',
    updatedAt: '2026-04-01T00:04:00.000Z',
  })
  database.nextSupportTicketNumber = 5

  const listedTickets = store.adminListSupportTickets('')
  assert.deepEqual(listedTickets.map((ticket) => [ticket.ticketNumber, ticket.status]), [
    [4, 'new'],
    [1, 'open'],
    [2, 'reopened'],
    [3, 'needs_confirmation'],
    [0, 'resolved'],
  ])
})
