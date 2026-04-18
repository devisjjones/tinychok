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
    nickname?: string
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
    createdAt: '2026-04-18T00:00:00.000Z',
    deletedAt: undefined,
    deletedBySelfService: undefined,
    deletionMode: undefined,
    displayName: options?.displayName ?? `User ${identifier}`,
    gifLibrary: [],
    identifier,
    isTestEntity: false,
    lastActiveAt: '2026-04-18T00:00:00.000Z',
    nickname: options?.nickname ?? '',
    passwordHash: undefined,
    passwordSetAt: undefined,
    premium: false,
    premiumExpiresAt: undefined,
    publicDeleted: undefined,
    quietModeEnabled: false,
    soundsDisabled: false,
    staffRole: undefined,
    status: '',
    surname: options?.surname ?? '',
  }
}

function createSession(database: Database, identifier: string, suffix: string) {
  const token = `session-${suffix}`
  database.sessions.push({
    createdAt: '2026-04-18T00:00:00.000Z',
    expiresAt: '2026-05-18T00:00:00.000Z',
    identifier,
    token,
  })
  return token
}

async function connectAccounts(
  store: TinychokStore,
  leftToken: string,
  rightToken: string,
  rightIdentifier: string,
  leftIdentifier: string,
) {
  const opened = await store.openDirectDialog(leftToken, { identifier: rightIdentifier })
  await store.sendContactRequest(leftToken, { identifier: rightIdentifier })
  await store.acceptContactRequest(rightToken, leftIdentifier)

  const rightDialogId = store.getSnapshotByToken(rightToken)?.chats.find(
    (chat) => chat.phone === leftIdentifier,
  )?.id
  assert.ok(rightDialogId)

  return {
    leftDialogId: opened.dialogId,
    rightDialogId,
  }
}

function findReaction(
  reactions: Array<{ count: number; emoji: string; reactedByMe: boolean }> | undefined,
  emoji: string,
) {
  return reactions?.find((reaction) => reaction.emoji === emoji)
}

test.before(() => {
  console.info = () => undefined
})

test.after(() => {
  console.info = originalConsoleInfo
})

