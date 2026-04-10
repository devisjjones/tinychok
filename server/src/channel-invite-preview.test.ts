import assert from 'node:assert/strict'
import test from 'node:test'
import {
  coerceDatabasePayload,
  TinychokStore,
  type Database,
} from './store'
import type { StaffRole } from '../../src/shared/types'

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
    avatarImage?: string
    premium?: boolean
    premiumExpiresAt?: string
    quietModeEnabled?: boolean
    soundsDisabled?: boolean
    staffRole?: StaffRole
    surname?: string
  },
) {
  return {
    accountId: `account_${identifier}`,
    avatarImage: options?.avatarImage,
    archivedOriginalIdentifier: undefined,
    archivedProfile: undefined,
    blockedAt: undefined,
    blockedReason: undefined,
    blockedContactIds: [],
    createdAt: '2026-03-28T00:00:00.000Z',
    deletedAt: undefined,
    deletedBySelfService: undefined,
    deletionMode: undefined,
    displayName: `User ${identifier}`,
    gifLibrary: [],
    identifier,
    isTestEntity: false,
    lastActiveAt: '2026-03-28T00:00:00.000Z',
    nickname: '',
    passwordHash: undefined,
    passwordSetAt: undefined,
    premium: options?.premium ?? false,
    premiumExpiresAt: options?.premiumExpiresAt,
    publicDeleted: undefined,
    quietModeEnabled: options?.quietModeEnabled ?? false,
    soundsDisabled: options?.soundsDisabled ?? false,
    staffRole: options?.staffRole,
    status: '',
    surname: options?.surname ?? '',
  }
}

function createSession(database: Database, identifier: string, suffix: string) {
  const token = `session-${suffix}`
  database.sessions.push({
    createdAt: '2026-03-28T00:00:00.000Z',
    expiresAt: '2026-04-27T00:00:00.000Z',
    identifier,
    token,
  })
  return token
}

async function withMockedSystemTime<T>(isoString: string, run: () => Promise<T> | T): Promise<T> {
  const RealDate = globalThis.Date
  const frozenTime = new RealDate(isoString).valueOf()

  class MockDate extends RealDate {
    constructor(value?: string | number | Date) {
      super(value === undefined ? frozenTime : value)
    }

    static now() {
      return frozenTime
    }

    static parse(value: string) {
      return RealDate.parse(value)
    }

    static UTC(
      year: number,
      monthIndex: number,
      day?: number,
      hours?: number,
      minutes?: number,
      seconds?: number,
      milliseconds?: number,
    ) {
      return RealDate.UTC(year, monthIndex, day, hours, minutes, seconds, milliseconds)
    }
  }

  globalThis.Date = MockDate as unknown as DateConstructor
  try {
    return await run()
  } finally {
    globalThis.Date = RealDate
  }
}

function seedAcceptedContactLink(database: Database, leftIdentifier: string, rightIdentifier: string) {
  const [left, right] = [leftIdentifier, rightIdentifier].sort()
  database.contactLinks.push({
    createdAt: '2026-03-28T00:00:00.000Z',
    leftIdentifier: left,
    requesterIdentifier: leftIdentifier,
    rightIdentifier: right,
    status: 'accepted',
    updatedAt: '2026-03-28T00:00:00.000Z',
  })
}

test.before(() => {
  console.info = () => undefined
})

test.after(() => {
  console.info = originalConsoleInfo
})

test('channel invite creates pending invitation and direct message without auto-subscribe', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990001001')
  const invited = createAccount('+79990001002')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'owner')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@promo-space',
    statusText: 'Лучший статус канала',
    title: 'Промо-канал',
    visibility: 'private',
  })

  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    text: 'Первый пост для приглашённого',
  })
  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogResponse.dialogId],
  })

  const recipientChannels = database.subscriptionChannels.filter(
    (channel) => channel.ownerIdentifier === invited.identifier,
  )
  assert.equal(recipientChannels.length, 0)
  assert.equal(database.pendingChannelInvitations.length, 1)
  assert.equal(database.pendingChannelInvitations[0]?.recipientIdentifier, invited.identifier)
  assert.equal(database.pendingChannelInvitations[0]?.channelHandle, '@promo-space')

  const recipientDialog = database.dialogs.find(
    (dialog) => dialog.ownerIdentifier === invited.identifier && dialog.phone === owner.identifier,
  )
  assert.ok(recipientDialog)
  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === invited.identifier &&
      message.dialogId === recipientDialog?.id &&
      message.sourceChannel?.handle === '@promo-space',
  )
  assert.equal(invitationMessage?.sourceChannel?.statusText, 'Лучший статус канала')
})

test('invited user can preview full history and subscribe explicitly, outsider is denied', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990002001')
  const invited = createAccount('+79990002002')
  const outsider = createAccount('+79990002003')

  database.accounts.push(owner, invited, outsider)
  const ownerToken = createSession(database, owner.identifier, 'owner-preview')
  const invitedToken = createSession(database, invited.identifier, 'invited-preview')
  const outsiderToken = createSession(database, outsider.identifier, 'outsider-preview')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    description: 'Описание с пробелами внутри',
    directLink: '@channel-preview-test',
    statusText: 'Заходите почитать',
    title: 'Канал превью',
    visibility: 'private',
  })

  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, { text: 'Пост один' })
  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, { text: 'Пост два' })
  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogResponse.dialogId],
  })

  const previewResponse = store.getSubscriptionChannelPreviewByHandle(invitedToken, '@channel-preview-test')
  assert.equal(previewResponse.channel.title, 'Канал превью')
  assert.equal(previewResponse.channel.statusText, 'Заходите почитать')
  assert.equal(previewResponse.channel.posts.length, 3)
  assert.equal(previewResponse.channel.posts[1]?.text, 'Пост один')
  assert.equal(previewResponse.channel.posts[2]?.text, 'Пост два')

  assert.throws(
    () => store.getSubscriptionChannelPreviewByHandle(outsiderToken, '@channel-preview-test'),
    /Доступ к каналу не разрешён/u,
  )

  const subscribeResponse = await store.subscribeToChannelByHandle(invitedToken, '@channel-preview-test')
  assert.ok(subscribeResponse.channelId > 0)

  const recipientChannelCopies = database.subscriptionChannels.filter(
    (channel) => channel.ownerIdentifier === invited.identifier,
  )
  assert.equal(recipientChannelCopies.length, 1)
  assert.equal(recipientChannelCopies[0]?.handle, '@channel-preview-test')
  assert.equal(database.pendingChannelInvitations.length, 0)

  const invitedSnapshotChannel = subscribeResponse.snapshot.subscriptionChannels.find(
    (channel) => channel.id === subscribeResponse.channelId,
  )
  assert.ok(invitedSnapshotChannel)
  assert.equal(invitedSnapshotChannel?.posts.length, 3)

  const ownerSnapshotChannel = store.getSnapshotByToken(ownerToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@channel-preview-test',
  )
  assert.equal(ownerSnapshotChannel?.readers, 2)
  assert.equal(
    ownerSnapshotChannel?.participants?.some((participant) => participant.identifier === invited.identifier),
    true,
  )
})

test('self-unsubscribe restores invitation access so invited user can rejoin later', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990003001')
  const invited = createAccount('+79990003002')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'owner-rejoin')
  const invitedToken = createSession(database, invited.identifier, 'invited-rejoin')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@channel-rejoin-test',
    statusText: 'Возвращайтесь в любое время',
    title: 'Канал для возврата',
    visibility: 'private',
  })

  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, { text: 'Пост для возврата' })
  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogResponse.dialogId],
  })

  const subscribeResponse = await store.subscribeToChannelByHandle(invitedToken, '@channel-rejoin-test')
  await store.deleteSubscriptionChannel(invitedToken, subscribeResponse.channelId)

  assert.equal(database.pendingChannelInvitations.length, 1)
  assert.equal(database.pendingChannelInvitations[0]?.recipientIdentifier, invited.identifier)
  assert.equal(database.pendingChannelInvitations[0]?.channelHandle, '@channel-rejoin-test')

  const previewResponse = store.getSubscriptionChannelPreviewByHandle(invitedToken, '@channel-rejoin-test')
  assert.equal(previewResponse.channel.title, 'Канал для возврата')
  assert.equal(previewResponse.channel.posts.length, 2)

  const resubscribeResponse = await store.subscribeToChannelByHandle(invitedToken, '@channel-rejoin-test')
  assert.ok(resubscribeResponse.channelId > 0)
  assert.equal(database.pendingChannelInvitations.length, 0)
})

test('left channel stays searchable through preview discovery after self-unsubscribe', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990003501')
  const invited = createAccount('+79990003502')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'owner-search-rejoin')
  const invitedToken = createSession(database, invited.identifier, 'invited-search-rejoin')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@channel-search-rejoin',
    statusText: 'Ищется после выхода',
    title: 'Канал для поиска после выхода',
    visibility: 'private',
  })

  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogResponse.dialogId],
  })

  const subscribeResponse = await store.subscribeToChannelByHandle(invitedToken, '@channel-search-rejoin')
  await store.deleteSubscriptionChannel(invitedToken, subscribeResponse.channelId)

  const searchResults = store.searchSubscriptionChannels(invitedToken, 'поиска после выхода')
  assert.equal(searchResults.length, 1)
  assert.equal(searchResults[0]?.handle, '@channel-search-rejoin')

  const previewResponse = store.getSubscriptionChannelPreviewByHandle(invitedToken, '@channel-search-rejoin')
  assert.equal(previewResponse.channel.title, 'Канал для поиска после выхода')
})

