import assert from 'node:assert/strict'
import test from 'node:test'
import {
  coerceDatabasePayload,
  TinychokStore,
  type Database,
} from './store'
import { hashPassword } from './auth-security'
import { formatPreview, normalizeQuietModeSettings } from '../../src/shared/utils'

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
    premium?: boolean
    premiumExpiresAt?: string
    staffRole?: 'owner' | 'moderator' | 'support'
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
    displayName: `User ${identifier}`,
    gifLibrary: [],
    identifier,
    invisibilityEnabled: false,
    isTestEntity: false,
    lastActiveAt: '2026-04-01T00:00:00.000Z',
    nickname: '',
    passwordHash: undefined,
    passwordSetAt: undefined,
    premium: options?.premium ?? false,
    premiumExpiresAt: options?.premiumExpiresAt,
    publicDeleted: undefined,
    quietModeEnabled: false,
    quietModeSettings: normalizeQuietModeSettings(undefined),
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

function buildAttachment(label: string, size = 256 * 1024) {
  return buildAttachmentWithOptions(label, size)
}

function buildAttachmentWithOptions(
  label: string,
  size = 256 * 1024,
  options?: {
    extension?: string
    mimeType?: string
    presentation?: 'video-note'
  },
) {
  const extension = options?.extension ?? '.png'
  const mimeType = options?.mimeType ?? 'image/png'
  return {
    fileName: `${label}${extension}`,
    mediaUrl: `uploads/attachments/${label}${extension}`,
    mimeType,
    presentation: options?.presentation,
    size,
    width: 640,
    height: 480,
  }
}

test('saveSnapshot ignores sensitive session and channel fields but preserves safe room flags', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79991110101')
  const peer = createAccount('+79991110102')
  database.accounts.push(owner, peer)
  const ownerToken = createSession(database, owner.identifier, 'snapshot-owner')
  seedAcceptedContactLink(database, owner.identifier, peer.identifier)

  const opened = await store.openDirectDialog(ownerToken, { identifier: peer.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@security-owner',
    title: 'Owner Channel',
    visibility: 'private',
  })

  const snapshot = store.getSnapshotByToken(ownerToken)
  assert.ok(snapshot)
  const mutatedSnapshot = structuredClone(snapshot)
  mutatedSnapshot.session.displayName = 'Hacked Name'
  mutatedSnapshot.session.premium = true
  mutatedSnapshot.session.premiumExpiresAt = '2099-01-01T00:00:00.000Z'
  mutatedSnapshot.session.avatarImage = 'uploads/profile-avatars/hijack.png'
  mutatedSnapshot.session.blockedContactIds = [999]
  mutatedSnapshot.session.invisibilityEnabled = true
  mutatedSnapshot.session.quietModeSettings = {
    dialogs: true,
    channels: true,
    groups: true,
    threads: true,
    contactRequests: true,
    autoInvisibility: true,
  }
  mutatedSnapshot.chats = mutatedSnapshot.chats.map((chat) =>
    chat.id === opened.dialogId
      ? {
          ...chat,
          muted: true,
          pinned: true,
        }
      : chat,
  )
  mutatedSnapshot.channels = mutatedSnapshot.channels.map((channel) =>
    channel.id === createdChannel.channelId
      ? {
          ...channel,
          avatarImage: 'uploads/channel-avatars/hijack.png',
          title: 'Hacked Channel',
          visibility: 'public',
        }
      : channel,
  )

  const nextSnapshot = await store.saveSnapshot(ownerToken, mutatedSnapshot)
  assert.equal(nextSnapshot.session.displayName, owner.displayName)
  assert.equal(nextSnapshot.session.premium, false)
  assert.ok(!nextSnapshot.session.premiumExpiresAt)
  assert.equal(nextSnapshot.session.avatarImage, undefined)
  assert.equal(nextSnapshot.session.invisibilityEnabled, false)
  assert.deepEqual(nextSnapshot.session.blockedContactIds, [])

  const savedChat = nextSnapshot.chats.find((chat) => chat.id === opened.dialogId)
  assert.ok(savedChat)
  assert.equal(savedChat.muted, true)
  assert.equal(savedChat.pinned, true)

  const savedChannel = nextSnapshot.channels.find((channel) => channel.id === createdChannel.channelId)
  assert.ok(savedChannel)
  assert.equal(savedChannel.title, 'Owner Channel')
  assert.equal(savedChannel.visibility, 'private')
  assert.equal(savedChannel.avatarImage, undefined)
})

