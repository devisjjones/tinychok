import assert from 'node:assert/strict'
import test from 'node:test'
import {
  coerceDatabasePayload,
  TinychokStore,
  type Database,
} from './store'

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

function seedAcceptedContactLink(database: Database, leftIdentifier: string, rightIdentifier: string) {
  const [left, right] = [leftIdentifier, rightIdentifier].sort()
  database.contactLinks.push({
    createdAt: '2026-04-01T00:00:00.000Z',
    leftIdentifier: left,
    requesterIdentifier: leftIdentifier,
    rightIdentifier: right,
    status: 'accepted',
    updatedAt: '2026-04-01T00:00:00.000Z',
  })
}

async function registerPendingAttachment(
  store: TinychokStore,
  token: string,
  attachment: {
    fileName: string
    mediaUrl: string
    mimeType: string
    size: number
  },
) {
  await store.registerPendingMediaUpload(token, {
    fileName: attachment.fileName,
    kind: 'attachment',
    mediaUrl: attachment.mediaUrl,
    mimeType: attachment.mimeType,
    size: attachment.size,
    storageKey: attachment.mediaUrl,
  })
}

test('attachment quota cleanup evicts the oldest sent file and leaves a visible note', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const sender = createAccount('+79991110021')
  const peer = createAccount('+79991110022')
  database.accounts.push(sender, peer)
  const senderToken = createSession(database, sender.identifier, 'storage-sender')
  const peerToken = createSession(database, peer.identifier, 'storage-peer')
  seedAcceptedContactLink(database, sender.identifier, peer.identifier)

  const opened = await store.openDirectDialog(senderToken, { identifier: peer.identifier })
  await registerPendingAttachment(store, senderToken, {
    fileName: 'old-photo.jpg',
    mediaUrl: 'uploads/attachment/old-photo.jpg',
    mimeType: 'image/jpeg',
    size: 95 * 1024 * 1024,
  })
  await store.sendDirectMessage(senderToken, opened.dialogId, {
    attachment: {
      fileName: 'old-photo.jpg',
      mediaUrl: 'uploads/attachment/old-photo.jpg',
      mimeType: 'image/jpeg',
      size: 95 * 1024 * 1024,
    },
    text: '',
  })
  await registerPendingAttachment(store, senderToken, {
    fileName: 'fresh-doc.pdf',
    mediaUrl: 'uploads/attachment/fresh-doc.pdf',
    mimeType: 'application/pdf',
    size: 20 * 1024 * 1024,
  })
  await store.sendDirectMessage(senderToken, opened.dialogId, {
    attachment: {
      fileName: 'fresh-doc.pdf',
      mediaUrl: 'uploads/attachment/fresh-doc.pdf',
      mimeType: 'application/pdf',
      size: 20 * 1024 * 1024,
    },
    text: '',
  })

  await store.assertMediaUploadWithinQuota(senderToken, 20 * 1024 * 1024, 'attachment')

  const senderMessages = database.dialogMessages
    .filter((message) => message.ownerIdentifier === sender.identifier && message.dialogId === opened.dialogId)
    .sort((left, right) => left.id - right.id)
  assert.equal(senderMessages[0]?.attachment, undefined)
  assert.equal(senderMessages[0]?.text, '')
  assert.equal(senderMessages[0]?.attachmentRemovedNotice?.reason, 'storage-quota')
  assert.equal(senderMessages[0]?.attachmentRemovedNotice?.perspective, 'self')
  assert.match(senderMessages[0]?.attachmentRemovedNotice?.text ?? '', /Вложение скрыто\. У вас закончилось место\. Оформите подписку\./u)
  assert.equal(senderMessages[1]?.attachment?.mediaUrl, 'uploads/attachment/fresh-doc.pdf')

  const peerDialogId = store
    .getSnapshotByToken(peerToken)
    ?.chats.find((chat) => chat.phone === sender.identifier)?.id
  assert.ok(peerDialogId)

  const peerMessages = database.dialogMessages
    .filter((message) => message.ownerIdentifier === peer.identifier && message.dialogId === peerDialogId)
    .sort((left, right) => left.id - right.id)
  assert.equal(peerMessages[0]?.attachment, undefined)
  assert.equal(peerMessages[0]?.text, '')
  assert.equal(peerMessages[0]?.attachmentRemovedNotice?.reason, 'storage-quota')
  assert.equal(peerMessages[0]?.attachmentRemovedNotice?.perspective, 'self')
  assert.match(peerMessages[0]?.attachmentRemovedNotice?.text ?? '', /Вложение скрыто\. У вас закончилось место\. Оформите подписку\./u)

  const usage = store.getStorageUsageByToken(senderToken)
  assert.equal(usage.usedBytes, 20 * 1024 * 1024)

  const senderSnapshot = store.getSnapshotByToken(senderToken)
  const senderChat = senderSnapshot?.chats.find((chat) => chat.id === opened.dialogId)
  assert.ok(senderChat)
  assert.equal(senderChat.messages[0]?.attachment, undefined)
  assert.equal(senderChat.messages[0]?.attachmentRemovedNotice?.reason, 'storage-quota')
  assert.equal(senderChat.messages[0]?.attachmentRemovedNotice?.perspective, 'self')
  assert.match(senderChat.messages[0]?.attachmentRemovedNotice?.text ?? '', /Вложение скрыто\. У вас закончилось место\. Оформите подписку\./u)

  const latestMessageId = senderChat.messages.at(-1)?.id ?? 0
  const senderHistory = store.getDirectDialogHistory(senderToken, opened.dialogId, latestMessageId)
  const senderHistoryRemovedMessage = senderHistory.messages.find(
    (message) => message.attachmentRemovedNotice?.reason === 'storage-quota',
  )
  assert.ok(senderHistoryRemovedMessage)
  assert.equal(senderHistoryRemovedMessage.attachment, undefined)
  assert.equal(senderHistoryRemovedMessage.text, '')
  assert.equal(senderHistoryRemovedMessage.attachmentRemovedNotice?.perspective, 'self')
  assert.match(
    senderHistoryRemovedMessage.attachmentRemovedNotice?.text ?? '',
    /Вложение скрыто\. У вас закончилось место\. Оформите подписку\./u,
  )

  const peerSnapshot = store.getSnapshotByToken(peerToken)
  const peerChat = peerSnapshot?.chats.find((chat) => chat.id === peerDialogId)
  assert.ok(peerChat)
  const peerSnapshotRemovedMessage = peerChat.messages.find(
    (message) => message.attachmentRemovedNotice?.reason === 'storage-quota',
  )
  assert.ok(peerSnapshotRemovedMessage)
  assert.equal(peerSnapshotRemovedMessage.attachment, undefined)
  assert.equal(peerSnapshotRemovedMessage.attachmentRemovedNotice?.perspective, 'peer')
  assert.equal(peerSnapshotRemovedMessage.attachmentRemovedNotice?.text, 'Вложение скрыто.')

  const peerLatestMessageId = peerChat.messages.at(-1)?.id ?? 0
  const peerHistory = store.getDirectDialogHistory(peerToken, peerDialogId, peerLatestMessageId)
  const peerHistoryRemovedMessage = peerHistory.messages.find(
    (message) => message.attachmentRemovedNotice?.reason === 'storage-quota',
  )
  assert.ok(peerHistoryRemovedMessage)
  assert.equal(peerHistoryRemovedMessage.attachment, undefined)
  assert.equal(peerHistoryRemovedMessage.text, '')
  assert.equal(peerHistoryRemovedMessage.attachmentRemovedNotice?.perspective, 'peer')
  assert.equal(peerHistoryRemovedMessage.attachmentRemovedNotice?.text, 'Вложение скрыто.')
})

