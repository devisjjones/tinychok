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
    displayName?: string
    staffRole?: 'owner'
    surname?: string
  },
): Database['accounts'][number] {
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
    displayName: options?.displayName ?? `User ${identifier}`,
    gifLibrary: [],
    identifier,
    isTestEntity: false,
    lastActiveAt: '2026-04-01T00:00:00.000Z',
    nickname: '',
    passwordHash: undefined,
    passwordSetAt: undefined,
    premium: false,
    premiumExpiresAt: undefined,
    publicDeleted: undefined,
    quietModeEnabled: false,
    soundsDisabled: false,
    staffRole: options?.staffRole,
    status: '',
    surname: options?.surname ?? '',
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

test('editing a direct message preserves the previous version in admin export', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+79990100201', { displayName: 'Алексей' })
  const right = createAccount('+79990100202', { displayName: 'Мираслава' })
  const staff = createAccount('+79990100299', { displayName: 'Владелец', staffRole: 'owner' })

  database.accounts.push(left, right, staff)
  const leftToken = createSession(database, left.identifier, 'edit-left')
  const rightToken = createSession(database, right.identifier, 'edit-right')
  const staffToken = createSession(database, staff.identifier, 'edit-staff')

  const opened = await store.openDirectDialog(leftToken, { identifier: right.identifier })
  await store.sendContactRequest(leftToken, { identifier: right.identifier })
  await store.acceptContactRequest(rightToken, left.identifier)
  await store.sendDirectMessage(leftToken, opened.dialogId, { text: 'Первая версия' })

  const beforeEditMessage = store.getSnapshotByToken(leftToken)?.chats
    .find((chat) => chat.id === opened.dialogId)
    ?.messages.find((message) => message.text === 'Первая версия')
  assert.ok(beforeEditMessage)

  const mutation = await store.editDirectMessage(leftToken, opened.dialogId, beforeEditMessage.id, {
    text: 'Вторая версия',
  })
  const editedMessage = mutation.snapshot.chats
    .find((chat) => chat.id === opened.dialogId)
    ?.messages.find((message) => message.id === beforeEditMessage.id)
  assert.ok(editedMessage)
  assert.equal(editedMessage.text, 'Вторая версия')
  assert.ok(editedMessage.editedAt)

  const recipientMessage = store.getSnapshotByToken(rightToken)?.chats
    .find((chat) => chat.phone === left.identifier)
    ?.messages.find((message) => message.text === 'Вторая версия')
  assert.ok(recipientMessage)
  assert.ok(recipientMessage.editedAt)

  const dialogExport = await store.adminExportDialogCsv(
    staffToken,
    [left.identifier, right.identifier].sort().join('::'),
    'edit-history-check',
  )
  assert.match(dialogExport.csv, /Архив версии/u)
  assert.match(dialogExport.csv, /Текущая/u)
  assert.match(dialogExport.csv, /Первая версия/u)
  assert.match(dialogExport.csv, /Вторая версия/u)
  assert.match(dialogExport.csv, /Предыдущая версия сообщения сохранена после редактирования/u)
  assert.match(dialogExport.csv, /edited-message-archive/u)
})

test('editing a group thread comment updates the visible comment for participants', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990100301', { displayName: 'Алексей' })
  const member = createAccount('+79990100302', { displayName: 'Мираслава' })

  database.accounts.push(owner, member)
  const ownerToken = createSession(database, owner.identifier, 'group-owner')
  const memberToken = createSession(database, member.identifier, 'group-member')

  const dialog = await store.openDirectDialog(ownerToken, { identifier: member.identifier })
  await store.sendContactRequest(ownerToken, { identifier: member.identifier })
  await store.acceptContactRequest(memberToken, owner.identifier)

  const createdGroup = await store.createGroup(ownerToken, {
    commentsEnabledForAll: true,
    memberDialogIds: [dialog.dialogId],
    title: 'Группа для правки комментария',
  })
  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === member.identifier &&
      message.sourceGroup?.sharedId,
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)
  const joinResponse = await store.joinGroupBySharedId(memberToken, invitationMessage!.sourceGroup!.sharedId!)
  await store.sendGroupMessage(ownerToken, createdGroup.groupId, { text: 'Корневое сообщение' })

  const rootMessage = store.getSnapshotByToken(ownerToken)?.groups
    .find((group) => group.id === createdGroup.groupId)
    ?.messages.find((message) => message.text === 'Корневое сообщение')
  assert.ok(rootMessage)

  await store.sendGroupThreadComment(ownerToken, createdGroup.groupId, rootMessage.id, {
    text: 'Первый комментарий',
  })
  const beforeEditComment = store.getSnapshotByToken(ownerToken)?.groups
    .find((group) => group.id === createdGroup.groupId)
    ?.messages.find((message) => message.id === rootMessage.id)
    ?.threadComments?.find((comment) => comment.text === 'Первый комментарий')
  assert.ok(beforeEditComment)

  await store.editGroupThreadComment(ownerToken, createdGroup.groupId, rootMessage.id, beforeEditComment.id, {
    text: 'Исправленный комментарий',
  })

  const ownerComment = store.getSnapshotByToken(ownerToken)?.groups
    .find((group) => group.id === createdGroup.groupId)
    ?.messages.find((message) => message.id === rootMessage.id)
    ?.threadComments?.find((comment) => comment.id === beforeEditComment.id)
  assert.ok(ownerComment)
  assert.equal(ownerComment.text, 'Исправленный комментарий')
  assert.ok(ownerComment.editedAt)

  const memberComment = store.getSnapshotByToken(memberToken)?.groups
    .find((group) => group.id === joinResponse.groupId)
    ?.messages.find((message) => message.text === 'Корневое сообщение')
    ?.threadComments?.find((comment) => comment.text === 'Исправленный комментарий')
  assert.ok(memberComment)
  assert.ok(memberComment.editedAt)
})