test('attachment send paths reject unowned media urls and mark valid uploads linked', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79991110111')
  const peer = createAccount('+79991110112')
  const support = createAccount('+79991110113', { staffRole: 'support' })
  const secondary = createAccount('+79991110114')
  database.accounts.push(owner, peer, support, secondary)
  const ownerToken = createSession(database, owner.identifier, 'owner')
  const peerToken = createSession(database, peer.identifier, 'peer')
  const supportToken = createSession(database, support.identifier, 'support')
  const secondaryToken = createSession(database, secondary.identifier, 'secondary')
  seedAcceptedContactLink(database, owner.identifier, peer.identifier)

  const directDialog = await store.openDirectDialog(ownerToken, { identifier: peer.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    commentsEnabledForAll: true,
    memberDialogIds: [directDialog.dialogId],
    title: 'Security Group',
  })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@security-channel',
    title: 'Security Channel',
    visibility: 'private',
  })
  await store.sendGroupMessage(ownerToken, createdGroup.groupId, { text: 'group root' })
  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, { text: 'channel root' })
  const ownerSnapshot = store.getSnapshotByToken(ownerToken)
  const groupMessageId = ownerSnapshot?.groups.find((group) => group.id === createdGroup.groupId)?.messages[0]?.id
  const subscriptionChannel = ownerSnapshot?.subscriptionChannels.find((channel) => channel.handle === '@security-channel')
  const postId = subscriptionChannel?.posts.find((post) => post.text === 'channel root')?.id
  assert.ok(groupMessageId)
  assert.ok(subscriptionChannel)
  assert.ok(postId)

  const initialTicket = await store.sendSupportTicket(ownerToken, { text: 'help me' })
  const ticketId = initialTicket.snapshot.supportTickets[0]?.id
  assert.ok(ticketId !== undefined)

  const foreignAttachment = buildAttachment('foreign-attachment')
  await registerPendingAttachment(store, peerToken, foreignAttachment)

  for (const send of [
    () => store.sendDirectMessage(ownerToken, directDialog.dialogId, { attachment: foreignAttachment, text: '' }),
    () => store.sendGroupMessage(ownerToken, createdGroup.groupId, { attachment: foreignAttachment, text: '' }),
    () =>
      store.sendGroupThreadComment(ownerToken, createdGroup.groupId, groupMessageId!, {
        attachment: foreignAttachment,
        text: '',
      }),
    () => store.sendManagedChannelPost(ownerToken, createdChannel.channelId, { attachment: foreignAttachment, text: '' }),
    () =>
      store.sendSubscriptionChannelThreadComment(ownerToken, subscriptionChannel!.id, postId!, {
        attachment: foreignAttachment,
        text: '',
      }),
    () => store.sendSupportTicket(secondaryToken, { attachment: foreignAttachment, text: '' }),
    () => store.sendSupportTicketComment(ownerToken, ticketId!, { attachment: foreignAttachment, text: '' }),
    () => store.adminReplySupportTicket(supportToken, ticketId!, { attachment: foreignAttachment, status: 'open', text: '' }),
  ]) {
    await assert.rejects(send, /Вложение недействительно или больше недоступно/u)
  }

  const missingAttachment = buildAttachment('missing-attachment')
  await assert.rejects(
    () => store.sendDirectMessage(ownerToken, directDialog.dialogId, { attachment: missingAttachment, text: '' }),
    /Вложение недействительно или больше недоступно/u,
  )

  const directAttachment = buildAttachment('direct-ok')
  await registerPendingAttachment(store, ownerToken, directAttachment)
  await store.sendDirectMessage(ownerToken, directDialog.dialogId, { attachment: directAttachment, text: '' })
  assert.equal(
    database.pendingMediaUploads.find((upload) => upload.mediaUrl === directAttachment.mediaUrl)?.linked,
    true,
  )

  const groupAttachment = buildAttachment('group-ok')
  await registerPendingAttachment(store, ownerToken, groupAttachment)
  await store.sendGroupMessage(ownerToken, createdGroup.groupId, { attachment: groupAttachment, text: '' })
  assert.equal(
    database.pendingMediaUploads.find((upload) => upload.mediaUrl === groupAttachment.mediaUrl)?.linked,
    true,
  )

  const groupCommentAttachment = buildAttachment('group-thread-ok')
  await registerPendingAttachment(store, ownerToken, groupCommentAttachment)
  await store.sendGroupThreadComment(ownerToken, createdGroup.groupId, groupMessageId!, {
    attachment: groupCommentAttachment,
    text: '',
  })
  assert.equal(
    database.pendingMediaUploads.find((upload) => upload.mediaUrl === groupCommentAttachment.mediaUrl)?.linked,
    true,
  )

  const channelAttachment = buildAttachment('channel-post-ok')
  await registerPendingAttachment(store, ownerToken, channelAttachment)
  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    attachment: channelAttachment,
    text: '',
  })
  assert.equal(
    database.pendingMediaUploads.find((upload) => upload.mediaUrl === channelAttachment.mediaUrl)?.linked,
    true,
  )

  const channelCommentAttachment = buildAttachment('channel-thread-ok')
  await registerPendingAttachment(store, ownerToken, channelCommentAttachment)
  await store.sendSubscriptionChannelThreadComment(ownerToken, subscriptionChannel!.id, postId!, {
    attachment: channelCommentAttachment,
    text: '',
  })
  assert.equal(
    database.pendingMediaUploads.find((upload) => upload.mediaUrl === channelCommentAttachment.mediaUrl)?.linked,
    true,
  )

  const supportTicketAttachment = buildAttachment('support-ticket-ok')
  await registerPendingAttachment(store, secondaryToken, supportTicketAttachment)
  await store.sendSupportTicket(secondaryToken, {
    attachment: supportTicketAttachment,
    text: '',
  })
  assert.equal(
    database.pendingMediaUploads.find((upload) => upload.mediaUrl === supportTicketAttachment.mediaUrl)?.linked,
    true,
  )

  const supportCommentAttachment = buildAttachment('support-comment-ok')
  await registerPendingAttachment(store, ownerToken, supportCommentAttachment)
  await store.sendSupportTicketComment(ownerToken, ticketId!, {
    attachment: supportCommentAttachment,
    text: '',
  })
  assert.equal(
    database.pendingMediaUploads.find((upload) => upload.mediaUrl === supportCommentAttachment.mediaUrl)?.linked,
    true,
  )

  const staffAttachment = buildAttachment('support-staff-ok')
  await registerPendingAttachment(store, supportToken, staffAttachment)
  await store.adminReplySupportTicket(supportToken, ticketId!, {
    attachment: staffAttachment,
    status: 'open',
    text: '',
  })
  assert.equal(
    database.pendingMediaUploads.find((upload) => upload.mediaUrl === staffAttachment.mediaUrl)?.linked,
    true,
  )

  const orphanedGroupAttachment = buildAttachment('group-linked-orphan-check')
  await registerPendingAttachment(store, ownerToken, orphanedGroupAttachment)
  await store.sendGroupMessage(ownerToken, createdGroup.groupId, {
    attachment: orphanedGroupAttachment,
    text: '',
  })
  const cleanedCount = await store.cleanupExpiredPendingMediaUploads()
  assert.equal(cleanedCount, 0)
  assert.equal(
    database.pendingMediaUploads.find((upload) => upload.mediaUrl === orphanedGroupAttachment.mediaUrl)?.linked,
    true,
  )
})