test('linked historical uploads no longer pin storage usage after attachment cleanup', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const sender = createAccount('+79991110023')
  const peer = createAccount('+79991110024')
  database.accounts.push(sender, peer)
  const senderToken = createSession(database, sender.identifier, 'storage-linked-sender')
  seedAcceptedContactLink(database, sender.identifier, peer.identifier)

  const opened = await store.openDirectDialog(senderToken, { identifier: peer.identifier })
  await registerPendingAttachment(store, senderToken, {
    fileName: 'linked-old-photo.jpg',
    mediaUrl: 'uploads/attachment/linked-old-photo.jpg',
    mimeType: 'image/jpeg',
    size: 95 * 1024 * 1024,
  })
  await store.sendDirectMessage(senderToken, opened.dialogId, {
    attachment: {
      fileName: 'linked-old-photo.jpg',
      mediaUrl: 'uploads/attachment/linked-old-photo.jpg',
      mimeType: 'image/jpeg',
      size: 95 * 1024 * 1024,
    },
    text: '',
  })

  database.pendingMediaUploads.push({
    createdAt: '2026-04-01T00:00:00.000Z',
    fileName: 'linked-old-photo.jpg',
    kind: 'attachment',
    linked: true,
    mediaUrl: 'uploads/attachment/linked-old-photo.jpg',
    mimeType: 'image/jpeg',
    ownerIdentifier: sender.identifier,
    size: 95 * 1024 * 1024,
    storageKey: 'uploads/attachment/linked-old-photo.jpg',
  })

  await registerPendingAttachment(store, senderToken, {
    fileName: 'linked-fresh-photo.jpg',
    mediaUrl: 'uploads/attachment/linked-fresh-photo.jpg',
    mimeType: 'image/jpeg',
    size: 10 * 1024 * 1024,
  })
  await store.sendDirectMessage(senderToken, opened.dialogId, {
    attachment: {
      fileName: 'linked-fresh-photo.jpg',
      mediaUrl: 'uploads/attachment/linked-fresh-photo.jpg',
      mimeType: 'image/jpeg',
      size: 10 * 1024 * 1024,
    },
    text: '',
  })

  const usage = store.getStorageUsageByToken(senderToken)
  assert.equal(usage.usedBytes, 10 * 1024 * 1024)
})