test('direct message reactions mirror across dialog copies, replace previous emoji and support removal', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const left = createAccount('+79990120101', { displayName: 'Алексей' })
  const right = createAccount('+79990120102', { displayName: 'Мира' })

  database.accounts.push(left, right)
  const leftToken = createSession(database, left.identifier, 'direct-left')
  const rightToken = createSession(database, right.identifier, 'direct-right')

  const dialogs = await connectAccounts(
    store,
    leftToken,
    rightToken,
    right.identifier,
    left.identifier,
  )

  await store.sendDirectMessage(leftToken, dialogs.leftDialogId, {
    text: 'Сообщение с реакциями',
  })

  let leftMessage = store.getSnapshotByToken(leftToken)?.chats
    .find((chat) => chat.id === dialogs.leftDialogId)
    ?.messages.find((message) => message.text === 'Сообщение с реакциями')
  let rightMessage = store.getSnapshotByToken(rightToken)?.chats
    .find((chat) => chat.id === dialogs.rightDialogId)
    ?.messages.find((message) => message.text === 'Сообщение с реакциями')
  assert.ok(leftMessage)
  assert.ok(rightMessage)

  await store.setDirectMessageReaction(leftToken, dialogs.leftDialogId, leftMessage.id, {
    emoji: '🔥',
  })

  leftMessage = store.getSnapshotByToken(leftToken)?.chats
    .find((chat) => chat.id === dialogs.leftDialogId)
    ?.messages.find((message) => message.id === leftMessage!.id)
  rightMessage = store.getSnapshotByToken(rightToken)?.chats
    .find((chat) => chat.id === dialogs.rightDialogId)
    ?.messages.find((message) => message.id === rightMessage!.id)
  assert.equal(findReaction(leftMessage?.reactions, '🔥')?.count, 1)
  assert.equal(findReaction(leftMessage?.reactions, '🔥')?.reactedByMe, true)
  assert.equal(findReaction(rightMessage?.reactions, '🔥')?.count, 1)
  assert.equal(findReaction(rightMessage?.reactions, '🔥')?.reactedByMe, false)

  await store.setDirectMessageReaction(rightToken, dialogs.rightDialogId, rightMessage!.id, {
    emoji: '🔥',
  })

  leftMessage = store.getSnapshotByToken(leftToken)?.chats
    .find((chat) => chat.id === dialogs.leftDialogId)
    ?.messages.find((message) => message.id === leftMessage!.id)
  rightMessage = store.getSnapshotByToken(rightToken)?.chats
    .find((chat) => chat.id === dialogs.rightDialogId)
    ?.messages.find((message) => message.id === rightMessage!.id)
  assert.equal(findReaction(leftMessage?.reactions, '🔥')?.count, 2)
  assert.equal(findReaction(leftMessage?.reactions, '🔥')?.reactedByMe, true)
  assert.equal(findReaction(rightMessage?.reactions, '🔥')?.count, 2)
  assert.equal(findReaction(rightMessage?.reactions, '🔥')?.reactedByMe, true)

  await store.setDirectMessageReaction(leftToken, dialogs.leftDialogId, leftMessage!.id, {
    emoji: '❤️',
  })

  leftMessage = store.getSnapshotByToken(leftToken)?.chats
    .find((chat) => chat.id === dialogs.leftDialogId)
    ?.messages.find((message) => message.id === leftMessage!.id)
  rightMessage = store.getSnapshotByToken(rightToken)?.chats
    .find((chat) => chat.id === dialogs.rightDialogId)
    ?.messages.find((message) => message.id === rightMessage!.id)
  assert.equal(findReaction(leftMessage?.reactions, '🔥')?.count, 1)
  assert.equal(findReaction(leftMessage?.reactions, '🔥')?.reactedByMe, false)
  assert.equal(findReaction(leftMessage?.reactions, '❤️')?.count, 1)
  assert.equal(findReaction(leftMessage?.reactions, '❤️')?.reactedByMe, true)
  assert.equal(findReaction(rightMessage?.reactions, '🔥')?.count, 1)
  assert.equal(findReaction(rightMessage?.reactions, '🔥')?.reactedByMe, true)
  assert.equal(findReaction(rightMessage?.reactions, '❤️')?.count, 1)
  assert.equal(findReaction(rightMessage?.reactions, '❤️')?.reactedByMe, false)

  await store.setDirectMessageReaction(leftToken, dialogs.leftDialogId, leftMessage!.id, {
    emoji: null,
  })

  leftMessage = store.getSnapshotByToken(leftToken)?.chats
    .find((chat) => chat.id === dialogs.leftDialogId)
    ?.messages.find((message) => message.id === leftMessage!.id)
  rightMessage = store.getSnapshotByToken(rightToken)?.chats
    .find((chat) => chat.id === dialogs.rightDialogId)
    ?.messages.find((message) => message.id === rightMessage!.id)
  assert.equal(leftMessage?.reactions?.length, 1)
  assert.equal(findReaction(leftMessage?.reactions, '🔥')?.count, 1)
  assert.equal(findReaction(leftMessage?.reactions, '🔥')?.reactedByMe, false)
  assert.equal(rightMessage?.reactions?.length, 1)
  assert.equal(findReaction(rightMessage?.reactions, '🔥')?.count, 1)
  assert.equal(findReaction(rightMessage?.reactions, '🔥')?.reactedByMe, true)
})