test('legacy relative GIF library items still send across direct and group paths after client-side media url normalization', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79991110121')
  const peer = createAccount('+79991110122')
  database.accounts.push(owner, peer)
  const ownerToken = createSession(database, owner.identifier, 'legacy-gif-owner')
  createSession(database, peer.identifier, 'legacy-gif-peer')
  seedAcceptedContactLink(database, owner.identifier, peer.identifier)

  owner.gifLibrary = [{
    createdAt: '2026-04-02T10:00:00.000Z',
    fileName: 'party.gif',
    height: 180,
    id: 'legacy-party-gif',
    mediaUrl: '/uploads/user-gifs/party.gif',
    mimeType: 'image/gif',
    size: 4096,
    width: 180,
  }]
  database.sharedGifs = owner.gifLibrary.map((gif) => ({
    ...gif,
    uploadedByIdentifier: owner.identifier,
  }))

  const opened = await store.openDirectDialog(ownerToken, { identifier: peer.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    commentsEnabledForAll: true,
    memberDialogIds: [opened.dialogId],
    title: 'Legacy GIF Group',
  })
  const attachment = {
    fileName: 'party.gif',
    height: 180,
    mediaUrl: 'https://api.staging.tinychok.ru/uploads/user-gifs/party.gif',
    mimeType: 'image/gif' as const,
    size: 4096,
    width: 180,
  }

  const directResult = await store.sendDirectMessage(ownerToken, opened.dialogId, {
    attachment,
    text: '',
  })
  const groupResult = await store.sendGroupMessage(ownerToken, createdGroup.groupId, {
    attachment,
    text: '',
  })

  const directMessage = directResult.snapshot.chats
    .find((chat) => chat.id === opened.dialogId)
    ?.messages.at(-1)
  const groupMessage = groupResult.snapshot.groups
    .find((group) => group.id === createdGroup.groupId)
    ?.messages.at(-1)

  assert.ok(directMessage?.attachment)
  assert.ok(groupMessage?.attachment)
  assert.equal(directMessage.attachment?.mimeType, 'image/gif')
  assert.equal(directMessage.attachment?.mediaUrl, attachment.mediaUrl)
  assert.equal(groupMessage.attachment?.mimeType, 'image/gif')
  assert.equal(groupMessage.attachment?.mediaUrl, attachment.mediaUrl)
})