test('channel becomes searchable for new users after visibility changes from private to public', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990003511')
  const stranger = createAccount('+79990003512')

  database.accounts.push(owner, stranger)
  const ownerToken = createSession(database, owner.identifier, 'owner-public-visibility')
  const strangerToken = createSession(database, stranger.identifier, 'stranger-public-visibility')

  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@public-visibility-test',
    statusText: 'Станет публичным после обновления',
    title: 'Тестовый канал 9',
    visibility: 'private',
  })

  assert.equal(store.searchSubscriptionChannels(strangerToken, 'Тестовый канал 9').length, 0)

  await store.updateManagedChannel(ownerToken, createdChannel.channelId, {
    visibility: 'public',
  })

  const searchResults = store.searchSubscriptionChannels(strangerToken, 'Тестовый канал 9')
  assert.equal(searchResults.length, 1)
  assert.equal(searchResults[0]?.handle, '@public-visibility-test')
  assert.equal(searchResults[0]?.visibility, 'public')

  const previewResponse = store.getSubscriptionChannelPreviewByHandle(strangerToken, '@public-visibility-test')
  assert.equal(previewResponse.channel.title, 'Тестовый канал 9')
  assert.equal(previewResponse.channel.visibility, 'public')
})

test('plain @channel handle in direct message materializes into sourceChannel for the recipient snapshot', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990001021')
  const invited = createAccount('+79990001022')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'owner-handle-message')
  const invitedToken = createSession(database, invited.identifier, 'invited-handle-message')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  seedAcceptedContactLink(database, owner.identifier, invited.identifier)
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@канал_точно_по_хэндлу',
    statusText: 'Точный канал',
    title: 'Канал открывается по хэндлу',
    visibility: 'private',
  })

  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogResponse.dialogId],
  })

  await store.sendDirectMessage(ownerToken, dialogResponse.dialogId, {
    text: '@канал_точно_по_хэндлу',
  })

  const snapshot = store.getSnapshotByToken(invitedToken)
  assert.ok(snapshot)
  const invitedDialog = snapshot.chats.find((chat) => chat.phone === owner.identifier)
  assert.ok(invitedDialog)
  const invitationHandleMessage = invitedDialog?.messages.find((message) => message.text === '@канал_точно_по_хэндлу')
  assert.ok(invitationHandleMessage)
  assert.equal(invitationHandleMessage?.sourceChannel?.handle, '@канал_точно_по_хэндлу')
  assert.equal(invitationHandleMessage?.sourceChannel?.title, 'Канал открывается по хэндлу')
})

test('owner revocation keeps channel closed for removed subscriber', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990004001')
  const invited = createAccount('+79990004002')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'owner-revoke')
  const invitedToken = createSession(database, invited.identifier, 'invited-revoke')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@channel-revoke-test',
    statusText: 'Только по приглашению',
    title: 'Канал с отзывом доступа',
    visibility: 'private',
  })

  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogResponse.dialogId],
  })
  await store.subscribeToChannelByHandle(invitedToken, '@channel-revoke-test')

  const ownerSubscriptionCopy = database.subscriptionChannels.find(
    (channel) => channel.ownerIdentifier === owner.identifier && channel.handle === '@channel-revoke-test',
  )
  assert.ok(ownerSubscriptionCopy)

  await store.removeSubscriptionChannelSubscriber(ownerToken, ownerSubscriptionCopy!.id, {
    identifier: invited.identifier,
  })

  assert.equal(database.pendingChannelInvitations.length, 0)
  assert.throws(
    () => store.getSubscriptionChannelPreviewByHandle(invitedToken, '@channel-revoke-test'),
    /Доступ к каналу не разрешён/u,
  )
})

test('group invite restores access after self-leave and archived member can still leave', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990005001')
  const invited = createAccount('+79990005002', {
    premium: true,
    premiumExpiresAt: '2026-04-28T00:00:00.000Z',
    surname: 'Премиум',
  })

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'group-owner')
  const invitedToken = createSession(database, invited.identifier, 'group-invited')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  await store.createGroup(ownerToken, {
    description: 'Наша общая идеалогия',
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Группа по приглашению',
  })

  assert.equal(
    database.groups.filter((group) => group.ownerIdentifier === invited.identifier).length,
    0,
  )
  assert.equal(database.pendingGroupInvitations.length, 1)
  assert.equal(database.pendingGroupInvitations[0]?.recipientIdentifier, invited.identifier)

  const recipientDialog = database.dialogs.find(
    (dialog) => dialog.ownerIdentifier === invited.identifier && dialog.phone === owner.identifier,
  )
  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === invited.identifier &&
      message.dialogId === recipientDialog?.id &&
      message.sourceGroup?.sharedId,
  )
  assert.equal(invitationMessage?.sourceGroup?.leadText, 'Пользователь приглашает вас в группу')

  const joinResponse = await store.joinGroupBySharedId(
    invitedToken,
    invitationMessage?.sourceGroup?.sharedId ?? '',
  )
  assert.ok(joinResponse.groupId > 0)
  assert.equal(database.pendingGroupInvitations.length, 0)

  const ownerGroupCopyAfterJoin = database.groups.find(
    (group) =>
      group.ownerIdentifier === owner.identifier &&
      group.sharedId === invitationMessage?.sourceGroup?.sharedId,
  )
  const joinSystemMessage = database.groupMessages.find(
    (message) =>
      message.ownerIdentifier === owner.identifier &&
      message.groupId === ownerGroupCopyAfterJoin?.id &&
      message.groupSystemEvent?.kind === 'member-joined',
  )
  assert.equal(joinSystemMessage?.system, true)
  assert.equal(joinSystemMessage?.groupSystemEvent?.actor.title, 'User +79990005002 Премиум')
  assert.equal(joinSystemMessage?.groupSystemEvent?.actor.premium, true)
  assert.match(joinSystemMessage?.text ?? '', /К группе присоединился/u)
  assert.equal(
    database.groupMessages.filter(
      (message) =>
        message.groupSystemEvent?.kind === 'member-joined' &&
        [owner.identifier, invited.identifier].includes(message.ownerIdentifier) &&
        message.groupId !== undefined,
    ).length,
    2,
  )

  const ownerSnapshotAfterJoin = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.sharedId === invitationMessage?.sourceGroup?.sharedId,
  )
  assert.equal(ownerSnapshotAfterJoin?.members, 2)
  assert.equal(
    ownerSnapshotAfterJoin?.participants?.some((participant) => participant.identifier === invited.identifier),
    true,
  )
  assert.equal(
    ownerSnapshotAfterJoin?.messages.some((message) => message.groupSystemEvent?.kind === 'member-joined'),
    true,
  )
  const invitedSnapshotAfterJoin = joinResponse.snapshot.groups.find(
    (group) => group.id === joinResponse.groupId,
  )
  assert.equal(
    invitedSnapshotAfterJoin?.messages.some((message) => message.groupSystemEvent?.kind === 'member-joined'),
    true,
  )

  const groupCopies = database.groups.filter(
    (group) => group.sharedId === invitationMessage?.sourceGroup?.sharedId,
  )
  assert.equal(groupCopies.length, 2)
  assert.equal(groupCopies[0]?.description, 'Наша общая идеалогия')

  await store.leaveGroup(invitedToken, joinResponse.groupId)
  assert.equal(
    database.groups.some((group) => group.ownerIdentifier === invited.identifier && group.id === joinResponse.groupId),
    false,
  )
  assert.equal(database.pendingGroupInvitations.length, 1)
  assert.equal(database.pendingGroupInvitations[0]?.recipientIdentifier, invited.identifier)

  const ownerSnapshotAfterLeave = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.sharedId === invitationMessage?.sourceGroup?.sharedId,
  )
  assert.equal(ownerSnapshotAfterLeave?.members, 1)
  assert.equal(
    ownerSnapshotAfterLeave?.participants?.some((participant) => participant.identifier === invited.identifier),
    false,
  )

  const leaveSystemMessage = database.groupMessages.find(
    (message) =>
      message.ownerIdentifier === owner.identifier &&
      message.groupId === ownerGroupCopyAfterJoin?.id &&
      message.groupSystemEvent?.kind === 'member-left',
  )
  assert.equal(leaveSystemMessage?.system, true)
  assert.equal(leaveSystemMessage?.groupSystemEvent?.actor.title, 'User +79990005002 Премиум')
  assert.equal(leaveSystemMessage?.groupSystemEvent?.actor.premium, true)
  assert.match(leaveSystemMessage?.text ?? '', /покинул группу/u)
  assert.equal(
    database.groupMessages.filter(
      (message) =>
        message.groupSystemEvent?.kind === 'member-left' && message.ownerIdentifier === owner.identifier,
    ).length,
    1,
  )

  const rejoinResponse = await store.joinGroupBySharedId(
    invitedToken,
    invitationMessage?.sourceGroup?.sharedId ?? '',
  )
  assert.ok(rejoinResponse.groupId > 0)
  assert.equal(database.pendingGroupInvitations.length, 0)

  const ownerSnapshotAfterRejoin = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.sharedId === invitationMessage?.sourceGroup?.sharedId,
  )
  assert.equal(ownerSnapshotAfterRejoin?.members, 2)
  assert.equal(
    ownerSnapshotAfterRejoin?.participants?.some((participant) => participant.identifier === invited.identifier),
    true,
  )

  const rejoinedGroupCopies = database.groups.filter(
    (group) => group.sharedId === invitationMessage?.sourceGroup?.sharedId,
  )
  for (const groupCopy of rejoinedGroupCopies) {
    groupCopy.archivedAt = '2026-03-28T12:00:00.000Z'
    groupCopy.archiveReason = 'orphaned-group'
  }

  await store.leaveGroup(invitedToken, rejoinResponse.groupId)
  assert.equal(
    database.groups.some((group) => group.ownerIdentifier === invited.identifier && group.id === rejoinResponse.groupId),
    false,
  )
})

