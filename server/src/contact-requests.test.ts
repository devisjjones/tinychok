import assert from 'node:assert/strict'
import test from 'node:test'
import { strFromU8, unzipSync } from 'fflate'
import {
  coerceDatabasePayload,
  TinychokStore,
  type Database,
} from './store'
import { hashPassword } from './auth-security'

const originalConsoleInfo = console.info

function createStore() {
  const { database } = coerceDatabasePayload(undefined)
  return TinychokStore.create(database, async () => undefined)
}

function getStoreDatabase(store: TinychokStore) {
  return (store as unknown as Record<string, Database>)['database']
}

function createAccount(identifier: string): Database['accounts'][number] {
  return {
    accountId: `account_${identifier}`,
    avatarImage: undefined,
    archivedOriginalIdentifier: undefined,
    archivedProfile: undefined,
    blockedAt: undefined,
    blockedReason: undefined,
    blockedContactIds: [],
    createdAt: '2026-03-29T00:00:00.000Z',
    deletedAt: undefined,
    deletedBySelfService: undefined,
    deletionMode: undefined,
    displayName: `User ${identifier}`,
    gifLibrary: [],
    identifier,
    isTestEntity: false,
    lastActiveAt: '2026-03-29T00:00:00.000Z',
    nickname: '',
    passwordHash: undefined,
    passwordSetAt: undefined,
    premium: false,
    premiumExpiresAt: undefined,
    publicDeleted: undefined,
    quietModeEnabled: false,
    soundsDisabled: false,
    staffRole: undefined,
    status: '',
    surname: '',
  }
}

function createSession(database: Database, identifier: string, suffix: string) {
  const token = `session-${suffix}`
  database.sessions.push({
    createdAt: '2026-03-29T00:00:00.000Z',
    expiresAt: '2026-04-28T00:00:00.000Z',
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

test('pending contact request keeps direct room blank for recipient and blocks direct messaging until accept', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const requester = createAccount('+79990100001')
  const recipient = createAccount('+79990100002')

  database.accounts.push(requester, recipient)
  const requesterToken = createSession(database, requester.identifier, 'requester')
  const recipientToken = createSession(database, recipient.identifier, 'recipient')

  const dialogResponse = await store.openDirectDialog(requesterToken, { identifier: recipient.identifier })
  const requesterChatBefore = store.getSnapshotByToken(requesterToken)?.chats.find(
    (chat) => chat.id === dialogResponse.dialogId,
  )
  assert.equal(requesterChatBefore?.contactState, 'none')

  await store.sendContactRequest(requesterToken, { identifier: recipient.identifier })

  const requesterSnapshotAfter = store.getSnapshotByToken(requesterToken)
  const requesterChatAfter = requesterSnapshotAfter?.chats.find(
    (chat) => chat.id === dialogResponse.dialogId,
  )
  assert.equal(requesterChatAfter?.contactState, 'pending-outgoing')
  assert.equal(requesterChatAfter?.hidden, true)
  assert.equal(
    requesterSnapshotAfter?.outgoingContactRequests.some((request) => request.identifier === recipient.identifier),
    true,
  )
  assert.equal(
    requesterSnapshotAfter?.chats.some(
      (chat) => chat.phone === recipient.identifier && !chat.hidden,
    ),
    false,
  )

  const recipientSnapshot = store.getSnapshotByToken(recipientToken)
  assert.equal(
    recipientSnapshot?.contactRequests.some((request) => request.identifier === requester.identifier),
    true,
  )
  assert.equal(
    recipientSnapshot?.chats.some((chat) => chat.phone === requester.identifier && !chat.hidden),
    false,
  )

  const reopenedPendingRoom = await store.openDirectDialog(requesterToken, {
    identifier: recipient.identifier,
  })
  assert.equal(reopenedPendingRoom.dialogId, dialogResponse.dialogId)

  await assert.rejects(
    () =>
      store.sendDirectMessage(requesterToken, dialogResponse.dialogId, {
        text: 'Привет без подтверждения',
      }),
    /Сначала отправьте запрос на контакт/u,
  )
})

test('accepting contact request creates canonical chats and system message with unread for requester', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const requester = createAccount('+79990100011')
  const recipient = createAccount('+79990100012')

  database.accounts.push(requester, recipient)
  const requesterToken = createSession(database, requester.identifier, 'accept-requester')
  const recipientToken = createSession(database, recipient.identifier, 'accept-recipient')

  await store.openDirectDialog(requesterToken, { identifier: recipient.identifier })
  await store.sendContactRequest(requesterToken, { identifier: recipient.identifier })
  await store.acceptContactRequest(recipientToken, requester.identifier)

  const requesterSnapshot = store.getSnapshotByToken(requesterToken)
  const recipientSnapshot = store.getSnapshotByToken(recipientToken)
  const requesterChat = requesterSnapshot?.chats.find((chat) => chat.phone === recipient.identifier)
  const recipientChat = recipientSnapshot?.chats.find((chat) => chat.phone === requester.identifier)

  assert.equal(requesterChat?.contactState, 'accepted')
  assert.equal(recipientChat?.contactState, 'accepted')
  assert.equal(requesterChat?.messages.at(-1)?.system, true)
  assert.equal(requesterChat?.messages.at(-1)?.text, 'Контакт установлен')
  assert.equal(recipientChat?.messages.at(-1)?.text, 'Контакт установлен')
  assert.equal(requesterChat?.unread, 1)
  assert.equal(recipientSnapshot?.contactRequests.length, 0)

  await assert.doesNotReject(() =>
    store.sendDirectMessage(requesterToken, requesterChat!.id, {
      text: 'Теперь можно писать',
    }),
  )
})

test('reject resets pending contact request and allows sending it again', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const requester = createAccount('+79990100021')
  const recipient = createAccount('+79990100022')

  database.accounts.push(requester, recipient)
  const requesterToken = createSession(database, requester.identifier, 'reject-requester')
  const recipientToken = createSession(database, recipient.identifier, 'reject-recipient')

  const dialogResponse = await store.openDirectDialog(requesterToken, { identifier: recipient.identifier })
  await store.sendContactRequest(requesterToken, { identifier: recipient.identifier })
  await store.rejectContactRequest(recipientToken, requester.identifier)

  const requesterChat = store.getSnapshotByToken(requesterToken)?.chats.find(
    (chat) => chat.id === dialogResponse.dialogId,
  )
  assert.equal(requesterChat?.contactState, 'none')
  assert.equal(requesterChat?.hidden, true)

  await assert.doesNotReject(() =>
    store.sendContactRequest(requesterToken, { identifier: recipient.identifier }),
  )
})

