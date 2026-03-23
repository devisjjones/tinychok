import { useCallback, useState } from 'react'
import type { ActionAnchor, ReplyTarget, ThreadComment } from '../shared/types'
import { formatMessagePreview } from './utils'

export type ThreadTarget =
  | {
      kind: 'group'
      groupId: number
      messageId: number
    }
  | {
      kind: 'channel'
      channelId: number
      postId: number
    }

export function useThreadFlow() {
  const [threadTarget, setThreadTarget] = useState<ThreadTarget | null>(null)
  const [threadDraft, setThreadDraft] = useState('')
  const [threadReplyTarget, setThreadReplyTarget] = useState<ReplyTarget | null>(null)
  const [threadBusy, setThreadBusy] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [threadCommentActionId, setThreadCommentActionId] = useState<number | null>(null)
  const [threadCommentActionAnchor, setThreadCommentActionAnchor] = useState<ActionAnchor | null>(null)
  const [confirmingDeleteThreadCommentId, setConfirmingDeleteThreadCommentId] = useState<number | null>(null)
  const [forwardingThreadCommentText, setForwardingThreadCommentText] = useState('')

  const threadTargetKind = threadTarget?.kind ?? null

  const resetThreadComposer = useCallback(() => {
    setThreadDraft('')
    setThreadReplyTarget(null)
    setThreadBusy(false)
    setThreadError('')
  }, [])

  const resetThreadActionState = useCallback(() => {
    setThreadCommentActionId(null)
    setThreadCommentActionAnchor(null)
  }, [])

  const clearThreadDeleteConfirmation = useCallback(() => {
    setConfirmingDeleteThreadCommentId(null)
  }, [])

  const clearThreadForwarding = useCallback(() => {
    setForwardingThreadCommentText('')
  }, [])

  const resetThreadState = useCallback(() => {
    setThreadTarget(null)
    resetThreadComposer()
    resetThreadActionState()
    clearThreadDeleteConfirmation()
    clearThreadForwarding()
  }, [
    clearThreadDeleteConfirmation,
    clearThreadForwarding,
    resetThreadActionState,
    resetThreadComposer,
  ])

  const openThread = useCallback((target: ThreadTarget) => {
    setThreadTarget(target)
    resetThreadComposer()
    resetThreadActionState()
    clearThreadDeleteConfirmation()
    clearThreadForwarding()
  }, [
    clearThreadDeleteConfirmation,
    clearThreadForwarding,
    resetThreadActionState,
    resetThreadComposer,
  ])

  const closeThreadView = useCallback(() => {
    resetThreadState()
  }, [resetThreadState])

  const openThreadCommentActions = useCallback((commentId: number, anchor: ActionAnchor | null) => {
    setThreadCommentActionId(commentId)
    setThreadCommentActionAnchor(anchor)
  }, [])

  const closeThreadCommentActions = useCallback(() => {
    resetThreadActionState()
  }, [resetThreadActionState])

  const replyToThreadComment = useCallback((comment: ThreadComment) => {
    setThreadReplyTarget({
      id: comment.id,
      text: formatMessagePreview({ text: comment.text }),
      author: comment.author,
    })
    closeThreadCommentActions()
  }, [closeThreadCommentActions])

  const clearThreadReplyTarget = useCallback(() => {
    setThreadReplyTarget(null)
  }, [])

  const requestThreadCommentDelete = useCallback((commentId: number) => {
    setConfirmingDeleteThreadCommentId(commentId)
    closeThreadCommentActions()
  }, [closeThreadCommentActions])

  return {
    clearThreadDeleteConfirmation,
    clearThreadForwarding,
    clearThreadReplyTarget,
    closeThreadCommentActions,
    closeThreadView,
    confirmingDeleteThreadCommentId,
    forwardingThreadCommentText,
    openThread,
    openThreadCommentActions,
    replyToThreadComment,
    requestThreadCommentDelete,
    resetThreadComposer,
    resetThreadState,
    setForwardingThreadCommentText,
    setThreadBusy,
    setThreadDraft,
    setThreadError,
    threadBusy,
    threadCommentActionAnchor,
    threadCommentActionId,
    threadDraft,
    threadError,
    threadReplyTarget,
    threadTarget,
    threadTargetKind,
  }
}
