import { useCallback, useState } from 'react'

export type BlacklistConfirmationTarget = {
  identifier: string
  nickname?: string
  roomKind: 'group' | 'channel'
  title: string
}

export type BlacklistHintTarget = 'group-message' | 'thread-comment'

export function useBlacklistFlow() {
  const [confirmingBlacklistTarget, setConfirmingBlacklistTarget] =
    useState<BlacklistConfirmationTarget | null>(null)
  const [blacklistHintTarget, setBlacklistHintTarget] = useState<BlacklistHintTarget | null>(null)

  const openBlacklistConfirmation = useCallback((target: BlacklistConfirmationTarget) => {
    setConfirmingBlacklistTarget(target)
    setBlacklistHintTarget(null)
  }, [])

  const closeBlacklistConfirmation = useCallback(() => {
    setConfirmingBlacklistTarget(null)
  }, [])

  const confirmBlacklistTarget = useCallback(() => {
    const currentTarget = confirmingBlacklistTarget
    setConfirmingBlacklistTarget(null)
    return currentTarget
  }, [confirmingBlacklistTarget])

  const showBlacklistHint = useCallback((target: BlacklistHintTarget) => {
    setBlacklistHintTarget(target)
  }, [])

  const clearBlacklistHint = useCallback(() => {
    setBlacklistHintTarget(null)
  }, [])

  const resetBlacklistFlow = useCallback(() => {
    setConfirmingBlacklistTarget(null)
    setBlacklistHintTarget(null)
  }, [])

  return {
    blacklistHintTarget,
    clearBlacklistHint,
    closeBlacklistConfirmation,
    confirmBlacklistTarget,
    confirmingBlacklistTarget,
    openBlacklistConfirmation,
    resetBlacklistFlow,
    showBlacklistHint,
  }
}