test('cancel removes outgoing and incoming pending requests and reopens send CTA in hidden room', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const requester = createAccount('+79990100023')
  const recipient = createAccount('+79990100024')

  database.accounts.push(requester, recipient)
  const requesterToken = createSession(database, requester.identifier, 'cancel-requester')
  const recipientToken = createSession(database, recipient.identifier, 'cancel-recipient')

  const dialogResponse = await store.openDirectDialog(requesterToken, { identifier: recipient.identifier })
  await store.sendContactRequest(requesterToken, { identifier: recipient.identifier })
  await store.cancelContactRequest(requesterToken, recipient.identifier)

  const requesterSnapshot = store.getSnapshotByToken(requesterToken)
  const recipientSnapshot = store.getSnapshotByToken(recipientToken)
  const requesterChat = requesterSnapshot?.chats.find((chat) => chat.id === dialogResponse.dialogId)

  assert.equal(requesterChat?.contactState, 'none')
  assert.equal(requesterChat?.hidden, true)
  assert.equal(requesterSnapshot?.outgoingContactRequests.length, 0)
  assert.equal(recipientSnapshot?.contactRequests.length, 0)
  assert.equal(
    requesterSnapshot?.chats.some((chat) => chat.phone === recipient.identifier && !chat.hidden),
    false,
  )
  assert.equal(
    recipientSnapshot?.chats.some((chat) => chat.phone === requester.identifier && !chat.hidden),
    false,
  )
})

test('block prevents future contact requests and surfaces blocked-by-peer state to requester', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const requester = createAccount('+79990100031')
  const recipient = createAccount('+79990100032')

  database.accounts.push(requester, recipient)
  const requesterToken = createSession(database, requester.identifier, 'block-requester')
  const recipientToken = createSession(database, recipient.identifier, 'block-recipient')

  const dialogResponse = await store.openDirectDialog(requesterToken, { identifier: recipient.identifier })
  await store.sendContactRequest(requesterToken, { identifier: recipient.identifier })
  await store.blockContactRequest(recipientToken, requester.identifier)

  const requesterChat = store.getSnapshotByToken(requesterToken)?.chats.find(
    (chat) => chat.id === dialogResponse.dialogId,
  )
  assert.equal(requesterChat?.contactState, 'blocked-by-peer')
  assert.equal(requesterChat?.hidden, true)
  assert.equal(store.getSnapshotByToken(recipientToken)?.contactRequests.length, 0)

  await assert.rejects(
    () =>
      store.sendContactRequest(requesterToken, { identifier: recipient.identifier }),
    /Пользователь заблокировал контакт с вами/u,
  )
})

