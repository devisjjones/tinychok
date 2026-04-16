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
    browserNotificationsEnabled: false,
    createdAt: '2026-04-01T00:00:00.000Z',
    darkThemeEnabled: false,
    deletedAt: undefined,
    deletedBySelfService: undefined,
    deletionMode: undefined,
    displayName: options?.displayName ?? `User ${identifier}`,
    gifLibrary: [],
    identifier,
    invisibilityAutoEnabled: false,
    invisibilityEnabled: false,
    isTestEntity: false,
    lastActiveAt: '2026-04-01T00:00:00.000Z',
    nickname: options?.nickname ?? '',
    passwordHash: undefined,
    passwordSetAt: undefined,
    premium: false,
    premiumBadgeHidden: false,
    premiumExpiresAt: undefined,
    publicDeleted: undefined,
    quietModeEnabled: false,
    quietModeSettings: undefined,
    soundsDisabled: false,
    staffRole: undefined,
    status: 'На связи',
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

test('group message mention keeps raw @nickname in text but materializes full-name mention metadata', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990110101', {
    displayName: 'Алексей',
    nickname: 'alex',
    surname: 'Тестов',
  })
  const member = createAccount('+79990110102', {
    displayName: 'Мира',
    nickname: 'mira',
    surname: 'Тестова',
  })

  database.accounts.push(owner, member)
  const ownerToken = createSession(database, owner.identifier, 'mention-owner')
  const memberToken = createSession(database, member.identifier, 'mention-member')

  const dialog = await store.openDirectDialog(ownerToken, { identifier: member.identifier })
  await store.sendContactRequest(ownerToken, { identifier: member.identifier })
  await store.acceptContactRequest(memberToken, owner.identifier)

  const createdGroup = await store.createGroup(ownerToken, {
    commentsEnabledForAll: true,
    memberDialogIds: [dialog.dialogId],
    title: 'Группа тегов',
  })
  const invitationMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === member.identifier &&
      Boolean(message.sourceGroup?.sharedId),
  )
  assert.ok(invitationMessage?.sourceGroup?.sharedId)

  const joinedGroup = await store.joinGroupBySharedId(memberToken, invitationMessage!.sourceGroup!.sharedId!)
  await store.sendGroupMessage(ownerToken, createdGroup.groupId, { text: '@mira' })

  const ownerGroup = store.getSnapshotByToken(ownerToken)?.groups.find((group) => group.id === createdGroup.groupId)
  const ownerMessage = ownerGroup?.messages.find((message) => message.text === '@mira')
  assert.ok(ownerMessage)
  assert.equal(ownerMessage.sourceContact, undefined)
  assert.deepEqual(ownerMessage.mentions, [
    {
      nickname: 'mira',
      sourceContact: {
        accent: ownerMessage.mentions?.[0]?.sourceContact.accent,
        avatarImage: undefined,
        handle: '@mira',
        identifier: member.identifier,
        status: 'На связи',
        title: 'Мира Тестова',
      },
    },
  ])
  assert.equal(ownerGroup?.preview, 'Мира Тестова')

  const memberGroup = store.getSnapshotByToken(memberToken)?.groups.find((group) => group.id === joinedGroup.groupId)
  const memberMessage = memberGroup?.messages.find((message) => message.text === '@mira')
  assert.ok(memberMessage)
  assert.equal(memberMessage.sourceContact, undefined)
  assert.equal(memberMessage.mentions?.[0]?.sourceContact.title, 'Мира Тестова')
  assert.equal(memberGroup?.preview, 'Мира Тестова')
})

test('channel thread mention keeps exact handle text while exposing full-name mention metadata in comments', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990110201', {
    displayName: 'Алексей',
    nickname: 'alex',
    surname: 'Тестов',
  })
  const subscriber = createAccount('+79990110202', {
    displayName: 'Мира',
    nickname: 'mira',
    surname: 'Тестова',
  })

  database.accounts.push(owner, subscriber)
  const ownerToken = createSession(database, owner.identifier, 'channel-owner')
  const subscriberToken = createSession(database, subscriber.identifier, 'channel-subscriber')

  const dialog = await store.openDirectDialog(ownerToken, { identifier: subscriber.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@mention-thread',
    statusText: 'Статус канала',
    title: 'Канал тегов',
    visibility: 'private',
  })

  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialog.dialogId],
  })
  const subscribedChannel = await store.subscribeToChannelByHandle(subscriberToken, '@mention-thread')

  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    text: 'Корневой пост',
  })

  const ownerChannel = store.getSnapshotByToken(ownerToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@mention-thread',
  )
  const ownerPost = ownerChannel?.posts.find((post) => post.text === 'Корневой пост')
  assert.ok(ownerPost)

  await store.sendSubscriptionChannelThreadComment(ownerToken, ownerChannel!.id, ownerPost!.id, {
    text: '@mira',
  })

  const ownerComment = store.getSnapshotByToken(ownerToken)?.subscriptionChannels
    .find((channel) => channel.id === ownerChannel!.id)
    ?.posts.find((post) => post.id === ownerPost!.id)
    ?.threadComments?.find((comment) => comment.text === '@mira')
  assert.ok(ownerComment)
  assert.equal(ownerComment.sourceContact, undefined)
  assert.equal(ownerComment.mentions?.[0]?.nickname, 'mira')
  assert.equal(ownerComment.mentions?.[0]?.sourceContact.title, 'Мира Тестова')

  const subscriberChannel = store.getSnapshotByToken(subscriberToken)?.subscriptionChannels.find(
    (channel) => channel.id === subscribedChannel.channelId,
  )
  const subscriberPost = subscriberChannel?.posts.find((post) => post.text === 'Корневой пост')
  const subscriberComment = subscriberPost?.threadComments?.find((comment) => comment.text === '@mira')
  assert.ok(subscriberComment)
  assert.equal(subscriberComment.sourceContact, undefined)
  assert.equal(subscriberComment.mentions?.[0]?.sourceContact.handle, '@mira')
  assert.equal(subscriberComment.mentions?.[0]?.sourceContact.identifier, subscriber.identifier)
  assert.equal(subscriberComment.mentions?.[0]?.sourceContact.title, 'Мира Тестова')
})
