import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getMessageAuthorChainKey,
  shouldRenderIncomingAuthorStrip,
  shouldUseAuthorChainBreakSpacing,
  startsMessageAuthorChain,
} from '../../src/app/messageAuthorChains'

test('message author chain keys stay stable for self, group participants and thread identifiers', () => {
  assert.equal(getMessageAuthorChainKey({ author: 'me' }), 'author:me')
  assert.equal(
    getMessageAuthorChainKey({ author: 'them', groupParticipantId: 42, displayAuthor: 'Ignored' }),
    'participant:42',
  )
  assert.equal(
    getMessageAuthorChainKey({ author: 'them', authorIdentifier: '+79670000000' }),
    'identifier:+79670000000',
  )
  assert.equal(
    getMessageAuthorChainKey({ author: 'them', displayAuthor: 'Мираслава Мерзлякова' }),
    'display:мираслава мерзлякова',
  )
  assert.equal(getMessageAuthorChainKey({ author: 'them', system: true }), null)
})

test('incoming author strips only render at the start of an author chain', () => {
  const participantMessage = {
    author: 'them',
    displayAuthor: 'Мираслава',
    groupParticipantId: 7,
  } as const

  assert.equal(shouldRenderIncomingAuthorStrip(participantMessage, null), true)
  assert.equal(shouldRenderIncomingAuthorStrip(participantMessage, { author: 'me' }), true)
  assert.equal(shouldRenderIncomingAuthorStrip(participantMessage, participantMessage), false)
  assert.equal(
    shouldRenderIncomingAuthorStrip(
      participantMessage,
      { author: 'them', displayAuthor: 'Другой участник', groupParticipantId: 8 },
    ),
    true,
  )
  assert.equal(shouldRenderIncomingAuthorStrip({ author: 'me' }, participantMessage), false)
})

test('author chain spacing only expands when the visible author changes', () => {
  const myMessage = { author: 'me' } as const
  const firstIncoming = { author: 'them', displayAuthor: 'Мираслава', groupParticipantId: 7 } as const
  const secondIncoming = { author: 'them', displayAuthor: 'Мираслава', groupParticipantId: 7 } as const
  const supportComment = {
    author: 'them',
    authorIdentifier: '+79670000001',
    displayAuthor: 'Поддержка',
  } as const

  assert.equal(shouldUseAuthorChainBreakSpacing(firstIncoming, null), false)
  assert.equal(shouldUseAuthorChainBreakSpacing(firstIncoming, myMessage), true)
  assert.equal(shouldUseAuthorChainBreakSpacing(secondIncoming, firstIncoming), false)
  assert.equal(shouldUseAuthorChainBreakSpacing(supportComment, secondIncoming), true)
  assert.equal(startsMessageAuthorChain(supportComment, secondIncoming), true)
})