test('group reactions stay in sync for root messages and thread comments for every participant copy', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990120201', { displayName: 'Алексей' })
  const member = createAccount('+79990120202', { displayName: 'Мира' })

  database.accounts.push(owner, member)
  const ownerToken = createSession(database, owner.identifier, 'group-owner')
  const memberToken = createSession(database, member.identifier, 'group-member')

  const dialogs = await connectAccounts(
    store,
    ownerToken,
    memberToken,
    member.identifier,
    owner.identifier,
  )

  const createdGroup = await store.createGroup(ownerToken, {
    commentsEnabledForAll: true,
    memberDialogIds: [dialogs.leftDialogId],
    title: 'Группа реакций',
  })
  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === member.identifier &&
      message.sourceGroup?.sharedId,
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)
  const joinedGroup = await store.joinGroupBySharedId(
    memberToken,
    invitationMessage!.sourceGroup!.sharedId!,
  )

  await store.sendGroupMessage(ownerToken, createdGroup.groupId, { text: 'Корневое сообщение' })

  let ownerRoot = store.getSnapshotByToken(ownerToken)?.groups
    .find((group) => group.id === createdGroup.groupId)
    ?.messages.find((message) => message.text === 'Корневое сообщение')
  let memberRoot = store.getSnapshotByToken(memberToken)?.groups
    .find((group) => group.id === joinedGroup.groupId)
    ?.messages.find((message) => message.text === 'Корневое сообщение')
  assert.ok(ownerRoot)
  assert.ok(memberRoot)

  await store.sendGroupThreadComment(ownerToken, createdGroup.groupId, ownerRoot.id, {
    text: 'Комментарий в треде',
  })

  let ownerComment = store.getSnapshotByToken(ownerToken)?.groups
    .find((group) => group.id === createdGroup.groupId)
    ?.messages.find((message) => message.id === ownerRoot!.id)
    ?.threadComments?.find((comment) => comment.text === 'Комментарий в треде')
  let memberComment = store.getSnapshotByToken(memberToken)?.groups
    .find((group) => group.id === joinedGroup.groupId)
    ?.messages.find((message) => message.id === memberRoot!.id)
    ?.threadComments?.find((comment) => comment.text === 'Комментарий в треде')
  assert.ok(ownerComment)
  assert.ok(memberComment)

  await store.setGroupMessageReaction(ownerToken, createdGroup.groupId, ownerRoot.id, {
    emoji: '🔥',
  })
  await store.setGroupMessageReaction(memberToken, joinedGroup.groupId, memberRoot.id, {
    emoji: '🔥',
  })

  ownerRoot = store.getSnapshotByToken(ownerToken)?.groups
    .find((group) => group.id === createdGroup.groupId)
    ?.messages.find((message) => message.id === ownerRoot!.id)
  memberRoot = store.getSnapshotByToken(memberToken)?.groups
    .find((group) => group.id === joinedGroup.groupId)
    ?.messages.find((message) => message.id === memberRoot!.id)
  assert.equal(findReaction(ownerRoot?.reactions, '🔥')?.count, 2)
  assert.equal(findReaction(ownerRoot?.reactions, '🔥')?.reactedByMe, true)
  assert.equal(findReaction(memberRoot?.reactions, '🔥')?.count, 2)
  assert.equal(findReaction(memberRoot?.reactions, '🔥')?.reactedByMe, true)

  await store.setGroupThreadCommentReaction(
    ownerToken,
    createdGroup.groupId,
    ownerRoot!.id,
    ownerComment!.id,
    { emoji: '❤️' },
  )
  await store.setGroupThreadCommentReaction(
    memberToken,
    joinedGroup.groupId,
    memberRoot!.id,
    memberComment!.id,
    { emoji: '❤️' },
  )

  ownerComment = store.getSnapshotByToken(ownerToken)?.groups
    .find((group) => group.id === createdGroup.groupId)
    ?.messages.find((message) => message.id === ownerRoot!.id)
    ?.threadComments?.find((comment) => comment.id === ownerComment!.id)
  memberComment = store.getSnapshotByToken(memberToken)?.groups
    .find((group) => group.id === joinedGroup.groupId)
    ?.messages.find((message) => message.id === memberRoot!.id)
    ?.threadComments?.find((comment) => comment.id === memberComment!.id)
  assert.equal(findReaction(ownerComment?.reactions, '❤️')?.count, 2)
  assert.equal(findReaction(ownerComment?.reactions, '❤️')?.reactedByMe, true)
  assert.equal(findReaction(memberComment?.reactions, '❤️')?.count, 2)
  assert.equal(findReaction(memberComment?.reactions, '❤️')?.reactedByMe, true)
})