test('delete dialog history for everyone archives both direct copies instead of deleting them', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+79990100033')
  const right = createAccount('+79990100034')

  database.accounts.push(left, right)
  const leftToken = createSession(database, left.identifier, 'delete-all-left')
  const rightToken = createSession(database, right.identifier, 'delete-all-right')

  const opened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.sendDirectMessage(leftToken, opened.dialogId, {
    text: 'Удалить у всех',
  })

  const rightChatBefore = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  assert.ok(rightChatBefore)
  assert.equal(rightChatBefore?.messages.some((message) => message.text === 'Удалить у всех'), true)

  await store.deleteDialogHistory(leftToken, opened.dialogId, { scope: 'everyone' })

  const leftChatAfter = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === opened.dialogId)
  const rightChatAfter = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  assert.deepEqual(leftChatAfter?.messages, [])
  assert.deepEqual(rightChatAfter?.messages, [])

  const leftHistoryAfter = store.getDirectDialogHistory(leftToken, opened.dialogId, Number.MAX_SAFE_INTEGER)
  const rightHistoryAfter = store.getDirectDialogHistory(rightToken, rightChatBefore!.id, Number.MAX_SAFE_INTEGER)
  assert.deepEqual(leftHistoryAfter.messages, [])
  assert.deepEqual(rightHistoryAfter.messages, [])
  assert.equal(leftHistoryAfter.hasMore, false)
  assert.equal(rightHistoryAfter.hasMore, false)

  const archivedCopies = database.dialogMessages.filter((message) => message.text === 'Удалить у всех')
  assert.equal(archivedCopies.length, 2)
  assert.equal(archivedCopies.every((message) => Boolean(message.archivedAt)), true)
  assert.equal(archivedCopies.every((message) => message.archivedReason === 'delete-history-everyone'), true)
})

test('delete direct message for everyone archives both copies instead of deleting only the initiator copy', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+799901000341')
  const right = createAccount('+799901000351')

  database.accounts.push(left, right)
  const leftToken = createSession(database, left.identifier, 'delete-message-left')
  const rightToken = createSession(database, right.identifier, 'delete-message-right')

  const opened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.sendDirectMessage(leftToken, opened.dialogId, {
    text: 'Удалить одно сообщение у всех',
  })

  const leftChatBefore = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === opened.dialogId)
  const rightChatBefore = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  const leftMessage = leftChatBefore?.messages.find((message) => message.text === 'Удалить одно сообщение у всех')

  assert.ok(leftMessage)
  assert.equal(rightChatBefore?.messages.some((message) => message.text === 'Удалить одно сообщение у всех'), true)

  await store.deleteDialogMessage(leftToken, opened.dialogId, leftMessage!.id, { scope: 'everyone' })

  const leftChatAfter = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === opened.dialogId)
  const rightChatAfter = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)

  assert.equal(leftChatAfter?.messages.some((message) => message.text === 'Удалить одно сообщение у всех'), false)
  assert.equal(rightChatAfter?.messages.some((message) => message.text === 'Удалить одно сообщение у всех'), false)

  const archivedCopies = database.dialogMessages.filter(
    (message) => message.text === 'Удалить одно сообщение у всех',
  )
  assert.equal(archivedCopies.length, 2)
  assert.equal(archivedCopies.every((message) => Boolean(message.archivedAt)), true)
  assert.equal(archivedCopies.every((message) => message.archivedReason === 'delete-message-everyone'), true)
})

test('delete direct message for everyone rejects incoming messages and keeps both copies intact', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+799901000342')
  const right = createAccount('+799901000352')

  database.accounts.push(left, right)
  const leftToken = createSession(database, left.identifier, 'delete-incoming-left')
  const rightToken = createSession(database, right.identifier, 'delete-incoming-right')

  const opened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  const peerOpened = await store.openDirectDialog(rightToken, { identifier: left.identifier })
  await store.sendDirectMessage(rightToken, peerOpened.dialogId, {
    text: 'Чужое сообщение нельзя удалить у всех',
  })

  const leftChatBefore = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === opened.dialogId)
  const incomingMessage = leftChatBefore?.messages.find(
    (message) => message.text === 'Чужое сообщение нельзя удалить у всех',
  )

  assert.ok(incomingMessage)
  assert.equal(incomingMessage?.author, 'them')

  await assert.rejects(
    () => store.deleteDialogMessage(leftToken, opened.dialogId, incomingMessage!.id, { scope: 'everyone' }),
    /Удалить у всех можно только своё сообщение\./u,
  )

  const leftChatAfter = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === opened.dialogId)
  const rightChatAfter = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.id === peerOpened.dialogId)

  assert.equal(
    leftChatAfter?.messages.some((message) => message.text === 'Чужое сообщение нельзя удалить у всех'),
    true,
  )
  assert.equal(
    rightChatAfter?.messages.some((message) => message.text === 'Чужое сообщение нельзя удалить у всех'),
    true,
  )

  const preservedCopies = database.dialogMessages.filter(
    (message) => message.text === 'Чужое сообщение нельзя удалить у всех',
  )
  assert.equal(preservedCopies.length, 2)
  assert.equal(preservedCopies.every((message) => !message.archivedAt), true)
})

