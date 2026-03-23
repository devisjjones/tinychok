import { useCallback, useState } from 'react'
import type { ActionAnchor } from '../shared/types'

export function useRoomMessageActions() {
  const [activeSubscriptionPostId, setActiveSubscriptionPostId] = useState<number | null>(null)
  const [forwardingSubscriptionPostText, setForwardingSubscriptionPostText] = useState('')
  const [confirmingDeleteSubscriptionPostId, setConfirmingDeleteSubscriptionPostId] = useState<number | null>(null)
  const [subscriptionPostActionAnchor, setSubscriptionPostActionAnchor] = useState<ActionAnchor | null>(null)
  const [activeGroupMessageId, setActiveGroupMessageId] = useState<number | null>(null)
  const [forwardingGroupMessageText, setForwardingGroupMessageText] = useState('')
  const [confirmingDeleteGroupMessageId, setConfirmingDeleteGroupMessageId] = useState<number | null>(null)
  const [groupMessageActionAnchor, setGroupMessageActionAnchor] = useState<ActionAnchor | null>(null)

  const resetSubscriptionPostActions = useCallback(() => {
    setActiveSubscriptionPostId(null)
    setConfirmingDeleteSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
    setSubscriptionPostActionAnchor(null)
  }, [])

  const closeSubscriptionPostActions = useCallback(() => {
    resetSubscriptionPostActions()
  }, [resetSubscriptionPostActions])

  const openSubscriptionPostActions = useCallback((postId: number, anchor: ActionAnchor | null) => {
    setActiveSubscriptionPostId(postId)
    setForwardingSubscriptionPostText('')
    setSubscriptionPostActionAnchor(anchor)
  }, [])

  const clearSubscriptionPostForwarding = useCallback(() => {
    setForwardingSubscriptionPostText('')
  }, [])

  const startSubscriptionPostForwarding = useCallback((text: string) => {
    setForwardingSubscriptionPostText(text)
  }, [])

  const requestSubscriptionPostDelete = useCallback((postId: number) => {
    setConfirmingDeleteSubscriptionPostId(postId)
    setActiveSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
    setSubscriptionPostActionAnchor(null)
  }, [])

  const clearSubscriptionPostDeleteConfirmation = useCallback(() => {
    setConfirmingDeleteSubscriptionPostId(null)
  }, [])

  const resetGroupMessageActions = useCallback(() => {
    setActiveGroupMessageId(null)
    setForwardingGroupMessageText('')
    setConfirmingDeleteGroupMessageId(null)
    setGroupMessageActionAnchor(null)
  }, [])

  const closeGroupMessageActions = useCallback(() => {
    resetGroupMessageActions()
  }, [resetGroupMessageActions])

  const openGroupMessageActions = useCallback((messageId: number, anchor: ActionAnchor | null) => {
    setActiveGroupMessageId(messageId)
    setForwardingGroupMessageText('')
    setGroupMessageActionAnchor(anchor)
  }, [])

  const clearGroupMessageForwarding = useCallback(() => {
    setForwardingGroupMessageText('')
  }, [])

  const startGroupMessageForwarding = useCallback((text: string) => {
    setForwardingGroupMessageText(text)
  }, [])

  const requestGroupMessageDelete = useCallback((messageId: number) => {
    setConfirmingDeleteGroupMessageId(messageId)
    setActiveGroupMessageId(null)
    setForwardingGroupMessageText('')
    setGroupMessageActionAnchor(null)
  }, [])

  const clearGroupMessageDeleteConfirmation = useCallback(() => {
    setConfirmingDeleteGroupMessageId(null)
  }, [])

  const resetRoomMessageActions = useCallback(() => {
    resetSubscriptionPostActions()
    resetGroupMessageActions()
  }, [resetGroupMessageActions, resetSubscriptionPostActions])

  return {
    activeGroupMessageId,
    activeSubscriptionPostId,
    clearSubscriptionPostDeleteConfirmation,
    clearGroupMessageDeleteConfirmation,
    clearGroupMessageForwarding,
    clearSubscriptionPostForwarding,
    closeGroupMessageActions,
    closeSubscriptionPostActions,
    confirmingDeleteSubscriptionPostId,
    confirmingDeleteGroupMessageId,
    forwardingGroupMessageText,
    forwardingSubscriptionPostText,
    groupMessageActionAnchor,
    openGroupMessageActions,
    openSubscriptionPostActions,
    requestSubscriptionPostDelete,
    requestGroupMessageDelete,
    resetGroupMessageActions,
    resetRoomMessageActions,
    resetSubscriptionPostActions,
    startGroupMessageForwarding,
    startSubscriptionPostForwarding,
    subscriptionPostActionAnchor,
  }
}