test('group join repairs stale invite state when a participant copy already exists', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990005021')
  const invited = createAccount('+79990005022', {
    surname: 'Поздний вход',
  })

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'group-owner-stale-copy')
  const invitedToken = createSession(database, invited.identifier, 'group-invited-stale-copy')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  await store.createGroup(ownerToken, {
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Группа со сломанным invite-state',
  })

  const recipientDialog = database.dialogs.find(
    (dialog) => dialog.ownerIdentifier === invited.identifier && dialog.phone === owner.identifier,
  )
  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === invited.identifier &&
      message.dialogId === recipientDialog?.id &&
      message.sourceGroup?.sharedId,
  )
  const sharedId = invitationMessage?.sourceGroup?.sharedId ?? ''
  assert.ok(sharedId)

  const ownerGroupCopy = database.groups.find(
    (group) => group.ownerIdentifier === owner.identifier && group.sharedId === sharedId,
  )
  assert.ok(ownerGroupCopy)

  const staleInvitedGroupCopy = structuredClone(ownerGroupCopy!)
  staleInvitedGroupCopy.id = 1
  staleInvitedGroupCopy.ownerIdentifier = invited.identifier
  staleInvitedGroupCopy.members = 1
  staleInvitedGroupCopy.participants = ownerGroupCopy!.participants.map((participant) => ({ ...participant }))
  staleInvitedGroupCopy.preview = ownerGroupCopy!.preview
  staleInvitedGroupCopy.time = ownerGroupCopy!.time
  staleInvitedGroupCopy.unread = 0
  database.groups.push(staleInvitedGroupCopy)

  const joinResponse = await store.joinGroupBySharedId(invitedToken, sharedId)
  assert.equal(joinResponse.groupId, staleInvitedGroupCopy.id)
  assert.equal(database.pendingGroupInvitations.length, 0)

  const ownerSnapshotAfterJoin = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.sharedId === sharedId,
  )
  const invitedSnapshotAfterJoin = joinResponse.snapshot.groups.find(
    (group) => group.id === staleInvitedGroupCopy.id,
  )

  assert.equal(ownerSnapshotAfterJoin?.members, 2)
  assert.equal(
    ownerSnapshotAfterJoin?.participants?.some((participant) => participant.identifier === invited.identifier),
    true,
  )
  assert.equal(invitedSnapshotAfterJoin?.members, 2)
  assert.equal(
    invitedSnapshotAfterJoin?.participants?.some((participant) => participant.identifier === invited.identifier),
    true,
  )
  assert.equal(
    ownerSnapshotAfterJoin?.messages.some((message) => message.groupSystemEvent?.kind === 'member-joined'),
    true,
  )
  assert.equal(
    invitedSnapshotAfterJoin?.messages.some((message) => message.groupSystemEvent?.kind === 'member-joined'),
    true,
  )
})

test('quiet group join and leave stay hidden while owner transfer stays visible', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990005011', { surname: 'Организатор' })
  const quietMember = createAccount('+79990005012', {
    quietModeEnabled: true,
    surname: 'Тихий',
  })

  database.accounts.push(owner, quietMember)
  const ownerToken = createSession(database, owner.identifier, 'quiet-group-owner')
  const quietToken = createSession(database, quietMember.identifier, 'quiet-group-member')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: quietMember.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Тихая группа',
  })
  const ownerCreatedGroupCopy = database.groups.find(
    (group) => group.ownerIdentifier === owner.identifier && group.id === createdGroup.groupId,
  )

  const recipientDialog = database.dialogs.find(
    (dialog) => dialog.ownerIdentifier === quietMember.identifier && dialog.phone === owner.identifier,
  )
  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === quietMember.identifier &&
      message.dialogId === recipientDialog?.id &&
      message.sourceGroup?.sharedId,
  )
  const joinResponse = await store.joinGroupBySharedId(
    quietToken,
    invitationMessage?.sourceGroup?.sharedId ?? '',
  )

  const ownerGroupCopy = database.groups.find(
    (group) =>
      group.ownerIdentifier === owner.identifier &&
      group.sharedId === ownerCreatedGroupCopy?.sharedId,
  )
  assert.equal(
    database.groupMessages.some(
      (message) =>
        message.ownerIdentifier === owner.identifier &&
        message.groupId === ownerGroupCopy?.id &&
        message.groupSystemEvent?.kind === 'member-joined',
    ),
    false,
  )

  await store.leaveGroup(quietToken, joinResponse.groupId)

  assert.equal(
    database.groupMessages.some(
      (message) =>
        message.ownerIdentifier === owner.identifier &&
        message.groupId === ownerGroupCopy?.id &&
        message.groupSystemEvent?.kind === 'member-left',
    ),
    false,
  )

  const rejoinResponse = await store.joinGroupBySharedId(
    quietToken,
    invitationMessage?.sourceGroup?.sharedId ?? '',
  )
  await store.updateGroup(ownerToken, createdGroup.groupId, {
    creatorIdentifier: quietMember.identifier,
  })

  const ownerTransferMessage = database.groupMessages.find(
    (message) =>
      message.ownerIdentifier === owner.identifier &&
      message.groupId === ownerGroupCopy?.id &&
      message.groupSystemEvent?.kind === 'owner-transferred',
  )
  assert.equal(ownerTransferMessage?.system, true)
  assert.equal(ownerTransferMessage?.groupSystemEvent?.actor.identifier, quietMember.identifier)
  assert.equal(ownerTransferMessage?.groupSystemEvent?.actor.title, 'User +79990005012 Тихий')
  assert.match(ownerTransferMessage?.text ?? '', /новый организатор/u)

  const newOwnerSnapshot = store.getSnapshotByToken(quietToken)?.groups.find(
    (group) => group.id === rejoinResponse.groupId,
  )
  assert.equal(newOwnerSnapshot?.groupOwnerIdentifier, quietMember.identifier)
})

test('group join and leave events still appear when only sounds are disabled', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990005021', { surname: 'Организатор' })
  const loudMember = createAccount('+79990005022', {
    soundsDisabled: true,
    surname: 'Беззвучный',
  })

  database.accounts.push(owner, loudMember)
  const ownerToken = createSession(database, owner.identifier, 'sounds-owner')
  const memberToken = createSession(database, loudMember.identifier, 'sounds-member')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: loudMember.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Группа со звуком',
  })
  const recipientDialog = database.dialogs.find(
    (dialog) => dialog.ownerIdentifier === loudMember.identifier && dialog.phone === owner.identifier,
  )
  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === loudMember.identifier &&
      message.dialogId === recipientDialog?.id &&
      message.sourceGroup?.sharedId,
  )

  const joinResponse = await store.joinGroupBySharedId(
    memberToken,
    invitationMessage?.sourceGroup?.sharedId ?? '',
  )
  await store.leaveGroup(memberToken, joinResponse.groupId)

  const ownerGroupCopy = database.groups.find(
    (group) => group.ownerIdentifier === owner.identifier && group.id === createdGroup.groupId,
  )
  assert.equal(
    database.groupMessages.some(
      (message) =>
        message.ownerIdentifier === owner.identifier &&
        message.groupId === ownerGroupCopy?.id &&
        message.groupSystemEvent?.kind === 'member-joined',
    ),
    true,
  )
  assert.equal(
    database.groupMessages.some(
      (message) =>
        message.ownerIdentifier === owner.identifier &&
        message.groupId === ownerGroupCopy?.id &&
        message.groupSystemEvent?.kind === 'member-left',
    ),
    true,
  )
})

test('group can be invited again after self-leave without title-based false positives', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990005031')
  const invited = createAccount('+79990005032')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'reinvite-owner')
  const invitedToken = createSession(database, invited.identifier, 'reinvite-invited')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Возвращение в группу',
  })

  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === invited.identifier &&
      message.sourceGroup?.sharedId &&
      message.dialogId !== undefined,
  )
  const sharedId = invitationMessage?.sourceGroup?.sharedId ?? ''
  const joinResponse = await store.joinGroupBySharedId(invitedToken, sharedId)
  await store.leaveGroup(invitedToken, joinResponse.groupId)

  const reinviteResponse = await store.inviteGroupMember(ownerToken, createdGroup.groupId, {
    dialogId: dialogResponse.dialogId,
  })
  assert.ok(reinviteResponse.snapshot.groups.some((group) => group.id === createdGroup.groupId))
  assert.equal(
    database.pendingGroupInvitations.filter(
      (invite) =>
        invite.sharedId === sharedId && invite.recipientIdentifier === invited.identifier,
    ).length,
    1,
  )
  assert.equal(
    database.dialogMessages.filter(
      (message) =>
        message.ownerIdentifier === invited.identifier &&
        message.sourceGroup?.sharedId === sharedId,
    ).length >= 2,
    true,
  )
})