test('premium upgrade restores storage-quota archived attachments back into visible messages when quota allows', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const sender = createAccount('+79991110025')
  const peer = createAccount('+79991110026')
  database.accounts.push(sender, peer)
  const senderToken = createSession(database, sender.identifier, 'storage-restore-sender')
  const peerToken = createSession(database, peer.identifier, 'storage-restore-peer')
  seedAcceptedContactLink(database, sender.identifier, peer.identifier)

  const opened = await store.openDirectDialog(senderToken, { identifier: peer.identifier })
  await registerPendingAttachment(store, senderToken, {
    fileName: 'restore-old-photo.jpg',
    mediaUrl: 'uploads/attachment/restore-old-photo.jpg',
    mimeType: 'image/jpeg',
    size: 95 * 1024 * 1024,
  })
  await store.sendDirectMessage(senderToken, opened.dialogId, {
    attachment: {
      fileName: 'restore-old-photo.jpg',
      mediaUrl: 'uploads/attachment/restore-old-photo.jpg',
      mimeType: 'image/jpeg',
      size: 95 * 1024 * 1024,
    },
    text: '',
  })
  await registerPendingAttachment(store, senderToken, {
    fileName: 'restore-fresh-doc.pdf',
    mediaUrl: 'uploads/attachment/restore-fresh-doc.pdf',
    mimeType: 'application/pdf',
    size: 20 * 1024 * 1024,
  })
  await store.sendDirectMessage(senderToken, opened.dialogId, {
    attachment: {
      fileName: 'restore-fresh-doc.pdf',
      mediaUrl: 'uploads/attachment/restore-fresh-doc.pdf',
      mimeType: 'application/pdf',
      size: 20 * 1024 * 1024,
    },
    text: '',
  })

  await store.assertMediaUploadWithinQuota(senderToken, 20 * 1024 * 1024, 'attachment')
  assert.equal(database.archivedMedia.length, 1)
  assert.equal(database.archivedMedia[0]?.restoreTargets?.length, 2)

  const upgradeResult = await store.setDebugPremiumState(senderToken, {
    durationDays: 30,
    enabled: true,
  })

  assert.match(upgradeResult.broadcastIdentifiers.join(','), new RegExp(peer.identifier.replace('+', '\\+')))
  assert.equal(database.archivedMedia.length, 0)
  assert.equal(upgradeResult.snapshot.session.storageUsage?.usedBytes, 115 * 1024 * 1024)

  const senderMessages = database.dialogMessages
    .filter((message) => message.ownerIdentifier === sender.identifier && message.dialogId === opened.dialogId)
    .sort((left, right) => left.id - right.id)
  assert.equal(senderMessages[0]?.attachment?.mediaUrl, 'uploads/attachment/restore-old-photo.jpg')
  assert.equal(senderMessages[0]?.attachmentRemovedNotice, undefined)

  const peerDialogId = store
    .getSnapshotByToken(peerToken)
    ?.chats.find((chat) => chat.phone === sender.identifier)?.id
  assert.ok(peerDialogId)

  const peerMessages = database.dialogMessages
    .filter((message) => message.ownerIdentifier === peer.identifier && message.dialogId === peerDialogId)
    .sort((left, right) => left.id - right.id)
  assert.equal(peerMessages[0]?.attachment?.mediaUrl, 'uploads/attachment/restore-old-photo.jpg')
  assert.equal(peerMessages[0]?.attachmentRemovedNotice, undefined)

  const refreshedSenderSnapshot = store.getSnapshotByToken(senderToken)
  const refreshedSenderChat = refreshedSenderSnapshot?.chats.find((chat) => chat.id === opened.dialogId)
  assert.equal(
    refreshedSenderChat?.messages.find((message) => message.id === senderMessages[0]?.id)?.attachment?.mediaUrl,
    'uploads/attachment/restore-old-photo.jpg',
  )

  const refreshedPeerSnapshot = store.getSnapshotByToken(peerToken)
  const refreshedPeerChat = refreshedPeerSnapshot?.chats.find((chat) => chat.id === peerDialogId)
  assert.equal(
    refreshedPeerChat?.messages.find((message) => message.id === peerMessages[0]?.id)?.attachment?.mediaUrl,
    'uploads/attachment/restore-old-photo.jpg',
  )
})

