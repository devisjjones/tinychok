type AuthorChainComparable = {
  author?: string
  authorIdentifier?: string
  displayAuthor?: string
  groupParticipantId?: number
  system?: boolean
}

function normalizeAuthorChainValue(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

export function getMessageAuthorChainKey(message: AuthorChainComparable | null | undefined) {
  if (!message || message.system) {
    return null
  }

  if (message.author === 'me') {
    return 'author:me'
  }

  if (typeof message.groupParticipantId === 'number' && Number.isFinite(message.groupParticipantId)) {
    return `participant:${message.groupParticipantId}`
  }

  const authorIdentifier = normalizeAuthorChainValue(message.authorIdentifier)
  if (authorIdentifier) {
    return `identifier:${authorIdentifier}`
  }

  const displayAuthor = normalizeAuthorChainValue(message.displayAuthor)
  if (displayAuthor) {
    return `display:${displayAuthor}`
  }

  return 'author:incoming'
}

export function startsMessageAuthorChain(
  message: AuthorChainComparable | null | undefined,
  previousMessage: AuthorChainComparable | null | undefined,
) {
  const currentKey = getMessageAuthorChainKey(message)
  if (!currentKey) {
    return false
  }

  return getMessageAuthorChainKey(previousMessage) !== currentKey
}

export function shouldRenderIncomingAuthorStrip(
  message: AuthorChainComparable | null | undefined,
  previousMessage: AuthorChainComparable | null | undefined,
) {
  return message?.author !== 'me' && startsMessageAuthorChain(message, previousMessage)
}

export function shouldUseAuthorChainBreakSpacing(
  message: AuthorChainComparable | null | undefined,
  previousMessage: AuthorChainComparable | null | undefined,
) {
  return Boolean(previousMessage) && startsMessageAuthorChain(message, previousMessage)
}