test('attachment send paths keep long video filenames linkable after upload registration', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const sender = createAccount('+79991110501')
  const recipient = createAccount('+79991110502')
  database.accounts.push(sender, recipient)
  const senderToken = createSession(database, sender.identifier, 'long-video-filename-sender')
  seedAcceptedContactLink(database, sender.identifier, recipient.identifier)

  const dialogResponse = await store.openDirectDialog(senderToken, { identifier: recipient.identifier })
  const veryLongBaseName = `${'video-fragment-'.repeat(12)}final-cut`
  const longVideoAttachment = buildAttachmentWithOptions(veryLongBaseName, 3 * 1024 * 1024, {
    extension: '.mp4',
    mimeType: 'video/mp4',
  })

  await registerPendingAttachment(store, senderToken, longVideoAttachment)
  await store.sendDirectMessage(senderToken, dialogResponse.dialogId, {
    attachment: longVideoAttachment,
    text: '',
  })

  const linkedUpload = database.pendingMediaUploads.find(
    (upload) => upload.mediaUrl === longVideoAttachment.mediaUrl,
  )
  assert.equal(linkedUpload?.linked, true)

  const storedMessage = database.dialogMessages.find(
    (message) =>
      message.ownerIdentifier === sender.identifier &&
      message.dialogId === dialogResponse.dialogId &&
      message.attachment?.mediaUrl === longVideoAttachment.mediaUrl,
  )
  assert.ok(storedMessage?.attachment)
  assert.equal(storedMessage.attachment?.mimeType, 'video/mp4')
  assert.equal(storedMessage.attachment?.fileName.length, 120)
  assert.match(storedMessage.attachment?.fileName ?? '', /^video-fragment-/u)
})

