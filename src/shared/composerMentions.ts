import type { GroupParticipant, MessageMention, ThreadComment } from './types'
import { normalizeIdentifier, normalizeNickname } from './utils'

const composerMentionCharacterPattern = /[A-Za-zА-Яа-яЁё0-9_]/u

export type ComposerMentionMatch = {
  query: string
  rangeEnd: number
  rangeStart: number
}

function isComposerMentionCharacter(character: string) {
  return composerMentionCharacterPattern.test(character)
}

function isComposerMentionBoundary(character?: string) {
  return !character || (!isComposerMentionCharacter(character) && character !== '@')
}

function normalizeComposerMentionLookup(value: string) {
  return normalizeNickname(value).toLowerCase()
}

export function findComposerMentionMatch(
  value: string,
  cursorPosition: number,
  selectionEnd = cursorPosition,
): ComposerMentionMatch | null {
  const safeCursorPosition = Math.max(0, Math.min(cursorPosition, value.length))
  const safeSelectionEnd = Math.max(0, Math.min(selectionEnd, value.length))
  if (safeSelectionEnd !== safeCursorPosition) {
    return null
  }

  let mentionStart = safeCursorPosition - 1
  while (mentionStart >= 0) {
    const character = value[mentionStart]
    if (character === '@') {
      break
    }
    if (!isComposerMentionCharacter(character)) {
      return null
    }
    mentionStart -= 1
  }

  if (mentionStart < 0 || value[mentionStart] !== '@') {
    return null
  }

  if (!isComposerMentionBoundary(value[mentionStart - 1])) {
    return null
  }

  let rangeEnd = mentionStart + 1
  while (rangeEnd < value.length && isComposerMentionCharacter(value[rangeEnd] ?? '')) {
    rangeEnd += 1
  }

  const rawQuery = value.slice(mentionStart + 1, safeCursorPosition)
  const normalizedQuery = normalizeNickname(rawQuery)
  if (rawQuery.length !== normalizedQuery.length) {
    return null
  }

  return {
    query: normalizedQuery,
    rangeEnd,
    rangeStart: mentionStart,
  }
}

export function replaceComposerMentionMatch(
  value: string,
  match: ComposerMentionMatch,
  nickname: string,
) {
  const normalizedNickname = normalizeNickname(nickname)
  if (!normalizedNickname) {
    return {
      nextCursorPosition: match.rangeEnd,
      nextValue: value,
    }
  }

  const suffix = value.slice(match.rangeEnd)
  const insertedMention = `@${normalizedNickname}${suffix.length === 0 ? ' ' : ''}`
  const nextValue = `${value.slice(0, match.rangeStart)}${insertedMention}${suffix}`

  return {
    nextCursorPosition: match.rangeStart + insertedMention.length,
    nextValue,
  }
}

export function buildComposerMentionCandidates(
  participants: ReadonlyArray<GroupParticipant>,
): GroupParticipant[] {
  const candidatesByKey = new Map<string, GroupParticipant>()

  for (const participant of participants) {
    const nickname = normalizeNickname(participant.nickname ?? '')
    if (!nickname) {
      continue
    }

    const identifier = normalizeIdentifier(participant.identifier ?? '')
    const candidateKey = nickname.toLowerCase()
    if (candidatesByKey.has(candidateKey)) {
      continue
    }

    candidatesByKey.set(candidateKey, {
      ...participant,
      identifier: identifier || undefined,
      nickname,
    })
  }

  return [...candidatesByKey.values()].sort((left, right) => {
    const leftNickname = normalizeNickname(left.nickname ?? '')
    const rightNickname = normalizeNickname(right.nickname ?? '')
    const nicknameComparison = leftNickname.localeCompare(rightNickname, 'ru')
    if (nicknameComparison !== 0) {
      return nicknameComparison
    }

    return left.title.localeCompare(right.title, 'ru')
  })
}

export function filterComposerMentionCandidates(
  candidates: ReadonlyArray<GroupParticipant>,
  query: string,
  limit = 6,
): GroupParticipant[] {
  const normalizedQuery = normalizeComposerMentionLookup(query)
  const matches =
    normalizedQuery.length === 0
      ? [...candidates]
      : candidates.filter((candidate) => {
          const normalizedNickname = normalizeComposerMentionLookup(candidate.nickname ?? '')
          return (
            normalizedNickname.startsWith(normalizedQuery) ||
            normalizedNickname.includes(normalizedQuery)
          )
        })

  return matches
    .sort((left, right) => {
      const leftNickname = normalizeComposerMentionLookup(left.nickname ?? '')
      const rightNickname = normalizeComposerMentionLookup(right.nickname ?? '')
      const leftStartsWith = leftNickname.startsWith(normalizedQuery)
      const rightStartsWith = rightNickname.startsWith(normalizedQuery)

      if (leftStartsWith !== rightStartsWith) {
        return leftStartsWith ? -1 : 1
      }

      if (leftNickname.length !== rightNickname.length) {
        return leftNickname.length - rightNickname.length
      }

      return left.title.localeCompare(right.title, 'ru')
    })
    .slice(0, limit)
}

export function extractMentionedNicknames(text: string) {
  const nicknames = new Set<string>()

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '@') {
      continue
    }

    if (!isComposerMentionBoundary(text[index - 1])) {
      continue
    }

    let rangeEnd = index + 1
    while (rangeEnd < text.length && isComposerMentionCharacter(text[rangeEnd] ?? '')) {
      rangeEnd += 1
    }

    if (rangeEnd === index + 1) {
      continue
    }

    nicknames.add(normalizeComposerMentionLookup(text.slice(index + 1, rangeEnd)))
    index = rangeEnd - 1
  }

  return [...nicknames]
}

export function buildMessageMentions(
  text: string,
  participants:
    | ReadonlyArray<
        Pick<GroupParticipant, 'accent' | 'avatarImage' | 'identifier' | 'nickname' | 'status' | 'title'>
      >
    | undefined,
): MessageMention[] {
  const mentionedNicknames = extractMentionedNicknames(text)
  if (mentionedNicknames.length === 0 || !participants?.length) {
    return []
  }

  const mentionByNickname = new Map<string, MessageMention>()
  for (const participant of participants) {
    const nickname = normalizeNickname(participant.nickname ?? '')
    if (!nickname) {
      continue
    }

    const nicknameKey = nickname.toLowerCase()
    if (mentionByNickname.has(nicknameKey)) {
      continue
    }

    const normalizedIdentifier = normalizeIdentifier(participant.identifier ?? '')
    const normalizedTitle = participant.title.trim()
    mentionByNickname.set(nicknameKey, {
      nickname,
      sourceContact: {
        accent: participant.accent,
        avatarImage: participant.avatarImage,
        handle: `@${nickname}`,
        identifier: normalizedIdentifier || undefined,
        status: participant.status?.trim() || undefined,
        title: normalizedTitle || `@${nickname}`,
      },
    })
  }

  return mentionedNicknames.flatMap((nickname) => {
    const mention = mentionByNickname.get(nickname)
    return mention ? [mention] : []
  })
}

export function buildThreadMentionCandidates(
  participants: ReadonlyArray<GroupParticipant>,
  comments: ReadonlyArray<ThreadComment>,
  resolveCommentParticipant: (comment: ThreadComment) => GroupParticipant | null,
) {
  const mergedParticipants = [...participants]

  for (const comment of comments) {
    const participant = resolveCommentParticipant(comment)
    if (participant) {
      mergedParticipants.push(participant)
    }
  }

  return buildComposerMentionCandidates(mergedParticipants)
}
