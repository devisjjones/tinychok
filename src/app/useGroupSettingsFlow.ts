import { useCallback, useMemo, useState } from 'react'
import type { GroupPreview } from '../shared/types'
import type { UpdateGroupBody } from '../shared/backend'
import { sanitizeChannelTitle } from './utils'

export type GroupSettingsDraft = Pick<
  GroupPreview,
  'title' | 'commentsEnabledForAll' | 'commentsEnabledForPremium'
>

export type GroupSettingsLeaveAction = 'close' | 'management'

function buildGroupSettingsDraft(group: GroupPreview): GroupSettingsDraft {
  return {
    commentsEnabledForAll: Boolean(group.commentsEnabledForAll),
    commentsEnabledForPremium: Boolean(group.commentsEnabledForPremium),
    title: group.title,
  }
}

type UseGroupSettingsFlowOptions = {
  activeGroupId: number | null
  applyGroupSettingsPatch: (
    groupId: number,
    patch: UpdateGroupBody,
    options?: { strict?: boolean },
  ) => Promise<boolean>
  closeGroupActions: () => void
  groups: GroupPreview[]
  setGroupManagementOpen: (open: boolean) => void
  setGroupTransferOwnerOpen: (open: boolean) => void
}

export function useGroupSettingsFlow({
  activeGroupId,
  applyGroupSettingsPatch,
  closeGroupActions,
  groups,
  setGroupManagementOpen,
  setGroupTransferOwnerOpen,
}: UseGroupSettingsFlowOptions) {
  const activeGroup = useMemo(
    () => (activeGroupId === null ? null : groups.find((group) => group.id === activeGroupId) ?? null),
    [activeGroupId, groups],
  )
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false)
  const [groupSettingsDraft, setGroupSettingsDraft] = useState<GroupSettingsDraft | null>(null)
  const [groupSettingsBusy, setGroupSettingsBusy] = useState(false)
  const [groupSettingsError, setGroupSettingsError] = useState('')
  const [confirmGroupSettingsLeaveOpen, setConfirmGroupSettingsLeaveOpen] = useState(false)
  const [pendingGroupSettingsLeaveAction, setPendingGroupSettingsLeaveAction] =
    useState<GroupSettingsLeaveAction | null>(null)

  const resetGroupSettingsState = useCallback(() => {
    setGroupSettingsOpen(false)
    setGroupSettingsDraft(null)
    setGroupSettingsBusy(false)
    setGroupSettingsError('')
    setConfirmGroupSettingsLeaveOpen(false)
    setPendingGroupSettingsLeaveAction(null)
    setGroupManagementOpen(false)
    setGroupTransferOwnerOpen(false)
  }, [setGroupManagementOpen, setGroupTransferOwnerOpen])

  const groupSettingsDirty = useMemo(
    () =>
      activeGroup !== null &&
      groupSettingsDraft !== null &&
      (
        sanitizeChannelTitle(groupSettingsDraft.title) !== activeGroup.title ||
        Boolean(groupSettingsDraft.commentsEnabledForAll) !== Boolean(activeGroup.commentsEnabledForAll) ||
        Boolean(groupSettingsDraft.commentsEnabledForPremium) !== Boolean(activeGroup.commentsEnabledForPremium)
      ),
    [activeGroup, groupSettingsDraft],
  )

  const closeGroupSettingsDialog = useCallback(() => {
    resetGroupSettingsState()
  }, [resetGroupSettingsState])

  const openGroupSettingsDialog = useCallback(() => {
    if (!activeGroup) return

    setGroupSettingsDraft(buildGroupSettingsDraft(activeGroup))
    setGroupSettingsBusy(false)
    setGroupSettingsError('')
    setConfirmGroupSettingsLeaveOpen(false)
    setPendingGroupSettingsLeaveAction(null)
    setGroupSettingsOpen(true)
    setGroupManagementOpen(false)
    setGroupTransferOwnerOpen(false)
    closeGroupActions()
  }, [activeGroup, closeGroupActions, setGroupManagementOpen, setGroupTransferOwnerOpen])

  const updateGroupSettingsDraft = useCallback((patch: Partial<GroupSettingsDraft>) => {
    setGroupSettingsError('')
    setGroupSettingsDraft((currentDraft) => {
      if (!currentDraft) return currentDraft

      return {
        ...currentDraft,
        ...patch,
      }
    })
  }, [])

  const discardGroupSettingsDraft = useCallback(() => {
    if (!activeGroup) return

    setGroupSettingsDraft(buildGroupSettingsDraft(activeGroup))
    setGroupSettingsBusy(false)
    setGroupSettingsError('')
  }, [activeGroup])

  const leaveGroupSettings = useCallback((
    action: GroupSettingsLeaveAction,
    options?: { discardDraft?: boolean },
  ) => {
    if (options?.discardDraft) {
      discardGroupSettingsDraft()
    }

    setConfirmGroupSettingsLeaveOpen(false)
    setPendingGroupSettingsLeaveAction(null)

    if (action === 'management') {
      setGroupSettingsOpen(false)
      setGroupManagementOpen(true)
      setGroupTransferOwnerOpen(false)
      setGroupSettingsDraft(null)
      setGroupSettingsBusy(false)
      setGroupSettingsError('')
      return
    }

    closeGroupSettingsDialog()
  }, [
    closeGroupSettingsDialog,
    discardGroupSettingsDraft,
    setGroupManagementOpen,
    setGroupTransferOwnerOpen,
  ])

  const requestGroupSettingsLeave = useCallback((action: GroupSettingsLeaveAction) => {
    if (groupSettingsDirty) {
      setPendingGroupSettingsLeaveAction(action)
      setConfirmGroupSettingsLeaveOpen(true)
      return
    }

    leaveGroupSettings(action)
  }, [groupSettingsDirty, leaveGroupSettings])

  const saveGroupSettings = useCallback(async () => {
    if (!activeGroup || !groupSettingsDraft) return false
    if (!groupSettingsDirty) return true

    const nextTitle = sanitizeChannelTitle(groupSettingsDraft.title)
    if (!nextTitle) {
      setGroupSettingsError('Название группы не может быть пустым.')
      return false
    }

    setGroupSettingsBusy(true)
    setGroupSettingsError('')

    try {
      await applyGroupSettingsPatch(
        activeGroup.id,
        {
          commentsEnabledForAll: groupSettingsDraft.commentsEnabledForAll,
          commentsEnabledForPremium: groupSettingsDraft.commentsEnabledForPremium,
          title: nextTitle,
        },
        { strict: true },
      )

      setGroupSettingsBusy(false)
      return true
    } catch (error) {
      setGroupSettingsBusy(false)
      setGroupSettingsError(error instanceof Error ? error.message : 'Не удалось сохранить настройки группы.')
      return false
    }
  }, [activeGroup, applyGroupSettingsPatch, groupSettingsDraft, groupSettingsDirty])

  const dismissGroupSettingsLeaveConfirm = useCallback(() => {
    setConfirmGroupSettingsLeaveOpen(false)
    setPendingGroupSettingsLeaveAction(null)
  }, [])

  const confirmGroupSettingsLeaveWithSave = useCallback(async () => {
    const nextAction = pendingGroupSettingsLeaveAction
    const saved = await saveGroupSettings()

    if (saved && nextAction) {
      leaveGroupSettings(nextAction)
      return
    }

    dismissGroupSettingsLeaveConfirm()
  }, [
    dismissGroupSettingsLeaveConfirm,
    leaveGroupSettings,
    pendingGroupSettingsLeaveAction,
    saveGroupSettings,
  ])

  const confirmGroupSettingsLeaveWithDiscard = useCallback(() => {
    const nextAction = pendingGroupSettingsLeaveAction
    if (!nextAction) {
      setConfirmGroupSettingsLeaveOpen(false)
      return
    }

    leaveGroupSettings(nextAction, { discardDraft: true })
  }, [leaveGroupSettings, pendingGroupSettingsLeaveAction])

  return {
    closeGroupSettingsDialog,
    confirmGroupSettingsLeaveOpen,
    confirmGroupSettingsLeaveWithDiscard,
    confirmGroupSettingsLeaveWithSave,
    dismissGroupSettingsLeaveConfirm,
    groupSettingsBusy,
    groupSettingsDirty,
    groupSettingsDraft,
    groupSettingsError,
    groupSettingsOpen,
    openGroupSettingsDialog,
    requestGroupSettingsLeave,
    resetGroupSettingsState,
    saveGroupSettings,
    updateGroupSettingsDraft,
  }
}
