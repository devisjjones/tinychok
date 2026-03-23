import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Message } from '../shared/types'

export type DeliveryIssue = 'pending' | 'failed'
export type PendingMessageStatus = 'sending' | DeliveryIssue

export type PendingAttachmentDraft = {
  file?: File
  fileName: string
  mediaUrl?: string
  mimeType: string
  size: number
}

export type PendingDirectMessage = {
  attachment?: Message['attachment']
  attachmentDraft?: PendingAttachmentDraft
  chatId: number
  createdAt: string
  deliveryId?: string
  localId: number
  queuedAt: string
  replyTo?: Message['replyTo']
  status: PendingMessageStatus
  text: string
  time: string
  retryCount: number
}

export type PendingGroupMessage = {
  attachment?: Message['attachment']
  attachmentDraft?: PendingAttachmentDraft
  createdAt: string
  deliveryId?: string
  groupId: number
  localId: number
  queuedAt: string
  replyTo?: Message['replyTo']
  status: PendingMessageStatus
  text: string
  time: string
  retryCount: number
}

type StoredAttachmentDraft = Omit<PendingAttachmentDraft, 'file'>

type StoredPendingDirectMessage = Omit<PendingDirectMessage, 'attachmentDraft'> & {
  attachmentDraft?: StoredAttachmentDraft
}

type StoredPendingGroupMessage = Omit<PendingGroupMessage, 'attachmentDraft'> & {
  attachmentDraft?: StoredAttachmentDraft
}

const DELIVERY_FAILURE_TIMEOUT_MS = 15_000
const failedDirectMessagesStorageKeyPrefix = 'tinychok.failed-direct'
const failedGroupMessagesStorageKeyPrefix = 'tinychok.failed-group'

function getFailedDirectMessagesStorageKey(identifier: string) {
  return `${failedDirectMessagesStorageKeyPrefix}:${identifier}`
}

function getFailedGroupMessagesStorageKey(identifier: string) {
  return `${failedGroupMessagesStorageKeyPrefix}:${identifier}`
}

function serializeAttachmentDraft(
  attachmentDraft?: PendingAttachmentDraft,
): StoredAttachmentDraft | undefined {
  if (!attachmentDraft) return undefined

  return {
    fileName: attachmentDraft.fileName,
    mediaUrl: attachmentDraft.mediaUrl,
    mimeType: attachmentDraft.mimeType,
    size: attachmentDraft.size,
  }
}

function deserializeAttachmentDraft(
  attachmentDraft?: StoredAttachmentDraft,
): PendingAttachmentDraft | undefined {
  if (!attachmentDraft) return undefined
  if (attachmentDraft.mediaUrl?.startsWith('blob:')) return undefined

  return {
    fileName: attachmentDraft.fileName,
    mediaUrl: attachmentDraft.mediaUrl,
    mimeType: attachmentDraft.mimeType,
    size: attachmentDraft.size,
  }
}

function sanitizePersistedAttachment(attachment?: Message['attachment']) {
  if (!attachment) return undefined
  if (attachment.mediaUrl.startsWith('blob:')) return undefined

  return {
    fileName: attachment.fileName,
    mediaUrl: attachment.mediaUrl,
    mimeType: attachment.mimeType,
    size: attachment.size,
  } satisfies NonNullable<Message['attachment']>
}

function serializePendingDirectMessages(messages: PendingDirectMessage[]): StoredPendingDirectMessage[] {
  return messages.map((message) => ({
    ...message,
    attachment: sanitizePersistedAttachment(message.attachment),
    attachmentDraft: serializeAttachmentDraft(message.attachmentDraft),
  }))
}

function serializePendingGroupMessages(messages: PendingGroupMessage[]): StoredPendingGroupMessage[] {
  return messages.map((message) => ({
    ...message,
    attachment: sanitizePersistedAttachment(message.attachment),
    attachmentDraft: serializeAttachmentDraft(message.attachmentDraft),
  }))
}

function loadPersistedFailedDirectMessages(identifier: string) {
  if (typeof window === 'undefined') return [] as PendingDirectMessage[]

  const raw = window.localStorage.getItem(getFailedDirectMessagesStorageKey(identifier))
  if (!raw) return []

  try {
    return (JSON.parse(raw) as StoredPendingDirectMessage[]).map((message) => ({
      ...message,
      attachment: sanitizePersistedAttachment(message.attachment),
      attachmentDraft: deserializeAttachmentDraft(message.attachmentDraft),
    }))
  } catch {
    return []
  }
}