test('delete dialog history for me remains local and keeps the peer copy intact', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+79990100035')
  const right = createAccount('+79990100036')

  database.accounts.push(left, right)
  const leftToken = createSession(database, left.identifier, 'delete-me-left')
  const rightToken = createSession(database, right.identifier, 'delete-me-right')

  const opened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.sendDirectMessage(leftToken, opened.dialogId, {
    text: 'Удалить только у меня',
  })

  const rightChat = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  assert.ok(rightChat)

  await store.deleteDialogHistory(leftToken, opened.dialogId)

  const leftChatAfter = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === opened.dialogId)
  const rightChatAfter = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  assert.deepEqual(leftChatAfter?.messages, [])
  assert.equal(rightChatAfter?.messages.some((message) => message.text === 'Удалить только у меня'), true)

  const peerCopies = database.dialogMessages.filter((message) => message.text === 'Удалить только у меня')
  assert.equal(peerCopies.length, 2)
  const leftArchivedCopy = peerCopies.find((message) => message.ownerIdentifier === left.identifier)
  const rightVisibleCopy = peerCopies.find((message) => message.ownerIdentifier === right.identifier)
  assert.equal(leftArchivedCopy?.archivedReason, 'delete-history-me')
  assert.ok(leftArchivedCopy?.archivedAt)
  assert.equal(rightVisibleCopy?.archivedAt, undefined)
})

test('admin and legal direct exports keep a message after local delete on one side and delete-for-everyone on the other', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+799901000801')
  const right = createAccount('+799901000802')
  const staff = createAccount('+799901000899')
  staff.staffRole = 'owner'

  database.accounts.push(left, right, staff)
  const leftToken = createSession(database, left.identifier, 'retention-left')
  const rightToken = createSession(database, right.identifier, 'retention-right')
  const staffToken = createSession(database, staff.identifier, 'retention-staff')

  const opened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.sendDirectMessage(leftToken, opened.dialogId, {
    text: 'Retention-safe direct message',
  })

  const leftChatBefore = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === opened.dialogId)
  const rightChatBefore = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  const leftMessage = leftChatBefore?.messages.find((message) => message.text === 'Retention-safe direct message')
  const rightIncomingMessage = rightChatBefore?.messages.find((message) => message.text === 'Retention-safe direct message')
  assert.ok(leftMessage)
  assert.ok(rightIncomingMessage)

  await store.deleteDialogMessage(rightToken, rightChatBefore!.id, rightIncomingMessage!.id)
  await store.deleteDialogMessage(leftToken, opened.dialogId, leftMessage!.id, { scope: 'everyone' })

  const leftChatAfter = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === opened.dialogId)
  const rightChatAfter = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  assert.equal(leftChatAfter?.messages.some((message) => message.text === 'Retention-safe direct message'), false)
  assert.equal(rightChatAfter?.messages.some((message) => message.text === 'Retention-safe direct message'), false)

  const exportSharedKey = [left.identifier, right.identifier].sort().join('::')
  const dialogExport = await store.adminExportDialogCsv(staffToken, exportSharedKey, 'retention-review')
  assert.match(dialogExport.csv, /Retention-safe direct message/u)
  assert.match(dialogExport.csv, /Сообщение удалено пользователем у всех, но серверная запись сохранена/u)
  assert.match(dialogExport.csv, /delete-message-everyone/u)

  const legalExport = await store.adminExportLegalArchive(staffToken, {
    includeMedia: false,
    reason: 'retention-review',
    targetIdentifier: left.identifier,
  })
  const legalArchive = unzipSync(new Uint8Array(legalExport.buffer))
  const dialogJsonEntry = Object.entries(legalArchive).find(
    ([pathname]) => pathname.startsWith('dialogs/') && pathname.endsWith('.json'),
  )
  assert.ok(dialogJsonEntry)
  const dialogJson = JSON.parse(strFromU8(dialogJsonEntry![1]))
  assert.equal(
    dialogJson.messages.some((message: { text: string; archiveReason: string | null; retentionNote: string | null }) =>
      message.text === 'Retention-safe direct message' &&
      message.archiveReason === 'delete-message-everyone' &&
      message.retentionNote === 'Сообщение удалено пользователем у всех, но серверная запись сохранена.'),
    true,
  )
})