test('video-note attachments stay limited to allowed send paths and preserve presentation in snapshots', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79991110221')
  const peer = createAccount('+79991110222')
  const support = createAccount('+79991110223', { staffRole: 'support' })
  database.accounts.push(owner, peer, support)
  const ownerToken = createSession(database, owner.identifier, 'video-note-owner')
  const supportToken = createSession(database, support.identifier, 'video-note-support')
  seedAcceptedContactLink(database, owner.identifier, peer.identifier)

  const directDialog = await store.openDirectDialog(ownerToken, { identifier: peer.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    commentsEnabledForAll: true,
    memberDialogIds: [directDialog.dialogId],
    title: 'Video Note Group',
  })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@video-note-channel',
    title: 'Video Note Channel',
    visibility: 'private',
  })
  await store.sendGroupMessage(ownerToken, createdGroup.groupId, { text: 'group root' })
  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, { text: 'channel root' })
  const baselineSnapshot = store.getSnapshotByToken(ownerToken)
  const groupMessageId = baselineSnapshot?.groups.find((group) => group.id === createdGroup.groupId)?.messages[0]?.id
  const subscriptionChannel = baselineSnapshot?.subscriptionChannels.find(
    (channel) => channel.handle === '@video-note-channel',
  )
  const postId = subscriptionChannel?.posts.find((post) => post.text === 'channel root')?.id
  assert.ok(groupMessageId)
  assert.ok(subscriptionChannel)
  assert.ok(postId)

  const directVideoNote = buildAttachmentWithOptions('direct-video-note', 256 * 1024, {
    extension: '.webm',
    mimeType: 'video/webm',
    presentation: 'video-note',
  })
  await registerPendingAttachment(store, ownerToken, directVideoNote)
  await store.sendDirectMessage(ownerToken, directDialog.dialogId, { attachment: directVideoNote, text: '' })
  const directSnapshot = store.getSnapshotByToken(ownerToken)
  const directChat = directSnapshot?.chats.find((chat) => chat.id === directDialog.dialogId)
  const directMessage = directChat?.messages.find((message) => message.attachment?.mediaUrl === directVideoNote.mediaUrl)
  assert.equal(directChat ? formatPreview(directChat) : undefined, 'Видеосообщение')
  assert.equal(directMessage?.attachment?.presentation, 'video-note')

  const groupVideoNote = buildAttachmentWithOptions('group-video-note', 256 * 1024, {
    extension: '.webm',
    mimeType: 'video/webm',
    presentation: 'video-note',
  })
  await registerPendingAttachment(store, ownerToken, groupVideoNote)
  await store.sendGroupMessage(ownerToken, createdGroup.groupId, { attachment: groupVideoNote, text: '' })
  const groupSnapshot = store.getSnapshotByToken(ownerToken)
  const groupState = groupSnapshot?.groups.find((group) => group.id === createdGroup.groupId)
  const groupMessage = groupState?.messages.find((message) => message.attachment?.mediaUrl === groupVideoNote.mediaUrl)
  assert.equal(groupState?.preview, 'Видеосообщение')
  assert.equal(groupMessage?.attachment?.presentation, 'video-note')

  const groupThreadVideoNote = buildAttachmentWithOptions('group-thread-video-note', 256 * 1024, {
    extension: '.webm',
    mimeType: 'video/webm',
    presentation: 'video-note',
  })
  await registerPendingAttachment(store, ownerToken, groupThreadVideoNote)
  await store.sendGroupThreadComment(ownerToken, createdGroup.groupId, groupMessageId!, {
    attachment: groupThreadVideoNote,
    text: '',
  })
  const groupThreadSnapshot = store.getSnapshotByToken(ownerToken)
  const groupThreadComment = groupThreadSnapshot?.groups
    .find((group) => group.id === createdGroup.groupId)
    ?.messages.find((message) => message.id === groupMessageId)
    ?.threadComments?.find((comment) => comment.attachment?.mediaUrl === groupThreadVideoNote.mediaUrl)
  assert.equal(groupThreadComment?.attachment?.presentation, 'video-note')

  const channelVideoNote = buildAttachmentWithOptions('channel-video-note', 256 * 1024, {
    extension: '.webm',
    mimeType: 'video/webm',
    presentation: 'video-note',
  })
  await registerPendingAttachment(store, ownerToken, channelVideoNote)
  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    attachment: channelVideoNote,
    text: '',
  })
  const channelSnapshot = store.getSnapshotByToken(ownerToken)
  const ownerChannel = channelSnapshot?.subscriptionChannels.find((channel) => channel.handle === '@video-note-channel')
  const channelPost = ownerChannel?.posts.find((post) => post.attachment?.mediaUrl === channelVideoNote.mediaUrl)
  assert.equal(ownerChannel?.preview, 'Видеосообщение')
  assert.equal(channelPost?.attachment?.presentation, 'video-note')

  const channelThreadVideoNote = buildAttachmentWithOptions('channel-thread-video-note', 256 * 1024, {
    extension: '.webm',
    mimeType: 'video/webm',
    presentation: 'video-note',
  })
  await registerPendingAttachment(store, ownerToken, channelThreadVideoNote)
  await store.sendSubscriptionChannelThreadComment(ownerToken, subscriptionChannel!.id, postId!, {
    attachment: channelThreadVideoNote,
    text: '',
  })
  const channelThreadSnapshot = store.getSnapshotByToken(ownerToken)
  const channelThreadComment = channelThreadSnapshot?.subscriptionChannels
    .find((channel) => channel.handle === '@video-note-channel')
    ?.posts.find((post) => post.id === postId)
    ?.threadComments?.find((comment) => comment.attachment?.mediaUrl === channelThreadVideoNote.mediaUrl)
  assert.equal(channelThreadComment?.attachment?.presentation, 'video-note')

  const captionedVideoNote = buildAttachmentWithOptions('captioned-video-note', 256 * 1024, {
    extension: '.webm',
    mimeType: 'video/webm',
    presentation: 'video-note',
  })
  await registerPendingAttachment(store, ownerToken, captionedVideoNote)
  await assert.rejects(
    () =>
      store.sendDirectMessage(ownerToken, directDialog.dialogId, {
        attachment: captionedVideoNote,
        text: 'подпись запрещена',
      }),
    /Видеосообщение отправляется без подписи/u,
  )

  const invalidMimeVideoNote = buildAttachmentWithOptions('invalid-video-note', 256 * 1024, {
    extension: '.png',
    mimeType: 'image/png',
    presentation: 'video-note',
  })
  await registerPendingAttachment(store, ownerToken, invalidMimeVideoNote)
  await assert.rejects(
    () =>
      store.sendGroupMessage(ownerToken, createdGroup.groupId, {
        attachment: invalidMimeVideoNote,
        text: '',
      }),
    /Видеосообщение можно отправить только как видео/u,
  )

  const supportVideoNote = buildAttachmentWithOptions('support-video-note', 256 * 1024, {
    extension: '.webm',
    mimeType: 'video/webm',
    presentation: 'video-note',
  })
  await registerPendingAttachment(store, ownerToken, supportVideoNote)
  await assert.rejects(
    () =>
      store.sendSupportTicket(ownerToken, {
        attachment: supportVideoNote,
        text: '',
      }),
    /Видеосообщения недоступны в этом разделе/u,
  )

  const ticketResponse = await store.sendSupportTicket(ownerToken, { text: 'help with video note' })
  const ticketId = ticketResponse.snapshot.supportTickets[0]?.id
  assert.notEqual(ticketId, undefined)

  const adminReplyVideoNote = buildAttachmentWithOptions('admin-reply-video-note', 256 * 1024, {
    extension: '.webm',
    mimeType: 'video/webm',
    presentation: 'video-note',
  })
  await registerPendingAttachment(store, supportToken, adminReplyVideoNote)
  await assert.rejects(
    () =>
      store.adminReplySupportTicket(supportToken, ticketId!, {
        attachment: adminReplyVideoNote,
        status: 'open',
        text: '',
      }),
    /Видеосообщения недоступны в этом разделе/u,
  )
})

