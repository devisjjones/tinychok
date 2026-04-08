import test from 'node:test'
import assert from 'node:assert/strict'
import { coerceDatabasePayload } from './store'
import {
  buildHybridCollectionsSnapshot,
  hydrateDatabaseWithHybridCollections,
  stripHybridCollectionsFromDatabase,
} from './store-factory'

test('postgres hybrid persistence strips text-heavy collections out of slim runtime state', () => {
  const { database } = coerceDatabasePayload(undefined)
  database.accounts = [
    {
      accountId: 'acc_1',
      createdAt: '2026-04-07T07:55:00.000Z',
      displayName: 'Tester',
      identifier: '+79990000001',
      status: 'online',
      statusHistory: [
        {
          setAt: '2026-04-07T07:55:00.000Z',
          status: 'online',
        },
      ],
    } as (typeof database.accounts)[number],
  ]
  database.adminAuditLogs = [
    {
      action: 'archive-group',
      actorIdentifier: '+79990000001',
      actorRole: 'owner',
      createdAt: '2026-04-07T08:08:00.000Z',
      id: 'audit-1',
      summary: 'archived group',
      targetId: 'group:7',
      targetType: 'group',
    } as (typeof database.adminAuditLogs)[number],
  ]
  database.archivedMedia = [
    {
      archivedAt: '2026-04-07T08:09:00.000Z',
      archiveReason: 'manual-delete',
      fileName: 'archive.zip',
      id: 'archived-media-1',
      kind: 'attachment',
      mediaUrl: 'https://example.com/archive.zip',
      mimeType: 'application/zip',
      originalContext: 'group:7',
      ownerIdentifier: '+79990000001',
      primaryLabel: 'archive.zip',
      size: 2048,
      storageSubjectId: '+79990000001',
      storageSubjectKind: 'user',
    } as (typeof database.archivedMedia)[number],
  ]
  database.dialogMessages = [
    {
      author: 'me',
      createdAt: '2026-04-07T08:00:00.000Z',
      dialogId: 1,
      id: 1,
      ownerIdentifier: '+79990000001',
      text: 'direct text',
      time: '11:00',
    } as (typeof database.dialogMessages)[number],
  ]
  database.groupMessages = [
    {
      author: 'me',
      createdAt: '2026-04-07T08:01:00.000Z',
      groupId: 7,
      id: 1,
      ownerIdentifier: '+79990000001',
      text: 'group text',
      threadComments: [],
      time: '11:01',
    } as (typeof database.groupMessages)[number],
  ]
  database.groups = [
    {
      accent: '#8c5738',
      handle: '@group_7',
      id: 7,
      members: 2,
      ownerIdentifier: '+79990000001',
      participants: [],
      preview: 'group preview',
      time: '11:01',
      title: 'Test Group',
      unread: 1,
    } as (typeof database.groups)[number],
  ]
  database.ipAccessLogs = [
    {
      createdAt: '2026-04-07T08:10:00.000Z',
      eventType: 'login',
      id: 'ip-log-1',
      identifier: '+79990000001',
      ip: '127.0.0.1',
      source: 'http-api',
    } as (typeof database.ipAccessLogs)[number],
  ]
  database.pendingChannelInvitations = [
    {
      channelHandle: '@channel_3',
      createdAt: '2026-04-07T08:11:00.000Z',
      recipientIdentifier: '+79990000002',
      senderIdentifier: '+79990000001',
    } as (typeof database.pendingChannelInvitations)[number],
  ]
  database.pendingGroupInvitations = [
    {
      createdAt: '2026-04-07T08:12:00.000Z',
      recipientIdentifier: '+79990000002',
      senderIdentifier: '+79990000001',
      sharedId: 'shared-group-7',
    } as (typeof database.pendingGroupInvitations)[number],
  ]
  database.pendingMediaUploads = [
    {
      createdAt: '2026-04-07T08:13:00.000Z',
      fileName: 'file.txt',
      kind: 'attachment',
      linked: false,
      mediaUrl: 'https://example.com/file.txt',
      mimeType: 'text/plain',
      ownerIdentifier: '+79990000001',
      size: 128,
      storageKey: 'uploads/file-1',
    } as (typeof database.pendingMediaUploads)[number],
  ]
  database.subscriptionChannels = [
    {
      accent: '#8c5738',
      handle: '@channel_3',
      id: 3,
      ownerIdentifier: '+79990000001',
      posts: [],
      preview: 'channel preview',
      readers: 1,
      time: '11:02',
      title: 'Channel',
      unread: 0,
      visibility: 'public',
    } as (typeof database.subscriptionChannels)[number],
  ]
  database.subscriptionPosts = [
    {
      channelId: 3,
      createdAt: '2026-04-07T08:02:00.000Z',
      id: 1,
      ownerIdentifier: '+79990000001',
      text: 'channel text',
      threadComments: [],
      time: '11:02',
    } as (typeof database.subscriptionPosts)[number],
  ]
  database.supportTickets = [
    {
      comments: [],
      createdAt: '2026-04-07T08:03:00.000Z',
      id: 4,
      ownerIdentifier: '+79990000001',
      status: 'open',
      text: 'support text',
      threadId: 'support:4',
      time: '11:03',
      updatedAt: '2026-04-07T08:03:00.000Z',
    } as (typeof database.supportTickets)[number],
  ]
  database.threadStates = [
    {
      ownerIdentifier: '+79990000001',
      subscription: 'subscribed',
      threadId: 'group:7:thread:1',
    } as (typeof database.threadStates)[number],
  ]
  database.nextSupportTicketNumber = 5

  const slimDatabase = stripHybridCollectionsFromDatabase(database)

  assert.equal(slimDatabase.accounts[0]?.statusHistory, undefined)
  assert.equal(slimDatabase.adminAuditLogs.length, 0)
  assert.equal(slimDatabase.archivedMedia.length, 0)
  assert.equal(slimDatabase.dialogMessages.length, 0)
  assert.equal(slimDatabase.groupMessages.length, 0)
  assert.equal(slimDatabase.groups.length, 0)
  assert.equal(slimDatabase.ipAccessLogs.length, 0)
  assert.equal(slimDatabase.pendingChannelInvitations.length, 0)
  assert.equal(slimDatabase.pendingGroupInvitations.length, 0)
  assert.equal(slimDatabase.pendingMediaUploads.length, 0)
  assert.equal(slimDatabase.subscriptionChannels.length, 0)
  assert.equal(slimDatabase.subscriptionPosts.length, 0)
  assert.equal(slimDatabase.supportTickets.length, 0)
  assert.equal(slimDatabase.threadStates.length, 0)
  assert.equal(slimDatabase.nextSupportTicketNumber, 5)
})