test('group owner can blacklist a participant and blacklist blocks posting in the group', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990005041')
  const member = createAccount('+79990005042')

  database.accounts.push(owner, member)
  const ownerToken = createSession(database, owner.identifier, 'group-blacklist-owner')
  const memberToken = createSession(database, member.identifier, 'group-blacklist-member')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: member.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Группа для чёрного списка',
  })

  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === member.identifier &&
      message.sourceGroup?.sharedId,
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)

  const joinResponse = await store.joinGroupBySharedId(memberToken, invitationMessage!.sourceGroup!.sharedId!)
  await store.blacklistGroupParticipant(ownerToken, createdGroup.groupId, {
    identifier: member.identifier,
  })

  const ownerSnapshotGroup = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.id === createdGroup.groupId,
  )
  assert.equal(
    ownerSnapshotGroup?.commentBlacklistIdentifiers?.includes(member.identifier),
    true,
  )

  await assert.rejects(
    () => store.sendGroupMessage(memberToken, joinResponse.groupId, { text: 'Меня заблокировали' }),
    /чёрном списке группы/u,
  )
})

test('group owner can remove a participant and removed member loses group access', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990005051')
  const member = createAccount('+79990005052')

  database.accounts.push(owner, member)
  const ownerToken = createSession(database, owner.identifier, 'group-remove-owner')
  const memberToken = createSession(database, member.identifier, 'group-remove-member')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: member.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Группа для удаления участника',
  })

  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === member.identifier &&
      message.sourceGroup?.sharedId,
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)
  const sharedId = invitationMessage!.sourceGroup!.sharedId!

  const joinResponse = await store.joinGroupBySharedId(memberToken, sharedId)
  await store.removeGroupParticipant(ownerToken, createdGroup.groupId, {
    identifier: member.identifier,
  })

  const ownerSnapshotGroup = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.id === createdGroup.groupId,
  )
  assert.equal(
    ownerSnapshotGroup?.participants.some((participant) => participant.identifier === member.identifier),
    false,
  )
  assert.equal(
    store.getSnapshotByToken(memberToken)?.groups.some((group) => group.sharedId === sharedId),
    false,
  )
  assert.equal(
    database.groups.some(
      (group) => group.ownerIdentifier === member.identifier && group.sharedId === sharedId,
    ),
    false,
  )

  await assert.rejects(
    () => store.sendGroupMessage(memberToken, joinResponse.groupId, { text: 'Я уже удалён из группы' }),
    /Группа не найдена/u,
  )
})

test('deleted channel invite opens tombstone preview instead of live channel', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006001')
  const invited = createAccount('+79990006002')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'deleted-owner')
  const invitedToken = createSession(database, invited.identifier, 'deleted-invited')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@deleted-channel',
    statusText: 'Скоро удалится',
    title: 'Удаляемый канал',
    visibility: 'private',
  })

  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, { text: 'Живой пост' })
  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogResponse.dialogId],
  })
  await store.subscribeToChannelByHandle(invitedToken, '@deleted-channel')
  await store.deleteManagedChannel(ownerToken, createdChannel.channelId)

  const ownerActiveChannel = store.getSnapshotByToken(ownerToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@deleted-channel',
  )
  const invitedActiveChannel = store.getSnapshotByToken(invitedToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@deleted-channel',
  )
  assert.equal(ownerActiveChannel, undefined)
  assert.equal(invitedActiveChannel, undefined)

  const tombstonePreview = store.getSubscriptionChannelPreviewByHandle(invitedToken, '@deleted-channel')
  assert.equal(tombstonePreview.channel.title, 'Канал удалён владельцем')
  assert.equal(tombstonePreview.channel.avatarImage, '/icons/ghost.png')
  assert.equal(tombstonePreview.channel.posts.length, 0)
  assert.equal(tombstonePreview.channel.archiveReason, 'owner-deleted')

  await assert.rejects(
    () => store.subscribeToChannelByHandle(invitedToken, '@deleted-channel'),
    /Канал удалён владельцем/u,
  )
})

test('owner-deleted group disappears from user snapshots while orphaned groups stay visible', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006011')
  const invited = createAccount('+79990006012')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'group-delete-owner')
  const invitedToken = createSession(database, invited.identifier, 'group-delete-invited')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    description: 'Группа для удаления владельцем',
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Удаляемая группа',
  })

  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === invited.identifier &&
      message.sourceGroup?.sharedId,
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)

  await store.joinGroupBySharedId(invitedToken, invitationMessage!.sourceGroup!.sharedId!)
  await store.leaveGroup(ownerToken, createdGroup.groupId)

  const ownerSnapshotAfterDelete = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  const invitedSnapshotAfterDelete = store.getSnapshotByToken(invitedToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  assert.equal(ownerSnapshotAfterDelete, undefined)
  assert.equal(invitedSnapshotAfterDelete, undefined)

  const archivedCopies = database.groups.filter(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  assert.equal(archivedCopies.length, 2)
  assert.equal(archivedCopies.every((group) => group.archiveReason === 'owner-deleted'), true)

  for (const groupCopy of archivedCopies) {
    groupCopy.archivedAt = '2026-03-28T12:00:00.000Z'
    groupCopy.archiveReason = 'orphaned-group'
  }

  const invitedSnapshotForOrphaned = store.getSnapshotByToken(invitedToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  assert.ok(invitedSnapshotForOrphaned)
})

test('new group members see pre-join history by default', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006016')
  const invited = createAccount('+79990006017')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'group-history-owner')
  const invitedToken = createSession(database, invited.identifier, 'group-history-invited')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    memberDialogIds: [dialogResponse.dialogId],
    title: 'История для новых участников',
  })

  await store.sendGroupMessage(ownerToken, createdGroup.groupId, {
    text: 'Сообщение до вступления',
  })

  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === invited.identifier &&
      message.sourceGroup?.sharedId,
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)

  const joinResponse = await store.joinGroupBySharedId(invitedToken, invitationMessage!.sourceGroup!.sharedId!)
  const invitedGroup = joinResponse.snapshot.groups.find((group) => group.id === joinResponse.groupId)
  assert.ok(invitedGroup)
  assert.equal(invitedGroup?.showHistoryToNewMembers, true)
  assert.equal(
    invitedGroup?.messages.some((message) => message.text === 'Сообщение до вступления'),
    true,
  )
})

test('group setting can hide pre-join history from new members', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006018')
  const invited = createAccount('+79990006019')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'group-history-hidden-owner')
  const invitedToken = createSession(database, invited.identifier, 'group-history-hidden-invited')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Скрытая история для новых участников',
  })

  await store.updateGroup(ownerToken, createdGroup.groupId, {
    showHistoryToNewMembers: false,
  })

  await store.sendGroupMessage(ownerToken, createdGroup.groupId, {
    text: 'Сообщение до вступления',
  })

  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === invited.identifier &&
      message.sourceGroup?.sharedId,
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)

  const joinResponse = await store.joinGroupBySharedId(invitedToken, invitationMessage!.sourceGroup!.sharedId!)
  const invitedGroup = joinResponse.snapshot.groups.find((group) => group.id === joinResponse.groupId)
  assert.ok(invitedGroup)
  assert.equal(invitedGroup?.showHistoryToNewMembers, false)
  assert.equal(
    invitedGroup?.messages.some((message) => message.text === 'Сообщение до вступления'),
    false,
  )
  assert.notEqual(invitedGroup?.preview, 'Сообщение до вступления')

  const ownerGroup = store.getSnapshotByToken(ownerToken)?.groups.find((group) => group.id === createdGroup.groupId)
  assert.equal(
    ownerGroup?.messages.some((message) => message.text === 'Сообщение до вступления'),
    true,
  )
})