test('group attachments count against the author storage while channel posts keep the channel quota', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79991110131')
  const peer = createAccount('+79991110132')
  database.accounts.push(owner, peer)
  const ownerToken = createSession(database, owner.identifier, 'group-storage-owner')
  seedAcceptedContactLink(database, owner.identifier, peer.identifier)

  const directDialog = await store.openDirectDialog(ownerToken, { identifier: peer.identifier })
  const createdGroup = await store.createGroup(ownerToken, {
    commentsEnabledForAll: true,
    memberDialogIds: [directDialog.dialogId],
    title: 'Author-owned group storage',
  })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@author-owned-channel',
    title: 'Channel-owned storage',
    visibility: 'private',
  })

  const groupAttachment = buildAttachment('group-author-owned', 300 * 1024)
  await registerPendingAttachment(store, ownerToken, groupAttachment)
  await store.sendGroupMessage(ownerToken, createdGroup.groupId, {
    attachment: groupAttachment,
    text: '',
  })

  const groupSnapshot = store.getSnapshotByToken(ownerToken)
  assert.ok(groupSnapshot)
  assert.equal(groupSnapshot.session.storageUsage?.usedBytes, groupAttachment.size)
  const renderedGroup = groupSnapshot.groups.find((group) => group.id === createdGroup.groupId)
  assert.ok(renderedGroup)
  assert.equal('storageUsage' in renderedGroup, false)

  const groupMessageId = renderedGroup.messages[0]?.id
  assert.ok(groupMessageId)
  const groupThreadAttachment = buildAttachment('group-thread-author-owned', 128 * 1024)
  await registerPendingAttachment(store, ownerToken, groupThreadAttachment)
  await store.sendGroupThreadComment(ownerToken, createdGroup.groupId, groupMessageId, {
    attachment: groupThreadAttachment,
    text: '',
  })

  const afterThreadSnapshot = store.getSnapshotByToken(ownerToken)
  assert.equal(
    afterThreadSnapshot?.session.storageUsage?.usedBytes,
    groupAttachment.size + groupThreadAttachment.size,
  )

  const channelSnapshot = store.getSnapshotByToken(ownerToken)
  const renderedChannel = channelSnapshot?.channels.find((channel) => channel.id === createdChannel.channelId)
  assert.ok(renderedChannel)
  assert.equal(renderedChannel.storageUsage?.quotaBytes, 500 * 1024 * 1024)
})

test('owner-only user media export requires owner role and current password', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const target = createAccount('+79991110121')
  const owner = createAccount('+79991110122', { staffRole: 'owner' })
  const moderator = createAccount('+79991110123', { staffRole: 'moderator' })
  owner.passwordHash = await hashPassword('owner-password')
  moderator.passwordHash = await hashPassword('moderator-password')
  target.gifLibrary = [{
    createdAt: '2026-04-03T10:08:00.000Z',
    fileName: 'broken.gif',
    height: 120,
    id: 'gif-broken',
    mediaUrl: '/uploads/user-gifs/broken.gif',
    mimeType: 'image/gif',
    size: 1024,
    width: 120,
  }]

  database.accounts.push(target, owner, moderator)
  const ownerToken = createSession(database, owner.identifier, 'owner-media-export')
  const moderatorToken = createSession(database, moderator.identifier, 'moderator-media-export')

  await assert.rejects(
    () =>
      store.adminExportUserMediaArchive(moderatorToken, {
        currentPassword: 'moderator-password',
        reason: 'forbidden-review',
        targetIdentifier: target.identifier,
      }),
    /только владельцу/u,
  )

  await assert.rejects(
    () =>
      store.adminExportUserMediaArchive(ownerToken, {
        currentPassword: 'wrong-password',
        reason: 'wrong-password-review',
        targetIdentifier: target.identifier,
      }),
    /Неверный пароль/u,
  )

  await assert.doesNotReject(() =>
    store.adminExportUserMediaArchive(ownerToken, {
      currentPassword: 'owner-password',
      reason: 'approved-review',
      targetIdentifier: target.identifier,
    }),
  )
})