test('double local delete in direct keeps server-retained history but frees user-facing storage', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+799901000811')
  const right = createAccount('+799901000812')
  const staff = createAccount('+799901000813')
  staff.staffRole = 'owner'

  database.accounts.push(left, right, staff)
  const leftToken = createSession(database, left.identifier, 'double-local-left')
  const rightToken = createSession(database, right.identifier, 'double-local-right')
  const staffToken = createSession(database, staff.identifier, 'double-local-staff')

  const mediaUrl = '/uploads/attachments/retained-direct.png'
  database.pendingMediaUploads.push({
    createdAt: '2026-04-03T08:00:00.000Z',
    fileName: 'retained-direct.png',
    kind: 'attachment',
    linked: true,
    mediaUrl,
    mimeType: 'image/png',
    ownerIdentifier: left.identifier,
    size: 2048,
    storageKey: 'retained-direct',
  })

  const opened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.sendDirectMessage(leftToken, opened.dialogId, {
    attachment: {
      fileName: 'retained-direct.png',
      mediaUrl,
      mimeType: 'image/png',
      size: 2048,
    },
    text: 'Double local delete',
  })

  const leftChatBefore = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === opened.dialogId)
  const rightChatBefore = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  const leftMessage = leftChatBefore?.messages.find((message) => message.text === 'Double local delete')
  const rightIncomingMessage = rightChatBefore?.messages.find((message) => message.text === 'Double local delete')
  assert.ok(leftMessage)
  assert.ok(rightIncomingMessage)

  await store.deleteDialogMessage(rightToken, rightChatBefore!.id, rightIncomingMessage!.id)
  await store.deleteDialogMessage(leftToken, opened.dialogId, leftMessage!.id)

  const leftChatAfter = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === opened.dialogId)
  const rightChatAfter = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  assert.equal(leftChatAfter?.messages.some((message) => message.text === 'Double local delete'), false)
  assert.equal(rightChatAfter?.messages.some((message) => message.text === 'Double local delete'), false)

  const retainedCopies = database.dialogMessages.filter((message) => message.text === 'Double local delete')
  assert.equal(retainedCopies.length, 2)
  assert.equal(retainedCopies.every((message) => message.archivedReason === 'delete-message-me'), true)

  const leftSnapshotAfter = store.getSnapshotByToken(leftToken)
  assert.ok(leftSnapshotAfter)
  assert.ok(leftSnapshotAfter.session.storageUsage)
  assert.equal(leftSnapshotAfter.session.storageUsage.usedBytes, 0)
  assert.deepEqual(store.listUserStorageItems(leftToken).items.map((item) => item.mediaUrl), [])

  const dialogExport = await store.adminExportDialogCsv(
    staffToken,
    [left.identifier, right.identifier].sort().join('::'),
    'retention-review',
  )
  assert.match(dialogExport.csv, /Double local delete/u)
  assert.match(dialogExport.csv, /Сообщение скрыто у обоих участников через «Удалить у меня», но серверная запись сохранена/u)
  assert.match(dialogExport.csv, /delete-message-me/u)
})

test('owner storage exports keep current media separate from retention-only direct attachments and exclude avatars', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+799901000821')
  const right = createAccount('+799901000822')
  const staff = createAccount('+799901000823')
  staff.staffRole = 'owner'
  staff.passwordHash = await hashPassword('owner-secret')
  left.avatarImage = '/uploads/profile-avatars/private-avatar.png'
  left.gifLibrary = [{
    createdAt: '2026-04-03T10:08:00.000Z',
    fileName: 'party.gif',
    height: 180,
    id: 'gif-party',
    mediaUrl: '/uploads/user-gifs/party.gif',
    mimeType: 'image/gif',
    size: 4096,
    width: 180,
  }]

  database.accounts.push(left, right, staff)
  const leftToken = createSession(database, left.identifier, 'media-export-left')
  const rightToken = createSession(database, right.identifier, 'media-export-right')
  const staffToken = createSession(database, staff.identifier, 'media-export-staff')

  const mediaUrl = '/uploads/attachments/retention-export.png'
  database.pendingMediaUploads.push({
    createdAt: '2026-04-03T08:00:00.000Z',
    fileName: 'retention-export.png',
    kind: 'attachment',
    linked: true,
    mediaUrl,
    mimeType: 'image/png',
    ownerIdentifier: left.identifier,
    size: 2048,
    storageKey: 'retention-export',
  })

  const opened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.sendDirectMessage(leftToken, opened.dialogId, {
    attachment: {
      fileName: 'retention-export.png',
      mediaUrl,
      mimeType: 'image/png',
      size: 2048,
    },
    text: 'Retention-only media export',
  })

  const leftChatBefore = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === opened.dialogId)
  const rightChatBefore = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  const leftMessage = leftChatBefore?.messages.find((message) => message.text === 'Retention-only media export')
  const rightIncomingMessage = rightChatBefore?.messages.find((message) => message.text === 'Retention-only media export')
  assert.ok(leftMessage)
  assert.ok(rightIncomingMessage)

  await store.deleteDialogMessage(rightToken, rightChatBefore!.id, rightIncomingMessage!.id)
  await store.deleteDialogMessage(leftToken, opened.dialogId, leftMessage!.id)

  const currentArchive = await store.adminExportCurrentStorage(staffToken, {
    currentPassword: 'owner-secret',
    reason: 'media-review-current',
    subjectId: left.identifier,
    subjectKind: 'user',
  })
  const currentZip = unzipSync(new Uint8Array(currentArchive.buffer))
  const currentManifest = JSON.parse(strFromU8(currentZip['manifest/media.json']))
  const currentCsv = strFromU8(currentZip['manifest/media.csv'])

  assert.equal(
    currentManifest.some((entry: { mediaUrl: string }) => entry.mediaUrl === left.avatarImage),
    false,
  )
  assert.equal(
    currentManifest.some((entry: { fileName: string; kind: string }) => entry.fileName === 'party.gif' && entry.kind === 'gif'),
    true,
  )
  assert.equal(
    currentManifest.some((entry: { fileName: string }) => entry.fileName === 'retention-export.png'),
    false,
  )

  const archiveExport = await store.adminExportStorageArchive(staffToken, {
    currentPassword: 'owner-secret',
    reason: 'media-review-archive',
    subjectId: left.identifier,
    subjectKind: 'user',
  })
  const archiveZip = unzipSync(new Uint8Array(archiveExport.buffer))
  const archiveManifest = JSON.parse(strFromU8(archiveZip['manifest/media.json']))
  const archiveCsv = strFromU8(archiveZip['manifest/media.csv'])

  assert.equal(
    archiveManifest.some((entry: { fileName: string }) => entry.fileName === 'retention-export.png'),
    false,
  )
  assert.doesNotMatch(currentCsv, /retention-export\.png/u)
  assert.doesNotMatch(archiveCsv, /retention-export\.png/u)
  assert.doesNotMatch(archiveCsv, /delete-message-me/u)
})