test('admin archived group disappears from user snapshots and unarchive restores it for all members', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const actor = createAccount('+79990006021', { staffRole: 'owner' })
  const owner = createAccount('+79990006022')
  const invited = createAccount('+79990006023')

  database.accounts.push(actor, owner, invited)
  const actorToken = createSession(database, actor.identifier, 'group-archive-actor')
  const ownerToken = createSession(database, owner.identifier, 'group-archive-owner')
  const invitedToken = createSession(database, invited.identifier, 'group-archive-invited')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  await store.createGroup(ownerToken, {
    description: 'Группа для админского архива',
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Группа staff архива',
  })

  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === invited.identifier &&
      message.sourceGroup?.sharedId,
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)

  await store.joinGroupBySharedId(invitedToken, invitationMessage!.sourceGroup!.sharedId!)

  const groupId = store.adminListGroups('Группа staff архива')[0]?.id
  assert.ok(groupId)

  await store.adminSetGroupArchived(actorToken, groupId, {
    enabled: true,
    reason: 'Проверка архива группы',
  })

  const ownerSnapshotAfterArchive = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  const invitedSnapshotAfterArchive = store.getSnapshotByToken(invitedToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  assert.equal(ownerSnapshotAfterArchive, undefined)
  assert.equal(invitedSnapshotAfterArchive, undefined)

  const invitedChatAfterArchive = store.getSnapshotByToken(invitedToken)?.chats.find(
    (chat) => chat.phone === owner.identifier,
  )
  const archivedInviteMessage = invitedChatAfterArchive?.messages.find(
    (message) => message.sourceGroup?.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  assert.ok(archivedInviteMessage?.sourceGroup?.archivedAt)
  assert.equal(archivedInviteMessage?.sourceGroup?.archiveReason, 'admin-archived')

  const archivedCopies = database.groups.filter(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  assert.equal(archivedCopies.length, 2)
  assert.equal(archivedCopies.every((group) => group.archiveReason === 'admin-archived'), true)

  await store.adminSetGroupArchived(actorToken, groupId, {
    enabled: false,
    reason: 'Проверка разархивации группы',
  })

  const ownerSnapshotAfterUnarchive = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  const invitedSnapshotAfterUnarchive = store.getSnapshotByToken(invitedToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  assert.ok(ownerSnapshotAfterUnarchive)
  assert.ok(invitedSnapshotAfterUnarchive)

  const invitedChatAfterUnarchive = store.getSnapshotByToken(invitedToken)?.chats.find(
    (chat) => chat.phone === owner.identifier,
  )
  const restoredInviteMessage = invitedChatAfterUnarchive?.messages.find(
    (message) => message.sourceGroup?.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  assert.equal(restoredInviteMessage?.sourceGroup?.archivedAt, undefined)
  assert.equal(restoredInviteMessage?.sourceGroup?.archiveReason, undefined)
  assert.equal(
    database.groups.every(
      (group) => group.sharedId !== invitationMessage!.sourceGroup!.sharedId || (!group.archivedAt && !group.archiveReason),
    ),
    true,
  )
})

test('admin group summary shows archived owner profile data instead of synthetic archived identifier', () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const archivedOwnerIdentifier = 'archived_ccbjiedfiadaebeajiffecfaihhjfbae'

  database.accounts.push({
    ...createAccount(archivedOwnerIdentifier),
    archivedOriginalIdentifier: '+79673215453',
    archivedProfile: {
      avatarImage: undefined,
      displayName: 'Алексей',
      nickname: undefined,
      status: undefined,
      surname: 'Мерзляков',
    },
    deletedAt: '2026-03-28T22:31:00.000Z',
    deletedBySelfService: true,
    deletionMode: 'account-and-user-data-hidden',
    displayName: 'Аккаунт удалён',
    identifier: archivedOwnerIdentifier,
    nickname: '',
    publicDeleted: true,
    status: '',
    surname: '',
  })

  database.groups.push({
    accent: '#8c5738',
    archivedAt: '2026-03-28T22:31:00.000Z',
    archiveReason: 'self-service-data-hidden',
    commentBlacklistIdentifiers: [],
    creatorIdentifier: archivedOwnerIdentifier,
    groupOwnerIdentifier: archivedOwnerIdentifier,
    handle: '@group_21',
    showHistoryToNewMembers: true,
    id: 21,
    latestActivityAt: '2026-03-28T22:30:00.000Z',
    members: 0,
    muted: false,
    ownerIdentifier: '+79990001999',
    participants: [],
    preview: 'Группа удалена',
    sharedId: '621d3eee-4854-454e-a38f-40b216163ed1',
    time: '22:30',
    title: 'Группа: Алексей Мерзляков',
    unread: 0,
  })

  const summary = store.adminListGroups('621d3eee-4854-454e-a38f-40b216163ed1')[0]
  assert.ok(summary)
  assert.equal(summary.owner.displayName, 'Алексей Мерзляков')
  assert.equal(summary.owner.identifier, '+79673215453')
  assert.equal(summary.owner.lookupIdentifier, archivedOwnerIdentifier)
  assert.equal(summary.creator.displayName, 'Алексей Мерзляков')
  assert.equal(summary.creator.identifier, '+79673215453')
})

test('admin group summary falls back to safe archived owner labels for malformed legacy archived owner records', () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const archivedOwnerIdentifier = 'archived_ccbjiedfiadaebeajiffecfaihhjfbae'

  database.accounts.push({
    ...createAccount(archivedOwnerIdentifier),
    archivedOriginalIdentifier: undefined,
    archivedProfile: undefined,
    deletedAt: '2026-03-28T22:31:00.000Z',
    deletedBySelfService: true,
    deletionMode: 'account-and-user-data-hidden',
    displayName: archivedOwnerIdentifier,
    identifier: archivedOwnerIdentifier,
    nickname: '',
    publicDeleted: true,
    status: '',
    surname: '',
  })

  database.groups.push({
    accent: '#8c5738',
    archivedAt: '2026-03-28T22:31:00.000Z',
    archiveReason: 'self-service-data-hidden',
    commentBlacklistIdentifiers: [],
    creatorIdentifier: archivedOwnerIdentifier,
    groupOwnerIdentifier: archivedOwnerIdentifier,
    handle: '@group_legacy_21',
    showHistoryToNewMembers: true,
    id: 22,
    latestActivityAt: '2026-03-28T22:30:00.000Z',
    members: 0,
    muted: false,
    ownerIdentifier: '+79990001998',
    participants: [],
    preview: 'Группа удалена',
    sharedId: '621d3eee-4854-454e-a38f-40b216163ed2',
    time: '22:30',
    title: 'Группа: Алексей Мерзляков',
    unread: 0,
  })

  const summary = store.adminListGroups('621d3eee-4854-454e-a38f-40b216163ed2')[0]
  assert.ok(summary)
  assert.equal(summary.owner.displayName, 'Алексей Мерзляков')
  assert.equal(summary.owner.identifier, 'Нет данных')
  assert.equal(summary.owner.lookupIdentifier, archivedOwnerIdentifier)
  assert.equal(summary.creator.displayName, 'Алексей Мерзляков')
  assert.equal(summary.creator.identifier, 'Нет данных')
})

test('admin archived thread disappears from user snapshots and unarchive restores it for members', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const actor = createAccount('+79990006031', { staffRole: 'owner' })
  const owner = createAccount('+79990006032')
  const invited = createAccount('+79990006033')

  database.accounts.push(actor, owner, invited)
  const actorToken = createSession(database, actor.identifier, 'thread-archive-actor')
  const ownerToken = createSession(database, owner.identifier, 'thread-archive-owner')
  const invitedToken = createSession(database, invited.identifier, 'thread-archive-invited')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  await store.createGroup(ownerToken, {
    description: 'Группа для админского архива треда',
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Группа staff архива треда',
  })

  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === invited.identifier &&
      message.sourceGroup?.sharedId,
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)

  await store.joinGroupBySharedId(invitedToken, invitationMessage!.sourceGroup!.sharedId!)

  const ownerGroup = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  const invitedGroup = store.getSnapshotByToken(invitedToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  assert.ok(ownerGroup)
  assert.ok(invitedGroup)
  for (const groupCopy of database.groups.filter((group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId)) {
    groupCopy.commentsEnabledForAll = true
  }

  await store.sendGroupMessage(ownerToken, ownerGroup!.id, {
    text: 'Корневое сообщение для архива треда',
  })

  const ownerRootBefore = store.getSnapshotByToken(ownerToken)?.groups
    .find((group) => group.id === ownerGroup!.id)
    ?.messages.find((message) => message.text === 'Корневое сообщение для архива треда')
  const invitedRootBefore = store.getSnapshotByToken(invitedToken)?.groups
    .find((group) => group.id === invitedGroup!.id)
    ?.messages.find((message) => message.text === 'Корневое сообщение для архива треда')
  assert.ok(ownerRootBefore?.threadId)
  assert.ok(invitedRootBefore?.threadId)

  await store.subscribeToGroupThread(ownerToken, ownerGroup!.id, ownerRootBefore!.id)
  await store.sendGroupThreadComment(invitedToken, invitedGroup!.id, invitedRootBefore!.id, {
    text: 'Первый комментарий в треде',
  })

  const thread = store.adminListThreads('Корневое сообщение для архива треда')[0]
  assert.ok(thread)
  assert.equal(thread?.archivedAt, undefined)

  const archivedThreads = await store.adminSetThreadArchived(actorToken, thread!.id, {
    enabled: true,
    reason: 'Проверка staff архива треда',
  })
  const archivedSummary = archivedThreads.threads.find((candidate) => candidate.id === thread!.id)
  assert.ok(archivedSummary?.archivedAt)
  assert.equal(archivedSummary?.archiveReason, 'admin-archived')
  assert.deepEqual(archivedThreads.broadcastIdentifiers.sort(), [invited.identifier, owner.identifier].sort())

  const ownerRootAfterArchive = store.getSnapshotByToken(ownerToken)?.groups
    .find((group) => group.id === ownerGroup!.id)
    ?.messages.find((message) => message.text === 'Корневое сообщение для архива треда')
  const invitedRootAfterArchive = store.getSnapshotByToken(invitedToken)?.groups
    .find((group) => group.id === invitedGroup!.id)
    ?.messages.find((message) => message.text === 'Корневое сообщение для архива треда')
  assert.equal(ownerRootAfterArchive?.threadId, undefined)
  assert.equal(invitedRootAfterArchive?.threadId, undefined)
  assert.equal(ownerRootAfterArchive?.threadComments?.length ?? 0, 0)
  assert.equal(invitedRootAfterArchive?.threadComments?.length ?? 0, 0)
  assert.equal(
    store.getSnapshotByToken(ownerToken)?.threadInbox.some((item) => item.sourceText === 'Корневое сообщение для архива треда'),
    false,
  )
  assert.equal(
    store.getSnapshotByToken(invitedToken)?.threadInbox.some((item) => item.sourceText === 'Корневое сообщение для архива треда'),
    false,
  )

  await assert.rejects(
    store.sendGroupThreadComment(invitedToken, invitedGroup!.id, invitedRootBefore!.id, {
      text: 'Комментарий после архива',
    }),
    /Обсуждение находится в архиве и недоступно пользователям/u,
  )

  const restoredThreads = await store.adminSetThreadArchived(actorToken, thread!.id, {
    enabled: false,
    reason: 'Проверка возврата треда из архива',
  })
  const restoredSummary = restoredThreads.threads.find((candidate) => candidate.id === thread!.id)
  assert.equal(restoredSummary?.archivedAt, undefined)
  assert.equal(restoredSummary?.archiveReason, undefined)

  const ownerRootAfterRestore = store.getSnapshotByToken(ownerToken)?.groups
    .find((group) => group.id === ownerGroup!.id)
    ?.messages.find((message) => message.text === 'Корневое сообщение для архива треда')
  const invitedRootAfterRestore = store.getSnapshotByToken(invitedToken)?.groups
    .find((group) => group.id === invitedGroup!.id)
    ?.messages.find((message) => message.text === 'Корневое сообщение для архива треда')
  assert.ok(ownerRootAfterRestore?.threadId)
  assert.ok(invitedRootAfterRestore?.threadId)
  assert.equal(ownerRootAfterRestore?.threadComments?.length ?? 0, 1)
  assert.equal(invitedRootAfterRestore?.threadComments?.length ?? 0, 1)
  assert.equal(
    store.getSnapshotByToken(ownerToken)?.threadInbox.some((item) => item.sourceText === 'Корневое сообщение для архива треда'),
    true,
  )
  assert.equal(
    store.getSnapshotByToken(invitedToken)?.threadInbox.some((item) => item.sourceText === 'Корневое сообщение для архива треда'),
    true,
  )
})

test('admin archived channel disappears from user snapshots and unarchive restores it for subscribers', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006041', { staffRole: 'owner' })
  const invited = createAccount('+79990006042')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'channel-archive-owner')
  const invitedToken = createSession(database, invited.identifier, 'channel-archive-invited')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@admin-archived-channel',
    statusText: 'Служебный канал',
    title: 'Архивируемый канал',
    visibility: 'private',
  })

  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, { text: 'Пост до архива' })
  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogResponse.dialogId],
  })
  await store.subscribeToChannelByHandle(invitedToken, '@admin-archived-channel')

  assert.equal(
    store.getSnapshotByToken(ownerToken)?.channels.some((channel) => channel.directLink === '@admin-archived-channel'),
    true,
  )
  assert.equal(
    store
      .getSnapshotByToken(invitedToken)
      ?.subscriptionChannels.some((channel) => channel.handle === '@admin-archived-channel'),
    true,
  )

  const archivedChannels = await store.adminSetManagedChannelArchived(ownerToken, '@admin-archived-channel', {
    enabled: true,
    reason: 'Проверка staff архива канала',
  })
  const archivedSummary = archivedChannels.channels.find((channel) => channel.handle === '@admin-archived-channel')
  assert.ok(archivedSummary?.archivedAt)
  assert.equal(archivedSummary?.archiveReason, 'admin-archived')
  assert.deepEqual(archivedChannels.broadcastIdentifiers.sort(), [invited.identifier, owner.identifier].sort())

  assert.equal(
    store.getSnapshotByToken(ownerToken)?.channels.some((channel) => channel.directLink === '@admin-archived-channel'),
    false,
  )
  assert.equal(
    store
      .getSnapshotByToken(invitedToken)
      ?.subscriptionChannels.some((channel) => channel.handle === '@admin-archived-channel'),
    false,
  )
  assert.throws(
    () => store.getSubscriptionChannelPreviewByHandle(invitedToken, '@admin-archived-channel'),
    /Доступ к каналу не разрешён/u,
  )

  const restoredChannels = await store.adminSetManagedChannelArchived(ownerToken, '@admin-archived-channel', {
    enabled: false,
    reason: 'Проверка возврата канала',
  })
  const restoredSummary = restoredChannels.channels.find((channel) => channel.handle === '@admin-archived-channel')
  assert.equal(restoredSummary?.archivedAt, undefined)
  assert.equal(restoredSummary?.archiveReason, undefined)
  assert.equal(
    store.getSnapshotByToken(ownerToken)?.channels.some((channel) => channel.directLink === '@admin-archived-channel'),
    true,
  )
  assert.equal(
    store
      .getSnapshotByToken(invitedToken)
      ?.subscriptionChannels.some((channel) => channel.handle === '@admin-archived-channel'),
    true,
  )

  const restoredPreview = store.getSubscriptionChannelPreviewByHandle(invitedToken, '@admin-archived-channel')
  assert.equal(restoredPreview.channel.title, 'Архивируемый канал')
})