test('postgres hybrid persistence can hydrate slim runtime state back with normalized text collections', () => {
  const { database } = coerceDatabasePayload(undefined)
  database.accounts = [
    {
      accountId: 'acc_1',
      createdAt: '2026-04-07T07:55:00.000Z',
      displayName: 'Tester',
      identifier: '+79990000001',
      status: 'online',
    } as (typeof database.accounts)[number],
  ]
  const collections = buildHybridCollectionsSnapshot({
    ...database,
    accounts: [
      {
        ...database.accounts[0],
        statusHistory: [
          {
            setAt: '2026-04-07T07:55:00.000Z',
            status: 'online',
          },
        ],
      } as (typeof database.accounts)[number],
    ],
    adminAuditLogs: [
      {
        action: 'archive-group',
        actorIdentifier: '+79990000001',
        actorRole: 'owner',
        createdAt: '2026-04-07T08:08:00.000Z',
        id: 'audit-1',
        summary: 'archived group',
        targetId: 'group:7',
        targetType: 'group',
      } as (typeof database.adminAuditLogs)[number],
    ],
    archivedMedia: [
      {
        archivedAt: '2026-04-07T08:09:00.000Z',
        archiveReason: 'manual-delete',
        fileName: 'archive.zip',
        id: 'archived-media-1',
        kind: 'attachment',
        mediaUrl: 'https://example.com/archive.zip',
        mimeType: 'application/zip',
        originalContext: 'group:7',
        ownerIdentifier: '+79990000001',
        primaryLabel: 'archive.zip',
        size: 2048,
        storageSubjectId: '+79990000001',
        storageSubjectKind: 'user',
      } as (typeof database.archivedMedia)[number],
    ],
    dialogMessages: [
      {
        author: 'me',
        createdAt: '2026-04-07T08:00:00.000Z',
        dialogId: 1,
        id: 1,
        ownerIdentifier: '+79990000001',
        text: 'direct text',
        time: '11:00',
      } as (typeof database.dialogMessages)[number],
    ],
    groupMessages: [
      {
        author: 'me',
        createdAt: '2026-04-07T08:01:00.000Z',
        groupId: 7,
        id: 1,
        ownerIdentifier: '+79990000001',
        text: 'group text',
        threadComments: [],
        time: '11:01',
      } as (typeof database.groupMessages)[number],
    ],
    groups: [
      {
        accent: '#8c5738',
        handle: '@group_7',
        id: 7,
        members: 2,
        ownerIdentifier: '+79990000001',
        participants: [],
        preview: 'group preview',
        time: '11:01',
        title: 'Test Group',
        unread: 1,
      } as (typeof database.groups)[number],
    ],
    ipAccessLogs: [
      {
        createdAt: '2026-04-07T08:10:00.000Z',
        eventType: 'login',
        id: 'ip-log-1',
        identifier: '+79990000001',
        ip: '127.0.0.1',
        source: 'http-api',
      } as (typeof database.ipAccessLogs)[number],
    ],
    pendingChannelInvitations: [
      {
        channelHandle: '@channel_3',
        createdAt: '2026-04-07T08:11:00.000Z',
        recipientIdentifier: '+79990000002',
        senderIdentifier: '+79990000001',
      } as (typeof database.pendingChannelInvitations)[number],
    ],
    pendingGroupInvitations: [
      {
        createdAt: '2026-04-07T08:12:00.000Z',
        recipientIdentifier: '+79990000002',
        senderIdentifier: '+79990000001',
        sharedId: 'shared-group-7',
      } as (typeof database.pendingGroupInvitations)[number],
    ],
    pendingMediaUploads: [
      {
        createdAt: '2026-04-07T08:13:00.000Z',
        fileName: 'file.txt',
        kind: 'attachment',
        linked: false,
        mediaUrl: 'https://example.com/file.txt',
        mimeType: 'text/plain',
        ownerIdentifier: '+79990000001',
        size: 128,
        storageKey: 'uploads/file-1',
      } as (typeof database.pendingMediaUploads)[number],
    ],
    subscriptionChannels: [
      {
        accent: '#8c5738',
        handle: '@channel_3',
        id: 3,
        ownerIdentifier: '+79990000001',
        posts: [],
        preview: 'channel preview',
        readers: 1,
        time: '11:02',
        title: 'Channel',
        unread: 0,
        visibility: 'public',
      } as (typeof database.subscriptionChannels)[number],
    ],
    subscriptionPosts: [
      {
        channelId: 3,
        createdAt: '2026-04-07T08:02:00.000Z',
        id: 1,
        ownerIdentifier: '+79990000001',
        text: 'channel text',
        threadComments: [],
        time: '11:02',
      } as (typeof database.subscriptionPosts)[number],
    ],
    supportTickets: [
      {
        comments: [],
        createdAt: '2026-04-07T08:03:00.000Z',
        id: 4,
        ownerIdentifier: '+79990000001',
        status: 'open',
        text: 'support text',
        threadId: 'support:4',
        time: '11:03',
        updatedAt: '2026-04-07T08:03:00.000Z',
      } as (typeof database.supportTickets)[number],
    ],
    threadStates: [
      {
        ownerIdentifier: '+79990000001',
        subscription: 'subscribed',
        threadId: 'group:7:thread:1',
      } as (typeof database.threadStates)[number],
    ],
  })

  const slimDatabase = stripHybridCollectionsFromDatabase({
    ...database,
    nextSupportTicketNumber: 5,
  })
  const hydratedDatabase = hydrateDatabaseWithHybridCollections(slimDatabase, collections)

  assert.equal(hydratedDatabase.accounts[0]?.statusHistory?.[0]?.status, 'online')
  assert.equal(hydratedDatabase.adminAuditLogs[0]?.summary, 'archived group')
  assert.equal(hydratedDatabase.archivedMedia[0]?.fileName, 'archive.zip')
  assert.equal(hydratedDatabase.dialogMessages[0]?.text, 'direct text')
  assert.equal(hydratedDatabase.groupMessages[0]?.text, 'group text')
  assert.equal(hydratedDatabase.groups[0]?.title, 'Test Group')
  assert.equal(hydratedDatabase.ipAccessLogs[0]?.ip, '127.0.0.1')
  assert.equal(hydratedDatabase.pendingChannelInvitations[0]?.channelHandle, '@channel_3')
  assert.equal(hydratedDatabase.pendingGroupInvitations[0]?.sharedId, 'shared-group-7')
  assert.equal(hydratedDatabase.pendingMediaUploads[0]?.storageKey, 'uploads/file-1')
  assert.equal(hydratedDatabase.subscriptionChannels[0]?.title, 'Channel')
  assert.equal(hydratedDatabase.subscriptionPosts[0]?.text, 'channel text')
  assert.equal(hydratedDatabase.supportTickets[0]?.text, 'support text')
  assert.equal(hydratedDatabase.threadStates[0]?.threadId, 'group:7:thread:1')
  assert.equal(hydratedDatabase.nextSupportTicketNumber, 5)
})