test('expired sessions fail token lookup and bootstrap snapshot access', () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const account = createAccount('+79991110201')
  database.accounts.push(account)
  database.sessions.push({
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-31T00:00:00.000Z',
    identifier: account.identifier,
    token: 'expired-session',
  })

  assert.equal(store.getIdentifierByToken('expired-session'), null)
  assert.equal(store.getSnapshotByToken('expired-session'), null)
  assert.equal(store.listTokensByIdentifier(account.identifier).includes('expired-session'), false)
})

test('password reset revokes prior sessions and issues a fresh session', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const account = createAccount('+79991110202')
  database.accounts.push(account)
  const oldToken = createSession(database, account.identifier, 'reset-old')
  database.authChallenges.push({
    code: '1111',
    expiresAt: '2099-01-01T00:00:00.000Z',
    identifier: account.identifier,
    purpose: 'password-reset',
  })

  const result = await store.resetPasswordAfterCode({
    code: '1111',
    confirmPassword: 'StrongPass123',
    identifier: account.identifier,
    password: 'StrongPass123',
  })

  assert.deepEqual(result.broadcastIdentifiers, [account.identifier])
  assert.deepEqual(result.revokedTokens, [oldToken])
  assert.equal(store.getIdentifierByToken(oldToken), null)
  assert.ok(result.snapshot.session.sessionToken)
  assert.equal(store.getIdentifierByToken(result.snapshot.session.sessionToken), account.identifier)
})

test('change password keeps current session and revokes every other session', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const passwordHash = await hashPassword('OldPass123')
  const account = createAccount('+79991110203')
  account.passwordHash = passwordHash
  account.passwordSetAt = '2026-04-01T00:00:00.000Z'
  database.accounts.push(account)
  const currentToken = createSession(database, account.identifier, 'change-current')
  const otherToken = createSession(database, account.identifier, 'change-other')

  const result = await store.changePassword(currentToken, {
    confirmPassword: 'NewPass123',
    currentPassword: 'OldPass123',
    password: 'NewPass123',
  })

  assert.deepEqual(result.broadcastIdentifiers, [account.identifier])
  assert.deepEqual(result.revokedTokens, [otherToken])
  assert.equal(store.getIdentifierByToken(currentToken), account.identifier)
  assert.equal(store.getIdentifierByToken(otherToken), null)
  assert.equal(result.snapshot.session.sessionToken, currentToken)
})

