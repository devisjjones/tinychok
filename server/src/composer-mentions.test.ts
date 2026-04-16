import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildComposerMentionCandidates,
  buildMessageMentions,
  buildThreadMentionCandidates,
  extractMentionedNicknames,
  filterComposerMentionCandidates,
  findComposerMentionMatch,
  replaceComposerMentionMatch,
} from '../../src/shared/composerMentions'
import type { GroupParticipant, ThreadComment } from '../../src/shared/types'

function createParticipant(
  id: number,
  nickname: string,
  options?: Partial<GroupParticipant>,
): GroupParticipant {
  return {
    accent: options?.accent ?? '#8c5738',
    avatarImage: options?.avatarImage,
    favorite: options?.favorite,
    id,
    identifier: options?.identifier ?? `+7999000${String(id).padStart(4, '0')}`,
    nickname,
    online: options?.online,
    premium: options?.premium,
    status: options?.status ?? 'На связи',
    title: options?.title ?? `User ${id}`,
    archivedAccount: options?.archivedAccount,
  }
}

function createComment(authorIdentifier: string): ThreadComment {
  return {
    author: 'them',
    authorIdentifier,
    id: Number(authorIdentifier.replace(/[^\d]/g, '').slice(-2) || 1),
    text: 'Комментарий',
    time: '10:00',
  }
}

test('composer mention match finds the active @nickname token and ignores email addresses', () => {
  const match = findComposerMentionMatch('Привет, @mira', 'Привет, @mira'.length)
  assert.deepEqual(match, {
    query: 'mira',
    rangeEnd: 'Привет, @mira'.length,
    rangeStart: 'Привет, '.length,
  })

  assert.equal(findComposerMentionMatch('mira@example.com', 'mira@example.com'.length), null)
  assert.deepEqual(findComposerMentionMatch('@', 1), {
    query: '',
    rangeEnd: 1,
    rangeStart: 0,
  })
})

test('composer mention replacement inserts the selected nickname and keeps trailing text intact', () => {
  const match = findComposerMentionMatch('Привет, @mi', 'Привет, @mi'.length)
  assert.ok(match)

  assert.deepEqual(replaceComposerMentionMatch('Привет, @mi', match!, 'mira'), {
    nextCursorPosition: 'Привет, @mira '.length,
    nextValue: 'Привет, @mira ',
  })

  const punctuationMatch = findComposerMentionMatch('(@mi), привет', 4)
  assert.ok(punctuationMatch)
  assert.deepEqual(replaceComposerMentionMatch('(@mi), привет', punctuationMatch!, 'mira'), {
    nextCursorPosition: '(@mira'.length,
    nextValue: '(@mira), привет',
  })
})

test('composer mention extraction deduplicates nicknames and skips malformed tokens', () => {
  assert.deepEqual(
    extractMentionedNicknames('Привет, @Mira и ещё раз @mira, но не mira@example.com и не @@nope'),
    ['mira'],
  )
})

test('message mentions resolve matched nicknames into full contact metadata', () => {
  const mentions = buildMessageMentions('Привет, @mira и @roman', [
    createParticipant(1, 'mira', {
      identifier: '+799900000011',
      title: 'Мира Тестова',
    }),
    createParticipant(2, 'roman', {
      identifier: '+799900000022',
      status: 'В сети',
      title: 'Роман Петров',
    }),
  ])

  assert.deepEqual(
    mentions.map((mention) => ({
      handle: mention.sourceContact.handle,
      identifier: mention.sourceContact.identifier,
      nickname: mention.nickname,
      title: mention.sourceContact.title,
    })),
    [
      {
        handle: '@mira',
        identifier: '+799900000011',
        nickname: 'mira',
        title: 'Мира Тестова',
      },
      {
        handle: '@roman',
        identifier: '+799900000022',
        nickname: 'roman',
        title: 'Роман Петров',
      },
    ],
  )
})

test('composer mention candidate helpers keep only nickname-based participants from the current scope', () => {
  const candidates = buildComposerMentionCandidates([
    createParticipant(1, 'mira', { title: 'Мира' }),
    createParticipant(2, '', { title: 'Без ника' }),
    createParticipant(3, 'mira', { identifier: '+799900000001', title: 'Дубликат' }),
    createParticipant(4, 'mike', { title: 'Майк' }),
  ])

  assert.equal(candidates.length, 2)
  assert.deepEqual(
    candidates.map((candidate) => candidate.nickname),
    ['mike', 'mira'],
  )
  assert.deepEqual(
    filterComposerMentionCandidates(candidates, 'mi').map((candidate) => candidate.nickname),
    ['mike', 'mira'],
  )
})

test('thread mention candidates merge thread participants with the root room roster', () => {
  const groupParticipants = [createParticipant(1, 'mira', { title: 'Мира' })]
  const threadComments = [createComment('+799900000099')]
  const merged = buildThreadMentionCandidates(groupParticipants, threadComments, (comment) =>
    comment.authorIdentifier === '+799900000099'
      ? createParticipant(99, 'roman', { identifier: comment.authorIdentifier, title: 'Роман' })
      : null,
  )

  assert.deepEqual(
    merged.map((participant) => participant.nickname),
    ['mira', 'roman'],
  )
})