test('root author gets unread thread inbox notifications for group replies without manual subscription', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006029')
  const invited = createAccount('+79990006030', {
    avatarImage: 'https://cdn.example.test/group-thread-comment-author-avatar.png',
  })

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'group-thread-root-owner')
  const invitedToken = createSession(database, invited.identifier, 'group-thread-root-invited')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  await store.createGroup(ownerToken, {
    avatarImage: 'https://cdn.example.test/group-thread-avatar.png',
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Тред root-author группы',
  })

  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === invited.identifier &&
      message.sourceGroup?.sharedId,
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)

  await store.joinGroupBySharedId(invitedToken, invitationMessage!.sourceGroup!.sharedId!)

  const ownerGroup = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  const invitedGroup = store.getSnapshotByToken(invitedToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  assert.ok(ownerGroup)
  assert.ok(invitedGroup)

  for (const groupCopy of database.groups.filter((group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId)) {
    groupCopy.commentsEnabledForAll = true
  }

  await store.sendGroupMessage(ownerToken, ownerGroup!.id, {
    text: 'Root-сообщение группы для badge',
  })

  const ownerRoot = store.getSnapshotByToken(ownerToken)?.groups
    .find((group) => group.id === ownerGroup!.id)
    ?.messages.find((message) => message.text === 'Root-сообщение группы для badge')
  const invitedRoot = store.getSnapshotByToken(invitedToken)?.groups
    .find((group) => group.id === invitedGroup!.id)
    ?.messages.find((message) => message.text === 'Root-сообщение группы для badge')
  assert.ok(ownerRoot)
  assert.ok(invitedRoot)

  await store.sendGroupThreadComment(invitedToken, invitedGroup!.id, invitedRoot!.id, {
    text: 'Комментарий участника в group-thread',
  })

  const ownerInboxItem = store
    .getSnapshotByToken(ownerToken)
    ?.threadInbox.find((item) => item.sourceText === 'Root-сообщение группы для badge')

  assert.ok(ownerInboxItem)
  assert.equal(ownerInboxItem?.kind, 'group')
  assert.equal(ownerInboxItem?.avatarImage, 'https://cdn.example.test/group-thread-avatar.png')
  assert.equal(
    ownerInboxItem?.latestCommentAuthorAvatarImage,
    'https://cdn.example.test/group-thread-comment-author-avatar.png',
  )
  assert.equal(ownerInboxItem?.unreadCount, 1)
})

test('root group message without comments does not create an implicit thread inbox item', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006091')
  const invited = createAccount('+79990006092')

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'group-thread-empty-root-owner')
  const invitedToken = createSession(database, invited.identifier, 'group-thread-empty-root-invited')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: invited.identifier })
  await store.createGroup(ownerToken, {
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Тред без комментариев у root-сообщения группы',
  })

  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === invited.identifier &&
      message.sourceGroup?.sharedId,
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)

  await store.joinGroupBySharedId(invitedToken, invitationMessage!.sourceGroup!.sharedId!)

  const ownerGroup = store.getSnapshotByToken(ownerToken)?.groups.find(
    (group) => group.sharedId === invitationMessage!.sourceGroup!.sharedId,
  )
  assert.ok(ownerGroup)

  await store.sendGroupMessage(ownerToken, ownerGroup!.id, {
    text: 'Root группы без комментариев',
  })

  const ownerInboxItem = store
    .getSnapshotByToken(ownerToken)
    ?.threadInbox.find((item) => item.sourceText === 'Root группы без комментариев')

  assert.equal(ownerInboxItem, undefined)
})

test('channel post owner gets unread thread inbox notifications for subscriber replies without manual subscription', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006032')
  const invited = createAccount('+79990006033', {
    avatarImage: 'https://cdn.example.test/channel-thread-comment-author-avatar.png',
  })

  database.accounts.push(owner, invited)
  const ownerToken = createSession(database, owner.identifier, 'channel-thread-root-owner')
  const invitedToken = createSession(database, invited.identifier, 'channel-thread-root-invited')

  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarImage: 'https://cdn.example.test/channel-thread-avatar.png',
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@thread-root-owner-channel',
    statusText: 'Тест thread inbox',
    title: 'Канал root-author треда',
    visibility: 'public',
  })

  await store.subscribeToChannelByHandle(invitedToken, '@thread-root-owner-channel')
  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    text: 'Root-пост канала для badge',
  })

  const ownerChannelPreview = store.getSubscriptionChannelPreviewByHandle(ownerToken, '@thread-root-owner-channel')
  const invitedChannelPreview = store.getSubscriptionChannelPreviewByHandle(invitedToken, '@thread-root-owner-channel')
  const invitedChannel = store.getSnapshotByToken(invitedToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@thread-root-owner-channel',
  )
  assert.ok(invitedChannel)

  const ownerPost = ownerChannelPreview.channel.posts.find((post) => post.text === 'Root-пост канала для badge')
  const invitedPost = invitedChannelPreview.channel.posts.find((post) => post.text === 'Root-пост канала для badge')
  assert.ok(ownerPost)
  assert.ok(invitedPost)

  await store.sendSubscriptionChannelThreadComment(invitedToken, invitedChannel!.id, invitedPost!.id, {
    text: 'Комментарий подписчика в channel-thread',
  })

  const ownerInboxItem = store
    .getSnapshotByToken(ownerToken)
    ?.threadInbox.find((item) => item.sourceText === 'Root-пост канала для badge')

  assert.ok(ownerInboxItem)
  assert.equal(ownerInboxItem?.kind, 'channel')
  assert.equal(ownerInboxItem?.avatarImage, 'https://cdn.example.test/channel-thread-avatar.png')
  assert.equal(
    ownerInboxItem?.latestCommentAuthorAvatarImage,
    'https://cdn.example.test/channel-thread-comment-author-avatar.png',
  )
  assert.equal(ownerInboxItem?.unreadCount, 1)
})