test('premium upgrade backfills legacy restore targets for newer archived attachments without restoring older orphan placeholders', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const sender = createAccount('+79991110027')
  const peer = createAccount('+79991110028')
  database.accounts.push(sender, peer)
  const senderToken = createSession(database, sender.identifier, 'storage-legacy-restore-sender')
  const peerToken = createSession(database, peer.identifier, 'storage-legacy-restore-peer')
  seedAcceptedContactLink(database, sender.identifier, peer.identifier)

  const opened = await store.openDirectDialog(senderToken, { identifier: peer.identifier })

  await registerPendingAttachment(store, senderToken, {
    fileName: 'legacy-first.jpg',
    mediaUrl: 'uploads/attachment/legacy-first.jpg',
    mimeType: 'image/jpeg',
    size: 50 * 1024 * 1024,
  })
  await store.sendDirectMessage(senderToken, opened.dialogId, {
    attachment: {
      fileName: 'legacy-first.jpg',
      mediaUrl: 'uploads/attachment/legacy-first.jpg',
      mimeType: 'image/jpeg',
      size: 50 * 1024 * 1024,
    },
    text: '',
  })

  await registerPendingAttachment(store, senderToken, {
    fileName: 'legacy-second.jpg',
    mediaUrl: 'uploads/attachment/legacy-second.jpg',
    mimeType: 'image/jpeg',
    size: 40 * 1024 * 1024,
  })
  await store.sendDirectMessage(senderToken, opened.dialogId, {
    attachment: {
      fileName: 'legacy-second.jpg',
      mediaUrl: 'uploads/attachment/legacy-second.jpg',
      mimeType: 'image/jpeg',
      size: 40 * 1024 * 1024,
    },
    text: '',
  })

  await registerPendingAttachment(store, senderToken, {
    fileName: 'legacy-third.jpg',
    mediaUrl: 'uploads/attachment/legacy-third.jpg',
    mimeType: 'image/jpeg',
    size: 30 * 1024 * 1024,
  })
  await store.sendDirectMessage(senderToken, opened.dialogId, {
    attachment: {
      fileName: 'legacy-third.jpg',
      mediaUrl: 'uploads/attachment/legacy-third.jpg',
      mimeType: 'image/jpeg',
      size: 30 * 1024 * 1024,
    },
    text: '',
  })

  await registerPendingAttachment(store, senderToken, {
    fileName: 'legacy-fourth.jpg',
    mediaUrl: 'uploads/attachment/legacy-fourth.jpg',
    mimeType: 'image/jpeg',
    size: 40 * 1024 * 1024,
  })
  await store.sendDirectMessage(senderToken, opened.dialogId, {
    attachment: {
      fileName: 'legacy-fourth.jpg',
      mediaUrl: 'uploads/attachment/legacy-fourth.jpg',
      mimeType: 'image/jpeg',
      size: 40 * 1024 * 1024,
    },
    text: '',
  })

  assert.equal(database.archivedMedia.length, 2)
  for (const item of database.archivedMedia) {
    item.restoreTargets = undefined
  }

  database.archivedMedia = database.archivedMedia.filter(
    (item) => item.mediaUrl !== 'uploads/attachment/legacy-first.jpg',
  )

  const upgradeResult = await store.setDebugPremiumState(senderToken, {
    durationDays: 30,
    enabled: true,
  })

  assert.match(upgradeResult.broadcastIdentifiers.join(','), new RegExp(peer.identifier.replace('+', '\\+')))
  assert.equal(database.archivedMedia.length, 0)

  const senderMessages = database.dialogMessages
    .filter((message) => message.ownerIdentifier === sender.identifier && message.dialogId === opened.dialogId)
    .sort((left, right) => left.id - right.id)
  assert.equal(senderMessages[0]?.attachment, undefined)
  assert.equal(senderMessages[0]?.attachmentRemovedNotice?.reason, 'storage-quota')
  assert.equal(senderMessages[1]?.attachment?.mediaUrl, 'uploads/attachment/legacy-second.jpg')
  assert.equal(senderMessages[1]?.attachmentRemovedNotice, undefined)
  assert.equal(senderMessages[2]?.attachment?.mediaUrl, 'uploads/attachment/legacy-third.jpg')
  assert.equal(senderMessages[3]?.attachment?.mediaUrl, 'uploads/attachment/legacy-fourth.jpg')

  const peerDialogId = store
    .getSnapshotByToken(peerToken)
    ?.chats.find((chat) => chat.phone === sender.identifier)?.id
  assert.ok(peerDialogId)

  const peerMessages = database.dialogMessages
    .filter((message) => message.ownerIdentifier === peer.identifier && message.dialogId === peerDialogId)
    .sort((left, right) => left.id - right.id)
  assert.equal(peerMessages[0]?.attachment, undefined)
  assert.equal(peerMessages[0]?.attachmentRemovedNotice?.reason, 'storage-quota')
  assert.equal(peerMessages[1]?.attachment?.mediaUrl, 'uploads/attachment/legacy-second.jpg')
  assert.equal(peerMessages[1]?.attachmentRemovedNotice, undefined)
  assert.equal(peerMessages[2]?.attachment?.mediaUrl, 'uploads/attachment/legacy-third.jpg')
  assert.equal(peerMessages[3]?.attachment?.mediaUrl, 'uploads/attachment/legacy-fourth.jpg')
})