test('channel reactions stay in sync for posts and thread comments for owner and subscriber copies', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990120301', { displayName: 'Алексей' })
  const member = createAccount('+79990120302', { displayName: 'Мира' })

  database.accounts.push(owner, member)
  const ownerToken = createSession(database, owner.identifier, 'channel-owner')
  const memberToken = createSession(database, member.identifier, 'channel-member')

  const dialogs = await connectAccounts(
    store,
    ownerToken,
    memberToken,
    member.identifier,
    owner.identifier,
  )

  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@reactions-room',
    title: 'Канал реакций',
    visibility: 'private',
  })

  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogs.leftDialogId],
  })
  const subscribedChannel = await store.subscribeToChannelByHandle(memberToken, '@reactions-room')

  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    text: 'Пост с реакциями',
  })

  const ownerChannel = store.getSnapshotByToken(ownerToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@reactions-room',
  )
  const memberChannel = store.getSnapshotByToken(memberToken)?.subscriptionChannels.find(
    (channel) => channel.id === subscribedChannel.channelId,
  )
  let ownerPost = ownerChannel?.posts.find((post) => post.text === 'Пост с реакциями')
  let memberPost = memberChannel?.posts.find((post) => post.text === 'Пост с реакциями')
  assert.ok(ownerChannel)
  assert.ok(memberChannel)
  assert.ok(ownerPost)
  assert.ok(memberPost)

  await store.sendSubscriptionChannelThreadComment(memberToken, memberChannel.id, memberPost.id, {
    text: 'Комментарий подписчика',
  })

  let ownerComment = store.getSnapshotByToken(ownerToken)?.subscriptionChannels
    .find((channel) => channel.id === ownerChannel!.id)
    ?.posts.find((post) => post.id === ownerPost!.id)
    ?.threadComments?.find((comment) => comment.text === 'Комментарий подписчика')
  let memberComment = store.getSnapshotByToken(memberToken)?.subscriptionChannels
    .find((channel) => channel.id === memberChannel!.id)
    ?.posts.find((post) => post.id === memberPost!.id)
    ?.threadComments?.find((comment) => comment.text === 'Комментарий подписчика')
  assert.ok(ownerComment)
  assert.ok(memberComment)

  await store.setSubscriptionChannelPostReaction(ownerToken, ownerChannel.id, ownerPost.id, {
    emoji: '🔥',
  })
  await store.setSubscriptionChannelPostReaction(memberToken, memberChannel.id, memberPost.id, {
    emoji: '🔥',
  })

  ownerPost = store.getSnapshotByToken(ownerToken)?.subscriptionChannels
    .find((channel) => channel.id === ownerChannel!.id)
    ?.posts.find((post) => post.id === ownerPost!.id)
  memberPost = store.getSnapshotByToken(memberToken)?.subscriptionChannels
    .find((channel) => channel.id === memberChannel!.id)
    ?.posts.find((post) => post.id === memberPost!.id)
  assert.equal(findReaction(ownerPost?.reactions, '🔥')?.count, 2)
  assert.equal(findReaction(ownerPost?.reactions, '🔥')?.reactedByMe, true)
  assert.equal(findReaction(memberPost?.reactions, '🔥')?.count, 2)
  assert.equal(findReaction(memberPost?.reactions, '🔥')?.reactedByMe, true)

  await store.setSubscriptionChannelThreadCommentReaction(
    ownerToken,
    ownerChannel.id,
    ownerPost!.id,
    ownerComment!.id,
    { emoji: '❤️' },
  )
  await store.setSubscriptionChannelThreadCommentReaction(
    memberToken,
    memberChannel.id,
    memberPost!.id,
    memberComment!.id,
    { emoji: '❤️' },
  )

  ownerComment = store.getSnapshotByToken(ownerToken)?.subscriptionChannels
    .find((channel) => channel.id === ownerChannel!.id)
    ?.posts.find((post) => post.id === ownerPost!.id)
    ?.threadComments?.find((comment) => comment.id === ownerComment!.id)
  memberComment = store.getSnapshotByToken(memberToken)?.subscriptionChannels
    .find((channel) => channel.id === memberChannel!.id)
    ?.posts.find((post) => post.id === memberPost!.id)
    ?.threadComments?.find((comment) => comment.id === memberComment!.id)
  assert.equal(findReaction(ownerComment?.reactions, '❤️')?.count, 2)
  assert.equal(findReaction(ownerComment?.reactions, '❤️')?.reactedByMe, true)
  assert.equal(findReaction(memberComment?.reactions, '❤️')?.count, 2)
  assert.equal(findReaction(memberComment?.reactions, '❤️')?.reactedByMe, true)
})