test('root channel post without comments does not create an implicit thread inbox item', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006093')

  database.accounts.push(owner)
  const ownerToken = createSession(database, owner.identifier, 'channel-thread-empty-root-owner')

  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@thread-empty-root-channel',
    statusText: 'Тест пустого root-треда',
    title: 'Канал без комментариев у root-поста',
    visibility: 'public',
  })

  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    text: 'Root канала без комментариев',
  })

  const ownerInboxItem = store
    .getSnapshotByToken(ownerToken)
    ?.threadInbox.find((item) => item.sourceText === 'Root канала без комментариев')

  assert.equal(ownerInboxItem, undefined)
})

test('group thread participants keep unread notifications when a peer reply lands in the same millisecond', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006051')
  const member = createAccount('+79990006052')
  const third = createAccount('+79990006053')

  database.accounts.push(owner, member, third)
  const ownerToken = createSession(database, owner.identifier, 'group-thread-participant-owner')
  const memberToken = createSession(database, member.identifier, 'group-thread-participant-member')
  const thirdToken = createSession(database, third.identifier, 'group-thread-participant-third')

  const memberDialog = await store.openDirectDialog(ownerToken, { identifier: member.identifier })
  const thirdDialog = await store.openDirectDialog(ownerToken, { identifier: third.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    memberDialogIds: [memberDialog.dialogId, thirdDialog.dialogId],
    title: 'Group participant unread same-ms',
  })

  const invitationMessages = database.dialogMessages.filter(
    (message) => message.sourceGroup?.sharedId,
  )
  const memberSharedId = invitationMessages.find(
    (message) => message.ownerIdentifier === member.identifier,
  )?.sourceGroup?.sharedId
  const thirdSharedId = invitationMessages.find(
    (message) => message.ownerIdentifier === third.identifier,
  )?.sourceGroup?.sharedId
  assert.ok(memberSharedId)
  assert.ok(thirdSharedId)

  await store.joinGroupBySharedId(memberToken, memberSharedId!)
  await store.joinGroupBySharedId(thirdToken, thirdSharedId!)

  for (const groupCopy of database.groups.filter((group) => group.sharedId === memberSharedId)) {
    groupCopy.commentsEnabledForAll = true
  }

  await store.sendGroupMessage(ownerToken, createdGroup.groupId, {
    text: 'Root group thread same-ms',
  })

  const memberGroup = store.getSnapshotByToken(memberToken)?.groups.find(
    (group) => group.sharedId === memberSharedId,
  )
  const thirdGroup = store.getSnapshotByToken(thirdToken)?.groups.find(
    (group) => group.sharedId === memberSharedId,
  )
  const memberRoot = memberGroup?.messages.find((message) => message.text === 'Root group thread same-ms')
  const thirdRoot = thirdGroup?.messages.find((message) => message.text === 'Root group thread same-ms')
  assert.ok(memberGroup)
  assert.ok(thirdGroup)
  assert.ok(memberRoot)
  assert.ok(thirdRoot)

  await withMockedSystemTime('2026-04-06T08:22:00.000Z', async () => {
    await store.sendGroupThreadComment(memberToken, memberGroup!.id, memberRoot!.id, {
      text: 'Первый комментарий участника',
    })
    await store.sendGroupThreadComment(thirdToken, thirdGroup!.id, thirdRoot!.id, {
      text: 'Ответ в ту же миллисекунду',
    })
  })

  const memberInboxItem = store
    .getSnapshotByToken(memberToken)
    ?.threadInbox.find((item) => item.sourceText === 'Root group thread same-ms')

  assert.ok(memberInboxItem)
  assert.equal(memberInboxItem?.kind, 'group')
  assert.equal(memberInboxItem?.unreadCount, 1)
})

test('channel thread participants keep unread notifications when a peer reply lands in the same millisecond', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006061')
  const member = createAccount('+79990006062')
  const third = createAccount('+79990006063')

  database.accounts.push(owner, member, third)
  const ownerToken = createSession(database, owner.identifier, 'channel-thread-participant-owner')
  const memberToken = createSession(database, member.identifier, 'channel-thread-participant-member')
  const thirdToken = createSession(database, third.identifier, 'channel-thread-participant-third')

  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@channel-thread-same-ms',
    statusText: 'Тест same-ms unread',
    title: 'Channel participant unread same-ms',
    visibility: 'public',
  })

  await store.subscribeToChannelByHandle(memberToken, '@channel-thread-same-ms')
  await store.subscribeToChannelByHandle(thirdToken, '@channel-thread-same-ms')
  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    text: 'Root channel thread same-ms',
  })

  const memberPreview = store.getSubscriptionChannelPreviewByHandle(memberToken, '@channel-thread-same-ms')
  const thirdPreview = store.getSubscriptionChannelPreviewByHandle(thirdToken, '@channel-thread-same-ms')
  const memberChannel = store.getSnapshotByToken(memberToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@channel-thread-same-ms',
  )
  const thirdChannel = store.getSnapshotByToken(thirdToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@channel-thread-same-ms',
  )
  const memberPost = memberPreview.channel.posts.find((post) => post.text === 'Root channel thread same-ms')
  const thirdPost = thirdPreview.channel.posts.find((post) => post.text === 'Root channel thread same-ms')
  assert.ok(memberChannel)
  assert.ok(thirdChannel)
  assert.ok(memberPost)
  assert.ok(thirdPost)

  await withMockedSystemTime('2026-04-06T08:22:00.000Z', async () => {
    await store.sendSubscriptionChannelThreadComment(memberToken, memberChannel!.id, memberPost!.id, {
      text: 'Первый комментарий подписчика',
    })
    await store.sendSubscriptionChannelThreadComment(thirdToken, thirdChannel!.id, thirdPost!.id, {
      text: 'Ответ в ту же миллисекунду',
    })
  })

  const memberInboxItem = store
    .getSnapshotByToken(memberToken)
    ?.threadInbox.find((item) => item.sourceText === 'Root channel thread same-ms')

  assert.ok(memberInboxItem)
  assert.equal(memberInboxItem?.kind, 'channel')
  assert.equal(memberInboxItem?.unreadCount, 1)
})

test('explicit group thread subscription on an empty thread still gets unread after the first peer reply', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006071')
  const member = createAccount('+79990006072')
  const third = createAccount('+79990006073')

  database.accounts.push(owner, member, third)
  const ownerToken = createSession(database, owner.identifier, 'group-thread-empty-sub-owner')
  const memberToken = createSession(database, member.identifier, 'group-thread-empty-sub-member')
  const thirdToken = createSession(database, third.identifier, 'group-thread-empty-sub-third')

  const memberDialog = await store.openDirectDialog(ownerToken, { identifier: member.identifier })
  const thirdDialog = await store.openDirectDialog(ownerToken, { identifier: third.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    memberDialogIds: [memberDialog.dialogId, thirdDialog.dialogId],
    title: 'Group explicit subscribe empty-thread',
  })

  const invitationMessages = database.dialogMessages.filter((message) => message.sourceGroup?.sharedId)
  const memberSharedId = invitationMessages.find(
    (message) => message.ownerIdentifier === member.identifier,
  )?.sourceGroup?.sharedId
  const thirdSharedId = invitationMessages.find(
    (message) => message.ownerIdentifier === third.identifier,
  )?.sourceGroup?.sharedId
  assert.ok(memberSharedId)
  assert.ok(thirdSharedId)

  await store.joinGroupBySharedId(memberToken, memberSharedId!)
  await store.joinGroupBySharedId(thirdToken, thirdSharedId!)

  for (const groupCopy of database.groups.filter((group) => group.sharedId === memberSharedId)) {
    groupCopy.commentsEnabledForAll = true
  }

  await store.sendGroupMessage(ownerToken, createdGroup.groupId, {
    text: 'Root group thread empty subscription',
  })

  const memberGroup = store.getSnapshotByToken(memberToken)?.groups.find(
    (group) => group.sharedId === memberSharedId,
  )
  const thirdGroup = store.getSnapshotByToken(thirdToken)?.groups.find(
    (group) => group.sharedId === memberSharedId,
  )
  const memberRoot = memberGroup?.messages.find((message) => message.text === 'Root group thread empty subscription')
  const thirdRoot = thirdGroup?.messages.find((message) => message.text === 'Root group thread empty subscription')
  assert.ok(memberGroup)
  assert.ok(thirdGroup)
  assert.ok(memberRoot)
  assert.ok(thirdRoot)

  await store.subscribeToGroupThread(memberToken, memberGroup!.id, memberRoot!.id)
  await store.sendGroupThreadComment(thirdToken, thirdGroup!.id, thirdRoot!.id, {
    text: 'Первый комментарий после пустой подписки',
  })

  const memberInboxItem = store
    .getSnapshotByToken(memberToken)
    ?.threadInbox.find((item) => item.sourceText === 'Root group thread empty subscription')

  assert.ok(memberInboxItem)
  assert.equal(memberInboxItem?.kind, 'group')
  assert.equal(memberInboxItem?.unreadCount, 1)
})

