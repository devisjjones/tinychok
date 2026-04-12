import assert from 'node:assert/strict'
import test from 'node:test'

import { hydrateGroupParticipants } from '../../src/app/groupParticipants'
import type { Chat, GroupPreview } from '../../src/shared/types'
import { coerceDatabasePayload, type Database } from './store'

function buildChat(
  id: number,
  title: string,
  phone: string,
  handle: string,
): Chat {
  return {
    accent: '#667085',
    contactState: 'accepted',
    handle,
    id,
    messages: [],
    mood: '',
    phone,
    status: 'в сети',
    title,
    unread: 0,
  }
}

function buildGroupPreview(participants: GroupPreview['participants']): GroupPreview {
  return {
    accent: '#8c5738',
    handle: '@rename-proof-group',
    id: 1,
    members: participants.length,
    messages: [],
    participants,
    preview: '',
    time: '20:46',
    title: 'Проверка участников группы',
    unread: 0,
  }
}

test('hydrateGroupParticipants drops legacy identifier-less duplicates after member rename', () => {
  const chats = [
    buildChat(1, 'Алексей Мерзляков', '+79673215453', '@Алексей_Мерзляков'),
    buildChat(2, 'Мираслава Мерзлякова', '+79669812701', '@Мираслава'),
    buildChat(3, 'Сашка СладкийНоНеПриторный', '+79669812702', '@user_812701'),
  ]

  const hydratedParticipants = hydrateGroupParticipants(buildGroupPreview([
    {
      accent: '#667085',
      id: 1,
      identifier: '+79673215453',
      status: 'в сети',
      title: 'Алексей Мерзляков',
    },
    {
      accent: '#667085',
      id: 401,
      status: 'Участник группы',
      title: 'Алексей Мерзляков Фаундер',
    },
    {
      accent: '#a855f7',
      id: 2,
      identifier: '+79669812701',
      status: 'в сети',
      title: 'Мираслава Мерзлякова',
    },
    {
      accent: '#f97316',
      id: 3,
      identifier: '+79669812702',
      status: 'в сети',
      title: 'Сашка СладкийНоНеПриторный',
    },
  ]), chats)

  assert.equal(hydratedParticipants.length, 3)
  assert.ok(hydratedParticipants.every((participant) => Boolean(participant.identifier)))
  assert.ok(!hydratedParticipants.some((participant) => participant.title === 'Алексей Мерзляков Фаундер'))
  assert.deepEqual(
    hydratedParticipants.map((participant) => participant.title),
    ['Алексей Мерзляков', 'Мираслава Мерзлякова', 'Сашка СладкийНоНеПриторный'],
  )
})

test('coerceDatabasePayload prunes legacy group participant residue without identifiers', () => {
  const baseDatabase = structuredClone(coerceDatabasePayload(undefined).database) as Database

  baseDatabase.groups.push({
    accent: '#8c5738',
    archiveReason: undefined,
    archivedAt: undefined,
    avatarImage: undefined,
    commentBlacklistIdentifiers: [],
    commentsEnabledForAll: true,
    commentsEnabledForPremium: false,
    creatorIdentifier: '+79673215453',
    description: '',
    groupOwnerIdentifier: '+79673215453',
    handle: '@rename-proof-group',
    id: 99,
    isTestEntity: false,
    latestActivityAt: '2026-04-12T20:46:00.000Z',
    members: 3,
    muted: false,
    ownerIdentifier: '+79673215453',
    participants: [
      {
        accent: '#667085',
        id: 1,
        identifier: '+79673215453',
        status: 'в сети',
        title: 'Алексей Мерзляков',
      },
      {
        accent: '#667085',
        id: 401,
        status: 'Участник группы',
        title: 'Алексей Мерзляков Фаундер',
      },
      {
        accent: '#a855f7',
        id: 2,
        identifier: '+79669812701',
        status: 'в сети',
        title: 'Мираслава Мерзлякова',
      },
      {
        accent: '#f97316',
        id: 3,
        identifier: '+79669812702',
        status: 'в сети',
        title: 'Сашка СладкийНоНеПриторный',
      },
    ],
    preview: '',
    sharedId: 'rename-proof-group-shared',
    showHistoryToNewMembers: true,
    time: '20:46',
    title: 'Проверка участников группы',
    unread: 0,
  })

  const normalized = coerceDatabasePayload(structuredClone(baseDatabase))
  const normalizedGroup = normalized.database.groups.find((group) => group.id === 99)

  assert.ok(normalizedGroup)
  assert.equal(normalized.needsPersistenceRewrite, true)
  assert.equal(normalizedGroup.participants.length, 3)
  assert.equal(normalizedGroup.members, 3)
  assert.ok(normalizedGroup.participants.every((participant) => Boolean(participant.identifier)))
  assert.ok(!normalizedGroup.participants.some((participant) => participant.title === 'Алексей Мерзляков Фаундер'))
})