test('clientDeliveryId deduplicates sends across direct, group, support and channel surfaces', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79991110211')
  const peer = createAccount('+79991110212')
  const support = createAccount('+79991110213', { staffRole: 'support' })
  database.accounts.push(owner, peer, support)
  const ownerToken = createSession(database, owner.identifier, 'dedupe-owner')
  const peerToken = createSession(database, peer.identifier, 'dedupe-peer')
  const supportToken = createSession(database, support.identifier, 'dedupe-support')
  seedAcceptedContactLink(database, owner.identifier, peer.identifier)

  const directDialog = await store.openDirectDialog(ownerToken, { identifier: peer.identifier })
  await store.sendDirectMessage(ownerToken, directDialog.dialogId, {
    clientDeliveryId: 'direct-delivery-1',
    text: 'direct-once',
  })
  await store.sendDirectMessage(ownerToken, directDialog.dialogId, {
    clientDeliveryId: 'direct-delivery-1',
    text: 'direct-once',
  })
  assert.equal(
    database.dialogMessages.filter(
      (message) =>
        message.dialogId === directDialog.dialogId && message.ownerIdentifier === owner.identifier,
    ).length,
    1,
  )

  const createdGroup = await store.createGroup(ownerToken, {
    commentsEnabledForAll: true,
    memberDialogIds: [directDialog.dialogId],
    title: 'Dedupe Group',
  })
  await store.sendGroupMessage(ownerToken, createdGroup.groupId, {
    clientDeliveryId: 'group-delivery-1',
    text: 'group-once',
  })
  await store.sendGroupMessage(ownerToken, createdGroup.groupId, {
    clientDeliveryId: 'group-delivery-1',
    text: 'group-once',
  })
  assert.equal(database.groupMessages.filter((message) => message.groupId === createdGroup.groupId).length, 1)

  const ownerSnapshot = store.getSnapshotByToken(ownerToken)
  const groupMessageId = ownerSnapshot?.groups.find((group) => group.id === createdGroup.groupId)?.messages[0]?.id
  assert.ok(groupMessageId)
  await store.sendGroupThreadComment(ownerToken, createdGroup.groupId, groupMessageId!, {
    clientDeliveryId: 'group-thread-delivery-1',
    text: 'group-comment-once',
  })
  await store.sendGroupThreadComment(ownerToken, createdGroup.groupId, groupMessageId!, {
    clientDeliveryId: 'group-thread-delivery-1',
    text: 'group-comment-once',
  })
  assert.equal(
    database.groupMessages.find(
      (message) => message.ownerIdentifier === owner.identifier && message.groupId === createdGroup.groupId && message.id === groupMessageId,
    )?.threadComments?.length,
    1,
  )

  await store.sendSupportTicket(ownerToken, {
    clientDeliveryId: 'support-ticket-delivery-1',
    text: 'support-root-once',
  })
  await store.sendSupportTicket(ownerToken, {
    clientDeliveryId: 'support-ticket-delivery-1',
    text: 'support-root-once',
  })
  assert.equal(database.supportTickets.filter((ticket) => ticket.ownerIdentifier === owner.identifier).length, 1)
  const ticketId = database.supportTickets[0]?.id
  assert.ok(ticketId !== undefined)

  await store.sendSupportTicketComment(ownerToken, ticketId!, {
    clientDeliveryId: 'support-comment-delivery-1',
    text: 'support-comment-once',
  })
  await store.sendSupportTicketComment(ownerToken, ticketId!, {
    clientDeliveryId: 'support-comment-delivery-1',
    text: 'support-comment-once',
  })
  assert.equal(database.supportTickets[0]?.comments.length, 1)

  await store.adminReplySupportTicket(supportToken, ticketId!, {
    clientDeliveryId: 'support-admin-delivery-1',
    status: 'open',
    text: 'staff-comment-once',
  })
  await store.adminReplySupportTicket(supportToken, ticketId!, {
    clientDeliveryId: 'support-admin-delivery-1',
    status: 'open',
    text: 'staff-comment-once',
  })
  assert.equal(database.supportTickets[0]?.comments.length, 2)

  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    commentsEnabledForAll: true,
    directLink: '@dedupe-channel',
    title: 'Dedupe Channel',
    visibility: 'private',
  })
  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    clientDeliveryId: 'channel-post-delivery-1',
    text: 'channel-post-once',
  })
  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    clientDeliveryId: 'channel-post-delivery-1',
    text: 'channel-post-once',
  })
  assert.equal(
    database.subscriptionPosts.filter(
      (post) =>
        post.ownerIdentifier === owner.identifier && post.deliveryId === 'channel-post-delivery-1',
    ).length,
    1,
  )

  const subscriptionSnapshot = store.getSnapshotByToken(ownerToken)
  const subscriptionChannel = subscriptionSnapshot?.subscriptionChannels.find(
    (channel) => channel.handle === '@dedupe-channel',
  )
  const postId = subscriptionChannel?.posts.find((post) => post.text === 'channel-post-once')?.id
  assert.ok(postId)
  await store.sendSubscriptionChannelThreadComment(ownerToken, subscriptionChannel!.id, postId!, {
    clientDeliveryId: 'channel-thread-delivery-1',
    text: 'channel-comment-once',
  })
  await store.sendSubscriptionChannelThreadComment(ownerToken, subscriptionChannel!.id, postId!, {
    clientDeliveryId: 'channel-thread-delivery-1',
    text: 'channel-comment-once',
  })
  assert.equal(
    database.subscriptionPosts.find(
      (post) => post.ownerIdentifier === owner.identifier && post.channelId === createdChannel.channelId && post.id === postId,
    )?.threadComments?.length,
    1,
  )

  assert.equal(peerToken.startsWith('session-'), true)
})

test('adminSearchUsers hides deleted archived phone duplicates behind the active account', () => {
  const store = createStore()
  const database = getStoreDatabase(store)

  database.accounts.push(
    {
      ...createAccount('archived_ccbjiedfiadaebeajiffecfaihhjfbae'),
      archivedOriginalIdentifier: '+79673215453',
      archivedProfile: {
        displayName: 'Алексей',
        surname: 'Мерзляков',
      },
      createdAt: '2026-03-28T13:17:55.297Z',
      deletedAt: '2026-03-28T19:31:56.715Z',
      deletedBySelfService: true,
      deletionMode: 'account-only',
      displayName: 'Аккаунт удалён',
      lastActiveAt: '2026-03-28T19:31:56.715Z',
      publicDeleted: true,
    },
    {
      ...createAccount('+79673215453'),
      createdAt: '2026-03-28T19:41:59.518Z',
      displayName: 'Алекс Тестер 7',
      lastActiveAt: '2026-04-03T06:50:18.539Z',
    },
  )

  const response = store.adminSearchUsers('+79673215453')

  assert.equal(response.users.length, 1)
  assert.equal(response.users[0]?.identifier, '+79673215453')
  assert.equal(response.users[0]?.displayName, 'Алекс Тестер 7')
})