test('archive storage export does not duplicate a direct attachment that is still active in current storage', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+799901000831')
  const right = createAccount('+799901000832')
  const staff = createAccount('+799901000833')
  staff.staffRole = 'owner'
  staff.passwordHash = await hashPassword('owner-secret')

  database.accounts.push(left, right, staff)
  const leftToken = createSession(database, left.identifier, 'active-current-left')
  const rightToken = createSession(database, right.identifier, 'active-current-right')
  const staffToken = createSession(database, staff.identifier, 'active-current-staff')

  const mediaUrl = '/uploads/attachments/archive-overlap.png'
  database.pendingMediaUploads.push({
    createdAt: '2026-04-03T08:00:00.000Z',
    fileName: 'archive-overlap.png',
    kind: 'attachment',
    linked: true,
    mediaUrl,
    mimeType: 'image/png',
    ownerIdentifier: left.identifier,
    size: 2048,
    storageKey: 'archive-overlap',
  })

  const opened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.sendDirectMessage(leftToken, opened.dialogId, {
    attachment: {
      fileName: 'archive-overlap.png',
      mediaUrl,
      mimeType: 'image/png',
      size: 2048,
    },
    text: 'Archive overlap',
  })

  const rightChatBefore = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  const rightIncomingMessage = rightChatBefore?.messages.find((message) => message.text === 'Archive overlap')
  assert.ok(rightChatBefore)
  assert.ok(rightIncomingMessage)

  await store.deleteDialogMessage(rightToken, rightChatBefore!.id, rightIncomingMessage!.id)

  assert.equal(database.archivedMedia.length, 0)

  const currentExport = await store.adminExportCurrentStorage(staffToken, {
    currentPassword: 'owner-secret',
    reason: 'archive-overlap-current',
    subjectId: left.identifier,
    subjectKind: 'user',
  })
  const currentZip = unzipSync(new Uint8Array(currentExport.buffer))
  const currentManifest = JSON.parse(strFromU8(currentZip['manifest/media.json']))

  const archiveExport = await store.adminExportStorageArchive(staffToken, {
    currentPassword: 'owner-secret',
    reason: 'archive-overlap-archive',
    subjectId: left.identifier,
    subjectKind: 'user',
  })
  const archiveZip = unzipSync(new Uint8Array(archiveExport.buffer))
  const archiveManifest = JSON.parse(strFromU8(archiveZip['manifest/media.json']))

  assert.equal(
    currentManifest.some((entry: { mediaUrl: string }) => entry.mediaUrl === mediaUrl),
    true,
  )
  assert.equal(
    archiveManifest.some((entry: { mediaUrl: string }) => entry.mediaUrl === mediaUrl),
    false,
  )
})