function loadPersistedFailedGroupMessages(identifier: string) {
  if (typeof window === 'undefined') return [] as PendingGroupMessage[]

  const raw = window.localStorage.getItem(getFailedGroupMessagesStorageKey(identifier))
  if (!raw) return []

  try {
    return (JSON.parse(raw) as StoredPendingGroupMessage[]).map((message) => ({
      ...message,
      attachment: sanitizePersistedAttachment(message.attachment),
      attachmentDraft: deserializeAttachmentDraft(message.attachmentDraft),
    }))
  } catch {
    return []
  }
}

export function usePendingMessageOutbox(sessionIdentifier?: string) {
  const [pendingDirectMessages, setPendingDirectMessages] = useState<PendingDirectMessage[]>([])
  const [pendingGroupMessages, setPendingGroupMessages] = useState<PendingGroupMessage[]>([])
  const pendingDirectMessagesRef = useRef<PendingDirectMessage[]>([])
  const pendingGroupMessagesRef = useRef<PendingGroupMessage[]>([])

  const queuePendingDirectMessage = useCallback((message: PendingDirectMessage) => {
    setPendingDirectMessages((currentMessages) => [...currentMessages, message])
  }, [])

  const queuePendingGroupMessage = useCallback((message: PendingGroupMessage) => {
    setPendingGroupMessages((currentMessages) => [...currentMessages, message])
  }, [])

  const updatePendingDirectMessage = useCallback((
    localId: number,
    updater: (message: PendingDirectMessage) => PendingDirectMessage,
  ) => {
    setPendingDirectMessages((currentMessages) =>
      currentMessages.map((message) => (message.localId === localId ? updater(message) : message)),
    )
  }, [])

  const updatePendingGroupMessage = useCallback((
    localId: number,
    updater: (message: PendingGroupMessage) => PendingGroupMessage,
  ) => {
    setPendingGroupMessages((currentMessages) =>
      currentMessages.map((message) => (message.localId === localId ? updater(message) : message)),
    )
  }, [])

  const removePendingDirectMessage = useCallback((localId: number) => {
    setPendingDirectMessages((currentMessages) =>
      currentMessages.filter((message) => message.localId !== localId),
    )
  }, [])

  const removePendingGroupMessage = useCallback((localId: number) => {
    setPendingGroupMessages((currentMessages) =>
      currentMessages.filter((message) => message.localId !== localId),
    )
  }, [])

  const clearPendingDirectMessagesForChat = useCallback((chatId: number) => {
    setPendingDirectMessages((currentMessages) =>
      currentMessages.filter((message) => message.chatId !== chatId),
    )
  }, [])

  const clearPendingMessages = useCallback(() => {
    setPendingDirectMessages([])
    setPendingGroupMessages([])
  }, [])

  const markPendingDirectMessageAttemptFailed = useCallback((localId: number) => {
    const failureTimestamp = new Date().toISOString()

    updatePendingDirectMessage(localId, (message) => {
      const shouldFail = Date.now() - Date.parse(message.queuedAt) >= DELIVERY_FAILURE_TIMEOUT_MS

      return {
        ...message,
        retryCount: message.retryCount + 1,
        status: shouldFail ? 'failed' : 'pending',
      }
    })

    return failureTimestamp
  }, [updatePendingDirectMessage])

  const markPendingDirectMessageSending = useCallback((localId: number) => {
    updatePendingDirectMessage(localId, (message) => ({
      ...message,
      status: 'sending',
    }))
  }, [updatePendingDirectMessage])

  const markPendingGroupMessageAttemptFailed = useCallback((localId: number) => {
    const failureTimestamp = new Date().toISOString()

    updatePendingGroupMessage(localId, (message) => {
      const shouldFail = Date.now() - Date.parse(message.queuedAt) >= DELIVERY_FAILURE_TIMEOUT_MS

      return {
        ...message,
        retryCount: message.retryCount + 1,
        status: shouldFail ? 'failed' : 'pending',
      }
    })

    return failureTimestamp
  }, [updatePendingGroupMessage])

  const markPendingGroupMessageSending = useCallback((localId: number) => {
    updatePendingGroupMessage(localId, (message) => ({
      ...message,
      status: 'sending',
    }))
  }, [updatePendingGroupMessage])

  const pendingDirectMessageIds = useMemo(
    () =>
      new Set(
        pendingDirectMessages
          .filter((message) => message.status === 'pending' || message.status === 'sending')
          .map((message) => message.localId),
      ),
    [pendingDirectMessages],
  )
  const failedDirectMessageIds = useMemo(
    () => new Set(pendingDirectMessages.filter((message) => message.status === 'failed').map((message) => message.localId)),
    [pendingDirectMessages],
  )
  const pendingGroupMessageIds = useMemo(
    () =>
      new Set(
        pendingGroupMessages
          .filter((message) => message.status === 'pending' || message.status === 'sending')
          .map((message) => message.localId),
      ),
    [pendingGroupMessages],
  )
  const failedGroupMessageIds = useMemo(
    () => new Set(pendingGroupMessages.filter((message) => message.status === 'failed').map((message) => message.localId)),
    [pendingGroupMessages],
  )
  const hasPendingOutgoingMessages = useMemo(
    () =>
      pendingDirectMessages.some((message) => message.status !== 'failed') ||
      pendingGroupMessages.some((message) => message.status !== 'failed'),
    [pendingDirectMessages, pendingGroupMessages],
  )
  const hasLocalOutboxMessages = pendingDirectMessages.length > 0 || pendingGroupMessages.length > 0

  const getDirectMessageDeliveryIssue = useCallback(
    (messageId: number): DeliveryIssue | null =>
      failedDirectMessageIds.has(messageId)
        ? 'failed'
        : pendingDirectMessageIds.has(messageId)
          ? 'pending'
          : null,
    [failedDirectMessageIds, pendingDirectMessageIds],
  )

  const getGroupMessageDeliveryIssue = useCallback(
    (messageId: number): DeliveryIssue | null =>
      failedGroupMessageIds.has(messageId)
        ? 'failed'
        : pendingGroupMessageIds.has(messageId)
          ? 'pending'
          : null,
    [failedGroupMessageIds, pendingGroupMessageIds],
  )

  useEffect(() => {
    pendingDirectMessagesRef.current = pendingDirectMessages
  }, [pendingDirectMessages])

  useEffect(() => {
    pendingGroupMessagesRef.current = pendingGroupMessages
  }, [pendingGroupMessages])

  const restorePersistedFailedMessages = useCallback((identifier: string) => {
    setPendingDirectMessages((currentMessages) => {
      const pendingMessages = currentMessages.filter((message) => message.status !== 'failed')
      const failedMessages = loadPersistedFailedDirectMessages(identifier)

      return [
        ...pendingMessages,
        ...failedMessages.filter(
          (failedMessage) => !pendingMessages.some((message) => message.localId === failedMessage.localId),
        ),
      ]
    })

    setPendingGroupMessages((currentMessages) => {
      const pendingMessages = currentMessages.filter((message) => message.status !== 'failed')
      const failedMessages = loadPersistedFailedGroupMessages(identifier)

      return [
        ...pendingMessages,
        ...failedMessages.filter(
          (failedMessage) => !pendingMessages.some((message) => message.localId === failedMessage.localId),
        ),
      ]
    })
  }, [])

  useEffect(() => {
    if (!sessionIdentifier || typeof window === 'undefined') return

    const failedMessages = pendingDirectMessages.filter((message) => message.status === 'failed')
    const storageKey = getFailedDirectMessagesStorageKey(sessionIdentifier)

    if (failedMessages.length === 0) {
      window.localStorage.removeItem(storageKey)
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify(serializePendingDirectMessages(failedMessages)))
  }, [pendingDirectMessages, sessionIdentifier])

  useEffect(() => {
    if (!sessionIdentifier || typeof window === 'undefined') return

    const failedMessages = pendingGroupMessages.filter((message) => message.status === 'failed')
    const storageKey = getFailedGroupMessagesStorageKey(sessionIdentifier)

    if (failedMessages.length === 0) {
      window.localStorage.removeItem(storageKey)
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify(serializePendingGroupMessages(failedMessages)))
  }, [pendingGroupMessages, sessionIdentifier])

  return {
    clearPendingDirectMessagesForChat,
    clearPendingMessages,
    getDirectMessageDeliveryIssue,
    getGroupMessageDeliveryIssue,
    hasLocalOutboxMessages,
    hasPendingOutgoingMessages,
    markPendingDirectMessageAttemptFailed,
    markPendingDirectMessageSending,
    markPendingGroupMessageAttemptFailed,
    markPendingGroupMessageSending,
    pendingDirectMessages,
    pendingDirectMessagesRef,
    pendingGroupMessages,
    pendingGroupMessagesRef,
    queuePendingDirectMessage,
    queuePendingGroupMessage,
    removePendingDirectMessage,
    removePendingGroupMessage,
    restorePersistedFailedMessages,
    updatePendingDirectMessage,
    updatePendingGroupMessage,
  }
}