test('user storage inventory excludes avatars, deduplicates media and manual delete leaves placeholder', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const sender = createAccount('+79991110031')
  const peer = createAccount('+79991110032')
  sender.avatarImage = 'uploads/profile-avatars/profile.png'
  database.accounts.push(sender, peer)
  const senderToken = createSession(database, sender.identifier, 'storage-owner')
  const peerToken = createSession(database, peer.identifier, 'storage-owner-peer')
  seedAcceptedContactLink(database, sender.identifier, peer.identifier)

  database.groups.push({
    accent: '#8c5738',
    avatarImage: 'uploads/group-avatars/group.png',
    creatorIdentifier: sender.identifier,
    description: '',
    handle: '@group',
    id: 1,
    members: 1,
    muted: false,
    ownerIdentifier: sender.identifier,
    participants: [],
    preview: '',
    sharedId: 'group:1',
    time: '',
    title: 'Group',
    unread: 0,
  })
  database.managedChannels.push({
    avatarImage: 'uploads/channel-avatars/channel.png',
    avatarTone: '#8c5738',
    commentsEnabledForAll: false,
    commentsEnabledForPremium: false,
    description: '',
    directLink: '@channel',
    id: 1,
    ownerIdentifier: sender.identifier,
    status: 'active',
    title: 'Channel',
    visibility: 'private',
  })
  database.pendingMediaUploads.push(
    {
      createdAt: '2026-04-01T00:00:00.000Z',
      fileName: 'profile.png',
      kind: 'profile-avatar',
      linked: true,
      mediaUrl: 'uploads/profile-avatars/profile.png',
      mimeType: 'image/png',
      ownerIdentifier: sender.identifier,
      size: 9 * 1024 * 1024,
      storageKey: 'profile.png',
    },
    {
      createdAt: '2026-04-01T00:00:00.000Z',
      fileName: 'group.png',
      kind: 'group-avatar',
      linked: true,
      mediaUrl: 'uploads/group-avatars/group.png',
      mimeType: 'image/png',
      ownerIdentifier: sender.identifier,
      size: 8 * 1024 * 1024,
      storageKey: 'group.png',
    },
    {
      createdAt: '2026-04-01T00:00:00.000Z',
      fileName: 'channel.png',
      kind: 'channel-avatar',
      linked: true,
      mediaUrl: 'uploads/channel-avatars/channel.png',
      mimeType: 'image/png',
      ownerIdentifier: sender.identifier,
      size: 7 * 1024 * 1024,
      storageKey: 'channel.png',
    },
  )

  const opened = await store.openDirectDialog(senderToken, { identifier: peer.identifier })
  await registerPendingAttachment(store, senderToken, {
    fileName: 'room-photo.jpg',
    mediaUrl: 'uploads/attachments/room-photo.jpg',
    mimeType: 'image/jpeg',
    size: 10 * 1024 * 1024,
  })
  await store.sendDirectMessage(senderToken, opened.dialogId, {
    attachment: {
      fileName: 'room-photo.jpg',
      mediaUrl: 'uploads/attachments/room-photo.jpg',
      mimeType: 'image/jpeg',
      size: 10 * 1024 * 1024,
    },
    text: 'Фото',
  })
  await registerPendingAttachment(store, senderToken, {
    fileName: 'support-shot.png',
    mediaUrl: 'uploads/attachments/support-shot.png',
    mimeType: 'image/png',
    size: 6 * 1024 * 1024,
  })
  await store.sendSupportTicket(senderToken, {
    attachment: {
      fileName: 'support-shot.png',
      mediaUrl: 'uploads/attachments/support-shot.png',
      mimeType: 'image/png',
      size: 6 * 1024 * 1024,
      width: 1200,
    },
    text: '',
  })

  sender.gifLibrary = [
    {
      createdAt: '2026-04-01T00:05:00.000Z',
      fileName: 'wow.gif',
      id: 'gif-1',
      mediaUrl: 'uploads/user-gifs/wow.gif',
      mimeType: 'image/gif',
      size: 4 * 1024 * 1024,
      width: 320,
      height: 180,
    },
  ]
  database.sharedGifs = sender.gifLibrary.map((gif) => ({
    ...gif,
    uploadedByIdentifier: sender.identifier,
  }))

  const usage = store.getStorageUsageByToken(senderToken)
  assert.equal(usage.usedBytes, 16 * 1024 * 1024)

  const storage = store.listUserStorageItems(senderToken)
  assert.equal(storage.items.length, 2)
  assert.ok(storage.items.every((item) => item.kind === 'attachment'))
  assert.equal(storage.items.some((item) => /avatar/u.test(item.fileName)), false)

  const directAttachmentItem = storage.items.find((item) => item.fileName === 'room-photo.jpg')
  assert.ok(directAttachmentItem)
  assert.equal(directAttachmentItem.usageCount, 2)
  assert.equal(directAttachmentItem.id.includes('uploads/attachments/room-photo.jpg'), false)

  const supportAttachmentItem = storage.items.find((item) => item.fileName === 'support-shot.png')
  assert.ok(supportAttachmentItem)
  assert.equal(supportAttachmentItem.primaryLabel, 'Обращение в поддержку')

  const removeResponse = await store.removeUserStorageItem(senderToken, directAttachmentItem.id)
  assert.equal(removeResponse.snapshot.session.storageUsage?.usedBytes, 6 * 1024 * 1024)

  const senderSnapshot = store.getSnapshotByToken(senderToken)
  const senderMessage = senderSnapshot?.chats
    .find((chat) => chat.id === opened.dialogId)
    ?.messages.find((message) => message.text === 'Фото')
  assert.ok(senderMessage)
  assert.equal(senderMessage.attachment, undefined)
  assert.equal(senderMessage.attachmentRemovedNotice?.reason, 'storage-manual')
  assert.match(senderMessage.attachmentRemovedNotice?.text ?? '', /вами из хранилища/u)

  const peerDialogId = store
    .getSnapshotByToken(peerToken)
    ?.chats.find((chat) => chat.phone === sender.identifier)?.id
  assert.ok(peerDialogId)
  const peerSnapshot = store.getSnapshotByToken(peerToken)
  const peerMessage = peerSnapshot?.chats
    .find((chat) => chat.id === peerDialogId)
    ?.messages.find((message) => message.text === 'Фото')
  assert.ok(peerMessage)
  assert.equal(peerMessage.attachment, undefined)
  assert.equal(peerMessage.attachmentRemovedNotice?.reason, 'storage-manual')
  assert.match(peerMessage.attachmentRemovedNotice?.text ?? '', /владельцем из хранилища/u)
})