test('legacy two-sided direct dialogs auto-upgrade to accepted contacts', () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+79990100041')
  const right = createAccount('+79990100042')

  database.accounts.push(left, right)
  const leftToken = createSession(database, left.identifier, 'legacy-left')

  database.dialogs.push({
    accent: '#8c5738',
    avatarImage: undefined,
    handle: '',
    id: 1,
    isTestEntity: false,
    lastSeen: undefined,
    mood: 'На связи',
    muted: false,
    online: false,
    ownerIdentifier: left.identifier,
    phone: right.identifier,
    pinned: false,
    premium: false,
    status: 'в сети',
    title: 'Right',
    typing: false,
    unread: 0,
  })
  database.dialogs.push({
    accent: '#8c5738',
    avatarImage: undefined,
    handle: '',
    id: 1,
    isTestEntity: false,
    lastSeen: undefined,
    mood: 'На связи',
    muted: false,
    online: false,
    ownerIdentifier: right.identifier,
    phone: left.identifier,
    pinned: false,
    premium: false,
    status: 'в сети',
    title: 'Left',
    typing: false,
    unread: 0,
  })
  database.dialogMessages.push({
    author: 'me',
    createdAt: '2026-03-29T01:00:00.000Z',
    dialogId: 1,
    id: 1,
    ownerIdentifier: left.identifier,
    text: 'legacy hello',
    time: '10:00',
  })
  database.dialogMessages.push({
    author: 'them',
    createdAt: '2026-03-29T01:00:00.000Z',
    dialogId: 1,
    id: 1,
    ownerIdentifier: right.identifier,
    text: 'legacy hello',
    time: '10:00',
  })

  const normalized = coerceDatabasePayload(database).database
  const normalizedStore = TinychokStore.create(normalized, async () => undefined)
  const snapshot = normalizedStore.getSnapshotByToken(leftToken)
  const chat = snapshot?.chats.find((candidate) => candidate.phone === right.identifier)
  assert.equal(chat?.contactState, 'accepted')
})

test('delete contact hides dialog for both sides, keeps history and reopens via contact request flow', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+79990100051')
  const right = createAccount('+79990100052')

  database.accounts.push(left, right)
  const leftToken = createSession(database, left.identifier, 'delete-left')
  const rightToken = createSession(database, right.identifier, 'delete-right')

  const openResponse = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.sendDirectMessage(leftToken, openResponse.dialogId, {
    text: 'История до удаления',
  })

  const leftSnapshotBeforeDelete = store.getSnapshotByToken(leftToken)
  const leftChatBeforeDelete = leftSnapshotBeforeDelete?.chats.find((chat) => chat.phone === right.identifier)
  const rightSnapshotBeforeDelete = store.getSnapshotByToken(rightToken)
  const rightChatBeforeDelete = rightSnapshotBeforeDelete?.chats.find((chat) => chat.phone === left.identifier)

  assert.ok(leftChatBeforeDelete)
  assert.ok(rightChatBeforeDelete)

  await store.deleteDialog(leftToken, leftChatBeforeDelete.id)

  const leftSnapshotAfterDelete = store.getSnapshotByToken(leftToken)
  const rightSnapshotAfterDelete = store.getSnapshotByToken(rightToken)
  assert.equal(leftSnapshotAfterDelete?.chats.some((chat) => chat.phone === right.identifier && !chat.hidden), false)
  assert.equal(rightSnapshotAfterDelete?.chats.some((chat) => chat.phone === left.identifier && !chat.hidden), false)

  const persistedLeftDialog = database.dialogs.find(
    (dialog) => dialog.ownerIdentifier === left.identifier && dialog.id === leftChatBeforeDelete.id,
  )
  const persistedRightDialog = database.dialogs.find(
    (dialog) => dialog.ownerIdentifier === right.identifier && dialog.id === rightChatBeforeDelete.id,
  )
  assert.equal(persistedLeftDialog?.hidden, true)
  assert.equal(persistedRightDialog?.hidden, true)
  assert.equal(
    database.dialogMessages.some(
      (message) => message.ownerIdentifier === left.identifier && message.dialogId === leftChatBeforeDelete.id,
    ),
    true,
  )
  assert.equal(
    database.dialogMessages.some(
      (message) => message.ownerIdentifier === right.identifier && message.dialogId === rightChatBeforeDelete.id,
    ),
    true,
  )

  const reopened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  assert.equal(reopened.dialogId, leftChatBeforeDelete.id)

  const leftReopenedChat = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === reopened.dialogId)
  assert.equal(leftReopenedChat?.contactState, 'none')
  assert.equal(leftReopenedChat?.messages.some((message) => message.text === 'История до удаления'), true)
  assert.equal(
    store.getSnapshotByToken(rightToken)?.chats.some((chat) => chat.phone === left.identifier && !chat.hidden),
    false,
  )

  await assert.rejects(
    () =>
      store.sendDirectMessage(leftToken, reopened.dialogId, {
        text: 'Писать после удаления нельзя',
      }),
    /Сначала отправьте запрос на контакт/u,
  )

  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  assert.equal(
    store.getSnapshotByToken(leftToken)?.outgoingContactRequests.some((request) => request.identifier === right.identifier),
    true,
  )
  assert.equal(
    store.getSnapshotByToken(rightToken)?.contactRequests.some((request) => request.identifier === left.identifier),
    true,
  )
  assert.equal(
    store.getSnapshotByToken(rightToken)?.chats.some((chat) => chat.phone === left.identifier && !chat.hidden),
    false,
  )

  await store.acceptContactRequest(rightToken, left.identifier)
  const leftAcceptedChat = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.phone === right.identifier)
  const rightAcceptedChat = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  assert.ok(leftAcceptedChat)
  assert.ok(rightAcceptedChat)
  assert.equal(leftAcceptedChat?.messages.some((message) => message.text === 'История до удаления'), true)
  assert.equal(rightAcceptedChat?.messages.some((message) => message.text === 'История до удаления'), true)
  assert.equal(leftAcceptedChat?.messages.at(-1)?.text, 'Контакт установлен')
  assert.equal(rightAcceptedChat?.messages.at(-1)?.text, 'Контакт установлен')
})

