import { initialChats } from './mockData'
import type { Chat, GroupParticipant, GroupPreview } from '../shared/types'
import { formatContactStatus, normalizeIdentifier } from './utils'

export function buildGroupParticipantFromChat(chat: Chat, participantId?: number): GroupParticipant {
  return {
    accent: chat.accent,
    avatarImage: chat.avatarImage,
    favorite: chat.pinned,
    id: participantId ?? chat.id,
    identifier: chat.phone,
    nickname: chat.handle.replace(/^@+/u, ''),
    online: chat.online,
    premium: chat.premium,
    status: formatContactStatus(chat),
    title: chat.title,
  }
}

export function hydrateGroupParticipants(group: GroupPreview, chats: Chat[]): GroupParticipant[] {
  const chatByIdentifier = new Map(
    chats
      .map((chat) => [normalizeIdentifier(chat.phone), chat] as const)
      .filter((entry): entry is [string, Chat] => Boolean(entry[0])),
  )
  const chatByTitle = new Map(chats.map((chat) => [chat.title, chat]))
  const fallbackChatByTitle = new Map(initialChats.map((chat) => [chat.title, chat]))
  const seenParticipantIds = new Set<number>()
  const seenParticipantIdentifiers = new Set<string>()

  return group.participants
    .filter((participant) => {
      const normalizedParticipantIdentifier = normalizeIdentifier(participant.identifier ?? '')
      if (!normalizedParticipantIdentifier) {
        // Legacy roster entries without a stable identifier cannot be reconciled after profile edits
        // and show up as phantom duplicates in the members dialog.
        return false
      }

      if (seenParticipantIdentifiers.has(normalizedParticipantIdentifier)) {
        return false
      }
      seenParticipantIdentifiers.add(normalizedParticipantIdentifier)

      if (seenParticipantIds.has(participant.id)) {
        return false
      }
      seenParticipantIds.add(participant.id)
      return true
    })
    .map((participant) => {
      const normalizedParticipantIdentifier = normalizeIdentifier(participant.identifier ?? '')
      const matchingChat =
        chatByIdentifier.get(normalizedParticipantIdentifier) ??
        (!participant.archivedAccount
          ? chatByTitle.get(participant.title) ?? fallbackChatByTitle.get(participant.title)
          : null)

      return matchingChat
        ? {
            ...buildGroupParticipantFromChat(matchingChat, participant.id),
            archivedAccount: Boolean(participant.archivedAccount),
          }
        : {
            ...participant,
            identifier: normalizedParticipantIdentifier,
          }
    })
}