test('manual gif deletion removes only the personal library entry and keeps shared gif storage intact', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79991110033')
  owner.premium = true
  owner.gifLibrary = [
    {
      createdAt: '2026-04-01T00:00:00.000Z',
      fileName: 'party.gif',
      id: 'gif-party',
      mediaUrl: 'uploads/user-gifs/party.gif',
      mimeType: 'image/gif',
      size: 5 * 1024 * 1024,
      width: 300,
      height: 200,
    },
  ]
  database.sharedGifs = owner.gifLibrary.map((gif) => ({
    ...gif,
    uploadedByIdentifier: owner.identifier,
  }))
  database.accounts.push(owner)
  const ownerToken = createSession(database, owner.identifier, 'storage-gif-owner')

  const before = store.listUserStorageItems(ownerToken)
  assert.equal(before.items.length, 0)
  assert.equal(store.getStorageUsageByToken(ownerToken).usedBytes, 0)

  const result = await store.removeUserStorageItem(
    ownerToken,
    `gif:${Buffer.from('uploads/user-gifs/party.gif', 'utf8').toString('base64url')}`,
  )
  assert.equal(result.snapshot.session.gifLibrary?.length ?? 0, 0)
  assert.equal(result.snapshot.session.storageUsage?.usedBytes, 0)
  assert.equal(store.listUserStorageItems(ownerToken).items.length, 0)
  assert.equal(store.searchUserGifs(ownerToken, 'party').items.length, 1)
})