test('delete contact preserves per-side history clearing when reopening former contact', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+79990100061')
  const right = createAccount('+79990100062')

  database.accounts.push(left, right)
  const leftToken = createSession(database, left.identifier, 'history-left')
  const rightToken = createSession(database, right.identifier, 'history-right')

  const openResponse = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.sendDirectMessage(leftToken, openResponse.dialogId, {
    text: 'Локальная история',
  })

  const rightChat = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  assert.ok(rightChat)
  await store.deleteDialogHistory(rightToken, rightChat!.id)
  await store.deleteDialog(leftToken, openResponse.dialogId)

  const reopened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  const reopenedLeftChat = store.getSnapshotByToken(leftToken)?.chats.find((chat) => chat.id === reopened.dialogId)
  assert.equal(reopenedLeftChat?.messages.some((message) => message.text === 'Локальная история'), true)
  assert.equal(
    store.getSnapshotByToken(rightToken)?.chats.some((chat) => chat.phone === left.identifier && !chat.hidden),
    false,
  )

  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)

  const restoredRightChat = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.phone === left.identifier)
  assert.ok(restoredRightChat)
  assert.equal(restoredRightChat?.messages.some((message) => message.text === 'Локальная история'), false)
})

test('search still finds hidden former contacts after delete', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+79990100071')
  left.displayName = 'Former Left'
  const right = createAccount('+79990100072')
  right.displayName = 'Former Right'

  database.accounts.push(left, right)
  const leftToken = createSession(database, left.identifier, 'search-left')
  const rightToken = createSession(database, right.identifier, 'search-right')

  const opened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.deleteDialog(leftToken, opened.dialogId)

  const searchByPhone = store.searchAccounts(rightToken, left.identifier)
  assert.equal(searchByPhone.some((result) => result.phone === left.identifier), true)

  const searchByName = store.searchAccounts(rightToken, 'Former Left')
  assert.equal(searchByName.some((result) => result.phone === left.identifier), true)
})

test('hidden former contacts stay searchable for both sides and across repeated delete cycles', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+79990100081')
  left.displayName = 'Cycle Left'
  const right = createAccount('+79990100082')
  right.displayName = 'Cycle Right'

  database.accounts.push(left, right)
  const leftToken = createSession(database, left.identifier, 'cycle-left')
  const rightToken = createSession(database, right.identifier, 'cycle-right')

  const initialOpen = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.deleteDialog(leftToken, initialOpen.dialogId)

  assert.equal(
    store.searchAccounts(leftToken, right.identifier).some((result) => result.phone === right.identifier),
    true,
  )
  assert.equal(
    store.searchAccounts(rightToken, left.identifier).some((result) => result.phone === left.identifier),
    true,
  )

  const reopenedByRight = await store.openDirectDialog(rightToken, { identifier: left.identifier })
  const rightFormerChat = store.getSnapshotByToken(rightToken)?.chats.find((chat) => chat.id === reopenedByRight.dialogId)
  assert.equal(rightFormerChat?.contactState, 'none')

  await store.sendContactRequest(rightToken, { identifier: left.identifier })
  await store.acceptContactRequest(leftToken, right.identifier)
  await store.deleteDialog(rightToken, reopenedByRight.dialogId)

  assert.equal(
    store.searchAccounts(leftToken, right.identifier).some((result) => result.phone === right.identifier),
    true,
  )
  assert.equal(
    store.searchAccounts(rightToken, left.identifier).some((result) => result.phone === left.identifier),
    true,
  )
})