test('explicit channel thread subscription on an empty thread still gets unread after the first peer reply', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006081')
  const member = createAccount('+79990006082')
  const third = createAccount('+79990006083')

  database.accounts.push(owner, member, third)
  const ownerToken = createSession(database, owner.identifier, 'channel-thread-empty-sub-owner')
  const memberToken = createSession(database, member.identifier, 'channel-thread-empty-sub-member')
  const thirdToken = createSession(database, third.identifier, 'channel-thread-empty-sub-third')

  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@channel-thread-empty-sub',
    statusText: 'Тест пустой подписки на тред',
    title: 'Channel explicit subscribe empty-thread',
    visibility: 'public',
  })

  await store.subscribeToChannelByHandle(memberToken, '@channel-thread-empty-sub')
  await store.subscribeToChannelByHandle(thirdToken, '@channel-thread-empty-sub')
  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    text: 'Root channel thread empty subscription',
  })

  const memberPreview = store.getSubscriptionChannelPreviewByHandle(memberToken, '@channel-thread-empty-sub')
  const thirdPreview = store.getSubscriptionChannelPreviewByHandle(thirdToken, '@channel-thread-empty-sub')
  const memberChannel = store.getSnapshotByToken(memberToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@channel-thread-empty-sub',
  )
  const thirdChannel = store.getSnapshotByToken(thirdToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@channel-thread-empty-sub',
  )
  const memberPost = memberPreview.channel.posts.find((post) => post.text === 'Root channel thread empty subscription')
  const thirdPost = thirdPreview.channel.posts.find((post) => post.text === 'Root channel thread empty subscription')
  assert.ok(memberChannel)
  assert.ok(thirdChannel)
  assert.ok(memberPost)
  assert.ok(thirdPost)

  await store.subscribeToSubscriptionChannelThread(memberToken, memberChannel!.id, memberPost!.id)
  await store.sendSubscriptionChannelThreadComment(thirdToken, thirdChannel!.id, thirdPost!.id, {
    text: 'Первый комментарий после пустой подписки',
  })

  const memberInboxItem = store
    .getSnapshotByToken(memberToken)
    ?.threadInbox.find((item) => item.sourceText === 'Root channel thread empty subscription')

  assert.ok(memberInboxItem)
  assert.equal(memberInboxItem?.kind, 'channel')
  assert.equal(memberInboxItem?.unreadCount, 1)
})

test('marking a group thread read clears all unread replies, including the latest reply in the same millisecond', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006091')
  const member = createAccount('+79990006092')
  const third = createAccount('+79990006093')

  database.accounts.push(owner, member, third)
  const ownerToken = createSession(database, owner.identifier, 'group-thread-read-owner')
  const memberToken = createSession(database, member.identifier, 'group-thread-read-member')
  const thirdToken = createSession(database, third.identifier, 'group-thread-read-third')

  const memberDialog = await store.openDirectDialog(ownerToken, { identifier: member.identifier })
  const thirdDialog = await store.openDirectDialog(ownerToken, { identifier: third.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    memberDialogIds: [memberDialog.dialogId, thirdDialog.dialogId],
    title: 'Group thread read all unread',
  })

  const invitationMessages = database.dialogMessages.filter((message) => message.sourceGroup?.sharedId)
  const memberSharedId = invitationMessages.find(
    (message) => message.ownerIdentifier === member.identifier,
  )?.sourceGroup?.sharedId
  const thirdSharedId = invitationMessages.find(
    (message) => message.ownerIdentifier === third.identifier,
  )?.sourceGroup?.sharedId
  assert.ok(memberSharedId)
  assert.ok(thirdSharedId)

  await store.joinGroupBySharedId(memberToken, memberSharedId!)
  await store.joinGroupBySharedId(thirdToken, thirdSharedId!)

  for (const groupCopy of database.groups.filter((group) => group.sharedId === memberSharedId)) {
    groupCopy.commentsEnabledForAll = true
  }

  await withMockedSystemTime('2026-04-08T18:14:59.000Z', async () => {
    await store.sendGroupMessage(ownerToken, createdGroup.groupId, {
      text: 'Group thread read root',
    })
  })

  const memberGroup = store.getSnapshotByToken(memberToken)?.groups.find((group) => group.sharedId === memberSharedId)
  const thirdGroup = store.getSnapshotByToken(thirdToken)?.groups.find((group) => group.sharedId === memberSharedId)
  const ownerGroup = store.getSnapshotByToken(ownerToken)?.groups.find((group) => group.id === createdGroup.groupId)
  const memberRoot = memberGroup?.messages.find((message) => message.text === 'Group thread read root')
  const thirdRoot = thirdGroup?.messages.find((message) => message.text === 'Group thread read root')
  const ownerRoot = ownerGroup?.messages.find((message) => message.text === 'Group thread read root')
  assert.ok(memberGroup)
  assert.ok(thirdGroup)
  assert.ok(ownerGroup)
  assert.ok(memberRoot)
  assert.ok(thirdRoot)
  assert.ok(ownerRoot)

  await store.subscribeToGroupThread(memberToken, memberGroup!.id, memberRoot!.id)
  await withMockedSystemTime('2026-04-08T18:15:00.000Z', async () => {
    await store.sendGroupThreadComment(thirdToken, thirdGroup!.id, thirdRoot!.id, {
      text: 'Первый unread',
    })
    await store.sendGroupThreadComment(ownerToken, ownerGroup!.id, ownerRoot!.id, {
      text: 'Второй unread',
    })
    await store.sendGroupThreadComment(thirdToken, thirdGroup!.id, thirdRoot!.id, {
      text: 'Третий unread',
    })
  })

  const unreadBeforeRead = store
    .getSnapshotByToken(memberToken)
    ?.threadInbox.find((item) => item.sourceText === 'Group thread read root')
  assert.equal(unreadBeforeRead?.unreadCount, 3)

  await store.markGroupThreadRead(memberToken, memberGroup!.id, memberRoot!.id)

  const unreadAfterRead = store
    .getSnapshotByToken(memberToken)
    ?.threadInbox.find((item) => item.sourceText === 'Group thread read root')
  assert.equal(unreadAfterRead?.unreadCount, 0)
})

test('marking a channel thread read clears all unread replies, including the latest reply in the same millisecond', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006101')
  const member = createAccount('+79990006102')
  const third = createAccount('+79990006103')

  database.accounts.push(owner, member, third)
  const ownerToken = createSession(database, owner.identifier, 'channel-thread-read-owner')
  const memberToken = createSession(database, member.identifier, 'channel-thread-read-member')
  const thirdToken = createSession(database, third.identifier, 'channel-thread-read-third')

  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@channel-thread-read-all-unread',
    statusText: 'Тест полного сброса unread',
    title: 'Channel thread read all unread',
    visibility: 'public',
  })

  await store.subscribeToChannelByHandle(memberToken, '@channel-thread-read-all-unread')
  await store.subscribeToChannelByHandle(thirdToken, '@channel-thread-read-all-unread')
  await withMockedSystemTime('2026-04-08T18:29:59.000Z', async () => {
    await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
      text: 'Channel thread read root',
    })
  })

  const memberPreview = store.getSubscriptionChannelPreviewByHandle(memberToken, '@channel-thread-read-all-unread')
  const thirdPreview = store.getSubscriptionChannelPreviewByHandle(thirdToken, '@channel-thread-read-all-unread')
  const memberChannel = store.getSnapshotByToken(memberToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@channel-thread-read-all-unread',
  )
  const thirdChannel = store.getSnapshotByToken(thirdToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@channel-thread-read-all-unread',
  )
  const ownerChannel = store.getSnapshotByToken(ownerToken)?.subscriptionChannels.find(
    (channel) => channel.id === createdChannel.channelId,
  )
  const memberPost = memberPreview.channel.posts.find((post) => post.text === 'Channel thread read root')
  const thirdPost = thirdPreview.channel.posts.find((post) => post.text === 'Channel thread read root')
  const ownerPost = ownerChannel?.posts.find((post) => post.text === 'Channel thread read root')
  assert.ok(memberChannel)
  assert.ok(thirdChannel)
  assert.ok(ownerChannel)
  assert.ok(memberPost)
  assert.ok(thirdPost)
  assert.ok(ownerPost)

  await store.subscribeToSubscriptionChannelThread(memberToken, memberChannel!.id, memberPost!.id)
  await withMockedSystemTime('2026-04-08T18:30:00.000Z', async () => {
    await store.sendSubscriptionChannelThreadComment(thirdToken, thirdChannel!.id, thirdPost!.id, {
      text: 'Первый unread',
    })
    await store.sendSubscriptionChannelThreadComment(ownerToken, ownerChannel!.id, ownerPost!.id, {
      text: 'Второй unread',
    })
    await store.sendSubscriptionChannelThreadComment(thirdToken, thirdChannel!.id, thirdPost!.id, {
      text: 'Третий unread',
    })
  })

  const unreadBeforeRead = store
    .getSnapshotByToken(memberToken)
    ?.threadInbox.find((item) => item.sourceText === 'Channel thread read root')
  assert.equal(unreadBeforeRead?.unreadCount, 3)

  await store.markSubscriptionChannelThreadRead(memberToken, memberChannel!.id, memberPost!.id)

  const unreadAfterRead = store
    .getSnapshotByToken(memberToken)
    ?.threadInbox.find((item) => item.sourceText === 'Channel thread read root')
  assert.equal(unreadAfterRead?.unreadCount, 0)
})

test('owner can still discover legacy channel records when stored owner identifier is not normalized', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006031')

  database.accounts.push(owner)
  const ownerToken = createSession(database, owner.identifier, 'legacy-owner-search')

  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@старый_канал_поиска',
    statusText: 'Легаси канал',
    title: 'Старый канал поиска',
    visibility: 'private',
  })

  const managedChannel = database.managedChannels.find((channel) => channel.id === createdChannel.channelId)
  assert.ok(managedChannel)
  managedChannel.ownerIdentifier = '8 (999) 000-60-31'

  const results = store.searchSubscriptionChannels(ownerToken, 'старый канал')
  assert.equal(results.length, 1)
  assert.equal(results[0]?.handle, '@старый_канал_поиска')
})
