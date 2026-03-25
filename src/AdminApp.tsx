import { useEffect, useEffectEvent, useState } from 'react'
import './admin.css'
import {
  ApiError,
  addAdminReportNote,
  applyAdminReportAction,
  blockAdminUser,
  downloadAdminAuditCsv,
  downloadAdminMedia,
  exportAdminChannelCsv,
  exportAdminDialogCsv,
  exportAdminGroupCsv,
  exportAdminThreadCsv,
  fetchAdminChannels,
  fetchAdminDialogs,
  fetchAdminBootstrap,
  fetchAdminDashboard,
  fetchAdminGroups,
  fetchAdminMedia,
  fetchAdminReport,
  fetchAdminReports,
  fetchAdminThreads,
  fetchAdminUser,
  fetchAdminUserAvatar,
  fetchClientRuntimeConfig,
  fetchFilteredAdminAuditLog,
  moderateAdminMedia,
  requestAuthCode,
  searchAdminUsers,
  setAdminUserPremium,
  unblockAdminUser,
  verifyAuthCode,
} from './app/backend'
import { isAllowedAdminHost } from './app/runtimeMode'
import type {
  AdminAuditActor,
  AdminAuditLogEntry,
  AdminBootstrapResponse,
  AdminDashboardResponse,
  AdminDialogSummary,
  AdminManagedChannelSummary,
  AdminManagedGroupSummary,
  AdminMediaItem,
  AdminReportAction,
  AdminReportSummary,
  AdminThreadSummary,
  AdminUserSummary,
  ClientRuntimeConfigResponse,
} from './shared/backend'

type AdminSection =
  | 'dashboard'
  | 'users'
  | 'reports'
  | 'channels'
  | 'groups'
  | 'threads'
  | 'dialogs'
  | 'media'
  | 'audit'
type AdminAuthStep = 'phone' | 'code'
type AdminUserListFilter = 'all' | 'blocked'
type AdminAuditPeriod = '24h' | '7d' | '30d' | '90d' | 'all'

const adminSessionStorageKey = 'tinychok.admin.session'

function loadAdminSessionToken() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.localStorage.getItem(adminSessionStorageKey) ?? ''
}

function saveAdminSessionToken(token: string) {
  if (typeof window === 'undefined') {
    return
  }

  if (token) {
    window.localStorage.setItem(adminSessionStorageKey, token)
    return
  }

  window.localStorage.removeItem(adminSessionStorageKey)
}

function formatDateTime(value?: string) {
  if (!value) return 'Нет данных'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatBytes(value: number) {
  if (value <= 0) {
    return '0 Б'
  }

  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  let size = value
  let index = 0

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }

  return `${size >= 100 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message
  }

  return 'Не удалось выполнить admin-запрос.'
}

function getActionReason(promptText: string, fallback: string) {
  const reason = window.prompt(promptText, fallback)
  if (reason === null) {
    return null
  }

  return reason.trim() || fallback
}

function getInitials(label: string) {
  return label
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function buildAuditWindow(period: AdminAuditPeriod) {
  if (period === 'all') {
    return {}
  }

  const hours =
    period === '24h' ? 24 : period === '7d' ? 24 * 7 : period === '30d' ? 24 * 30 : 24 * 90

  return {
    from: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
  }
}

function downloadCsvFile(fileName: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export default function AdminApp() {
  const [section, setSection] = useState<AdminSection>('dashboard')
  const [runtimeConfig, setRuntimeConfig] = useState<ClientRuntimeConfigResponse | null>(null)
  const [bootstrap, setBootstrap] = useState<AdminBootstrapResponse | null>(null)
  const [sessionToken, setSessionToken] = useState(() => loadAdminSessionToken())
  const [appLoading, setAppLoading] = useState(true)
  const [appError, setAppError] = useState('')

  const [authStep, setAuthStep] = useState<AdminAuthStep>('phone')
  const [identifier, setIdentifier] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authHint, setAuthHint] = useState('')

  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null)
  const [users, setUsers] = useState<AdminUserSummary[]>([])
  const [userQuery, setUserQuery] = useState('')
  const [userListFilter, setUserListFilter] = useState<AdminUserListFilter>('all')
  const [selectedUserIdentifier, setSelectedUserIdentifier] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null)
  const [selectedUserAvatarUrl, setSelectedUserAvatarUrl] = useState<string | null>(null)
  const [selectedUserAvatarState, setSelectedUserAvatarState] = useState<'idle' | 'loading' | 'ready' | 'none'>('idle')

  const [reports, setReports] = useState<AdminReportSummary[]>([])
  const [reportStatus, setReportStatus] = useState<'open' | 'closed' | 'all'>('open')
  const [selectedReportId, setSelectedReportId] = useState('')
  const [selectedReport, setSelectedReport] = useState<Awaited<ReturnType<typeof fetchAdminReport>>['report'] | null>(null)

  const [mediaQuery, setMediaQuery] = useState('')
  const [mediaItems, setMediaItems] = useState<AdminMediaItem[]>([])
  const [channelQuery, setChannelQuery] = useState('')
  const [channels, setChannels] = useState<AdminManagedChannelSummary[]>([])
  const [selectedChannelHandle, setSelectedChannelHandle] = useState('')
  const [groupQuery, setGroupQuery] = useState('')
  const [groups, setGroups] = useState<AdminManagedGroupSummary[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [threadQuery, setThreadQuery] = useState('')
  const [threads, setThreads] = useState<AdminThreadSummary[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState('')
  const [dialogOwnerQuery, setDialogOwnerQuery] = useState('')
  const [dialogOwnerMatches, setDialogOwnerMatches] = useState<AdminUserSummary[]>([])
  const [selectedDialogOwner, setSelectedDialogOwner] = useState<AdminUserSummary | null>(null)
  const [dialogPeerQuery, setDialogPeerQuery] = useState('')
  const [dialogs, setDialogs] = useState<AdminDialogSummary[]>([])
  const [dialogDetail, setDialogDetail] = useState<AdminDialogSummary | null>(null)
  const [auditActors, setAuditActors] = useState<AdminAuditActor[]>([])
  const [auditActorIdentifier, setAuditActorIdentifier] = useState('')
  const [auditPeriod, setAuditPeriod] = useState<AdminAuditPeriod>('30d')
  const [auditEntries, setAuditEntries] = useState<AdminAuditLogEntry[]>([])
  const [userLogPeriod, setUserLogPeriod] = useState<AdminAuditPeriod>('30d')

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'ADMIN'

    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrapRuntime() {
      setAppLoading(true)
      try {
        const config = await fetchClientRuntimeConfig()
        if (cancelled) return

        setRuntimeConfig(config)

        if (sessionToken) {
          const nextBootstrap = await fetchAdminBootstrap(sessionToken)
          if (cancelled) return
          setBootstrap(nextBootstrap)
          setAppError('')
        }
      } catch (error) {
        if (cancelled) return

        setBootstrap(null)
        if (sessionToken) {
          saveAdminSessionToken('')
          setSessionToken('')
        }
        setAppError(getErrorMessage(error))
      } finally {
        if (!cancelled) {
          setAppLoading(false)
        }
      }
    }

    void bootstrapRuntime()

    return () => {
      cancelled = true
    }
  }, [sessionToken])

  useEffect(() => {
    setSelectedUserAvatarUrl(null)
    setSelectedUserAvatarState('idle')
  }, [selectedUserIdentifier])

  async function refreshDashboard() {
    if (!sessionToken) return
    setDashboard(await fetchAdminDashboard(sessionToken))
  }

  async function refreshUsers(query = userQuery) {
    if (!sessionToken) return

    const response = await searchAdminUsers(sessionToken, query)
    setUsers(response.users)
  }

  async function refreshSelectedUser(identifierToLoad = selectedUserIdentifier) {
    if (!sessionToken || !identifierToLoad) return

    const response = await fetchAdminUser(sessionToken, identifierToLoad)
    setSelectedUserIdentifier(response.user.identifier)
    setSelectedUser(response.user)
  }

  async function refreshReports(statusFilter = reportStatus) {
    if (!sessionToken) return

    const response = await fetchAdminReports(
      sessionToken,
      statusFilter === 'all' ? undefined : statusFilter,
    )
    setReports(response.reports)
    if (selectedReportId && !response.reports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId('')
      setSelectedReport(null)
    }
  }

  async function refreshSelectedReport(reportId = selectedReportId) {
    if (!sessionToken || !reportId) return

    const response = await fetchAdminReport(sessionToken, reportId)
    setSelectedReportId(reportId)
    setSelectedReport(response.report)
  }

  async function refreshMedia(query = mediaQuery) {
    if (!sessionToken) return

    const response = await fetchAdminMedia(sessionToken, query)
    setMediaItems(response.items)
  }

  async function refreshChannels(query = channelQuery) {
    if (!sessionToken) return

    const response = await fetchAdminChannels(sessionToken, query)
    setChannels(response.channels)
    if (selectedChannelHandle && !response.channels.some((channel) => channel.handle === selectedChannelHandle)) {
      setSelectedChannelHandle('')
    }
  }

  async function refreshGroups(query = groupQuery) {
    if (!sessionToken) return

    const response = await fetchAdminGroups(sessionToken, query)
    setGroups(response.groups)
    if (selectedGroupId && !response.groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId('')
    }
  }

  async function refreshThreads(query = threadQuery) {
    if (!sessionToken) return

    const response = await fetchAdminThreads(sessionToken, query)
    setThreads(response.threads)
    if (selectedThreadId && !response.threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId('')
    }
  }

  async function refreshDialogOwnerMatches(query = dialogOwnerQuery) {
    if (!sessionToken) return

    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      setDialogOwnerMatches([])
      return
    }

    const response = await searchAdminUsers(sessionToken, trimmedQuery)
    setDialogOwnerMatches(response.users)
  }

  async function refreshDialogs(
    ownerIdentifier = selectedDialogOwner?.identifier ?? '',
    query = dialogPeerQuery,
  ) {
    if (!sessionToken || !ownerIdentifier) {
      setDialogs([])
      return
    }

    const response = await fetchAdminDialogs(sessionToken, ownerIdentifier, query)
    setDialogs(response.dialogs)

    if (dialogDetail) {
      const nextSelectedDialog =
        response.dialogs.find((dialog) => dialog.sharedKey === dialogDetail.sharedKey) ?? null
      setDialogDetail(nextSelectedDialog)
    }
  }

  async function refreshAuditLog() {
    if (!sessionToken) return

    const response = await fetchFilteredAdminAuditLog(sessionToken, {
      actorIdentifier: auditActorIdentifier || undefined,
      ...buildAuditWindow(auditPeriod),
    })
    setAuditActors(response.actors)
    setAuditEntries(response.entries)
  }

  const hydrateAdminData = useEffectEvent(async () => {
    await refreshDashboard()
    await refreshUsers(userQuery)
    await refreshReports(reportStatus)
    await refreshChannels(channelQuery)
    await refreshGroups(groupQuery)
    await refreshThreads(threadQuery)
    await refreshMedia(mediaQuery)
    await refreshAuditLog()
  })

  const syncUserSearch = useEffectEvent(async () => {
    await refreshUsers(userQuery)
  })

  const syncReportFilter = useEffectEvent(async () => {
    await refreshReports(reportStatus)
  })

  const syncMediaSearch = useEffectEvent(async () => {
    await refreshMedia(mediaQuery)
  })

  const syncChannelSearch = useEffectEvent(async () => {
    await refreshChannels(channelQuery)
  })

  const syncGroupSearch = useEffectEvent(async () => {
    await refreshGroups(groupQuery)
  })

  const syncThreadSearch = useEffectEvent(async () => {
    await refreshThreads(threadQuery)
  })

  const syncDialogOwnerSearch = useEffectEvent(async () => {
    await refreshDialogOwnerMatches(dialogOwnerQuery)
  })

  const syncDialogSearch = useEffectEvent(async () => {
    await refreshDialogs(selectedDialogOwner?.identifier ?? '', dialogPeerQuery)
  })

  const syncAuditFilters = useEffectEvent(async () => {
    await refreshAuditLog()
  })

  useEffect(() => {
    if (!sessionToken || !bootstrap) {
      return
    }

    void hydrateAdminData()
  }, [sessionToken, bootstrap])

  useEffect(() => {
    if (!sessionToken || !bootstrap) {
      return
    }

    void syncUserSearch()
  }, [sessionToken, bootstrap, userQuery])

  useEffect(() => {
    if (!sessionToken || !bootstrap) {
      return
    }

    void syncReportFilter()
  }, [sessionToken, bootstrap, reportStatus])

  useEffect(() => {
    if (!sessionToken || !bootstrap) {
      return
    }

    void syncMediaSearch()
  }, [sessionToken, bootstrap, mediaQuery])

  useEffect(() => {
    if (!sessionToken || !bootstrap) {
      return
    }

    void syncChannelSearch()
  }, [sessionToken, bootstrap, channelQuery])

  useEffect(() => {
    if (!sessionToken || !bootstrap) {
      return
    }

    void syncGroupSearch()
  }, [sessionToken, bootstrap, groupQuery])

  useEffect(() => {
    if (!sessionToken || !bootstrap) {
      return
    }

    void syncThreadSearch()
  }, [sessionToken, bootstrap, threadQuery])

  useEffect(() => {
    if (!sessionToken || !bootstrap || selectedDialogOwner) {
      return
    }

    void syncDialogOwnerSearch()
  }, [sessionToken, bootstrap, selectedDialogOwner, dialogOwnerQuery])

  useEffect(() => {
    if (!sessionToken || !bootstrap || !selectedDialogOwner) {
      return
    }

    void syncDialogSearch()
  }, [sessionToken, bootstrap, selectedDialogOwner, dialogPeerQuery])

  useEffect(() => {
    if (!sessionToken || !bootstrap) {
      return
    }

    void syncAuditFilters()
  }, [sessionToken, bootstrap, auditActorIdentifier, auditPeriod])

  async function handleRequestCode() {
    setAuthBusy(true)
    setAuthError('')

    try {
      const response = await requestAuthCode({ identifier })
      setAuthHint(
        response.existingAccount
          ? `Код отправлен staff-аккаунту ${response.existingAccount.displayName}.`
          : 'Код отправлен. В admin panel войти смогут только уже существующие staff-аккаунты.',
      )
      setAuthStep('code')
    } catch (error) {
      setAuthError(getErrorMessage(error))
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleVerifyCode() {
    setAuthBusy(true)
    setAuthError('')

    try {
      const response = await verifyAuthCode({
        code: smsCode,
        identifier,
      })

      if (response.status !== 'authenticated') {
        setAuthError('Для входа в admin panel нужен уже существующий staff-аккаунт.')
        return
      }

      const token = response.snapshot.session.sessionToken
      if (!token) {
        throw new Error('Не удалось получить staff-сессию.')
      }

      const nextBootstrap = await fetchAdminBootstrap(token)
      saveAdminSessionToken(token)
      setSessionToken(token)
      setBootstrap(nextBootstrap)
      setAuthError('')
      setAppError('')
      setIdentifier('')
      setSmsCode('')
    } catch (error) {
      setAuthError(getErrorMessage(error))
    } finally {
      setAuthBusy(false)
    }
  }

  function handleLogout() {
    saveAdminSessionToken('')
    setSessionToken('')
    setBootstrap(null)
    setSelectedUser(null)
    setSelectedUserIdentifier('')
    setSelectedReport(null)
    setSelectedReportId('')
  }

  async function handleToggleBlock(user: AdminUserSummary) {
    if (!sessionToken) return

    try {
      if (user.blocked) {
        const reason = getActionReason('Причина разблокировки', 'Проверка staff-командой')
        if (!reason) return
        if (!window.confirm(`Снять блокировку с ${user.identifier}?`)) {
          return
        }

        const response = await unblockAdminUser(sessionToken, user.identifier, { reason })
        setSelectedUser(response.user)
        await refreshSelectedUser(response.user.identifier)
      } else {
        const reason = getActionReason('Причина блокировки', 'Нарушение правил сервиса')
        if (!reason) return
        if (!window.confirm(`Заблокировать ${user.identifier}?`)) {
          return
        }

        const response = await blockAdminUser(sessionToken, user.identifier, { reason })
        setSelectedUser(response.user)
        await refreshSelectedUser(response.user.identifier)
      }

      await refreshUsers()
      await refreshDashboard()
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleTogglePremium(user: AdminUserSummary) {
    if (!sessionToken) return

    try {
      const enabled = !user.premium
      const reason = getActionReason(
        enabled ? 'Причина выдачи premium' : 'Причина снятия premium',
        enabled ? 'Ручная staff-выдача' : 'Ручное staff-отключение',
      )
      if (!reason) return

      let durationDays: number | undefined
      if (enabled) {
        const rawDuration = window.prompt('Срок premium в днях', '30')
        if (rawDuration === null) {
          return
        }

        const parsed = Number(rawDuration)
        durationDays = Number.isInteger(parsed) && parsed > 0 ? parsed : 30
      }

      if (!window.confirm(`${enabled ? 'Выдать' : 'Снять'} premium для ${user.identifier}?`)) {
        return
      }

      const response = await setAdminUserPremium(sessionToken, user.identifier, {
        durationDays,
        enabled,
        reason,
      })
      setSelectedUser(response.user)
      await refreshSelectedUser(response.user.identifier)
      await refreshUsers()
      await refreshDashboard()
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleRevealAvatar(user: AdminUserSummary) {
    if (!sessionToken) return

    if (selectedUserAvatarState === 'ready') {
      setSelectedUserAvatarUrl(null)
      setSelectedUserAvatarState('idle')
      return
    }

    const reason = getActionReason('Причина просмотра аватарки', 'Проверка профиля')
    if (!reason) return

    setSelectedUserAvatarState('loading')

    try {
      const response = await fetchAdminUserAvatar(sessionToken, user.identifier, { reason })
      setSelectedUserAvatarUrl(response.avatarUrl)
      setSelectedUserAvatarState(response.avatarUrl ? 'ready' : 'none')
      await refreshAuditLog()
    } catch (error) {
      setSelectedUserAvatarState('idle')
      setAppError(getErrorMessage(error))
    }
  }

  async function handleAddReportNote(reportId: string) {
    if (!sessionToken) return

    const text = window.prompt('Внутренняя заметка')
    if (text === null) return

    try {
      const response = await addAdminReportNote(sessionToken, reportId, { text })
      setSelectedReport(response.report)
      await refreshReports()
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleApplyReportAction(action: AdminReportAction) {
    if (!sessionToken || !selectedReport) return

    const reason = getActionReason('Причина admin-действия', 'Решение staff-команды')
    if (!reason) return

    if (!window.confirm(`Подтвердить действие ${action} для жалобы ${selectedReport.id}?`)) {
      return
    }

    try {
      const response = await applyAdminReportAction(sessionToken, selectedReport.id, {
        action,
        reason,
      })
      await refreshReports()
      if (reportStatus === 'all' || response.report.status === reportStatus) {
        setSelectedReport(response.report)
        setSelectedReportId(response.report.id)
      } else {
        setSelectedReport(null)
        setSelectedReportId('')
      }
      await refreshDashboard()
      await refreshUsers()
      await refreshMedia()
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleModerateMedia(item: AdminMediaItem, action: 'hide' | 'delete') {
    if (!sessionToken) return

    const reason = getActionReason(
      action === 'hide' ? 'Причина скрытия media' : 'Причина удаления media',
      action === 'hide' ? 'Скрыто staff-командой' : 'Удалено staff-командой',
    )
    if (!reason) return

    if (!window.confirm(`${action === 'hide' ? 'Скрыть' : 'Удалить'} ${item.mediaUrl}?`)) {
      return
    }

    try {
      await moderateAdminMedia(sessionToken, {
        action,
        mediaUrl: item.mediaUrl,
        reason,
      })
      await refreshMedia()
      await refreshDashboard()
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleDownloadMedia(item: AdminMediaItem) {
    if (!sessionToken) return

    try {
      const reason = getActionReason('Причина скачивания media', 'Проверка жалобы или moderation')
      if (!reason) return
      const response = await downloadAdminMedia(sessionToken, { mediaUrl: item.mediaUrl, reason })
      const link = document.createElement('a')
      link.href = response.downloadUrl
      link.download = response.fileName
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleDownloadAuditCsv() {
    if (!sessionToken) return

    try {
      const reason = getActionReason('Причина выгрузки audit CSV', 'Внутренняя проверка staff-активности')
      if (!reason) return
      const response = await downloadAdminAuditCsv(sessionToken, {
        actorIdentifier: auditActorIdentifier || undefined,
        ...buildAuditWindow(auditPeriod),
        reason,
      })
      downloadCsvFile(response.fileName, response.csv)
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleDownloadUserAuditCsv(user: AdminUserSummary) {
    if (!sessionToken || !bootstrap) return

    const confirmation = window.prompt(
      'Для подтверждения экспорта введите номер текущего staff-аккаунта',
      bootstrap.actor.identifier,
    )
    if (confirmation === null) {
      return
    }
    if (confirmation.trim() !== bootstrap.actor.identifier) {
      setAppError('Подтверждение экспорта не прошло.')
      return
    }

    try {
      const reason = getActionReason('Причина выгрузки audit CSV по пользователю', 'Проверка staff-действий по пользователю')
      if (!reason) return
      const response = await downloadAdminAuditCsv(sessionToken, {
        targetIdentifier: user.identifier,
        ...buildAuditWindow(userLogPeriod),
        reason,
      })
      downloadCsvFile(response.fileName, response.csv)
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleDownloadChannelCsv(channel: AdminManagedChannelSummary) {
    if (!sessionToken) return
    const reason = getActionReason('Причина выгрузки CSV канала', 'Проверка канала')
    if (!reason) return

    try {
      const response = await exportAdminChannelCsv(sessionToken, channel.handle, { reason })
      downloadCsvFile(response.fileName, response.csv)
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleDownloadGroupCsv(group: AdminManagedGroupSummary) {
    if (!sessionToken) return
    const reason = getActionReason('Причина выгрузки CSV группы', 'Проверка группы')
    if (!reason) return

    try {
      const response = await exportAdminGroupCsv(sessionToken, group.id, { reason })
      downloadCsvFile(response.fileName, response.csv)
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleDownloadThreadCsv(thread: AdminThreadSummary) {
    if (!sessionToken) return
    const reason = getActionReason('Причина выгрузки CSV треда', 'Проверка треда')
    if (!reason) return

    try {
      const response = await exportAdminThreadCsv(sessionToken, thread.id, { reason })
      downloadCsvFile(response.fileName, response.csv)
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleDownloadDialogCsv(dialog: AdminDialogSummary) {
    if (!sessionToken) return
    const reason = getActionReason('Причина выгрузки CSV диалога', 'Проверка диалога')
    if (!reason) return

    try {
      const response = await exportAdminDialogCsv(sessionToken, dialog.sharedKey, { reason })
      downloadCsvFile(response.fileName, response.csv)
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function openUserFromAdmin(identifierToOpen: string) {
    if (!sessionToken) return

    try {
      setSection('users')
      setUserListFilter('all')
      setUserQuery(identifierToOpen)
      setSelectedUserIdentifier(identifierToOpen)
      await refreshUsers(identifierToOpen)
      await refreshSelectedUser(identifierToOpen)
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  function handleSelectDialogOwner(user: AdminUserSummary) {
    setSelectedDialogOwner(user)
    setDialogOwnerQuery('')
    setDialogOwnerMatches([])
    setDialogPeerQuery('')
    setDialogs([])
    setDialogDetail(null)
  }

  function handleClearDialogOwner() {
    setSelectedDialogOwner(null)
    setDialogOwnerQuery('')
    setDialogOwnerMatches([])
    setDialogPeerQuery('')
    setDialogs([])
    setDialogDetail(null)
  }

  function handleSelectDialog(dialog: AdminDialogSummary) {
    setDialogDetail(dialog)
    setDialogPeerQuery('')
  }

  function handleClearDialogPeer() {
    setDialogDetail(null)
    setDialogPeerQuery('')
  }

  const blockedUsersCount = users.filter((user) => user.blocked).length
  const visibleUsers =
    userListFilter === 'blocked' ? users.filter((user) => user.blocked) : users
  const selectedChannel = channels.find((channel) => channel.handle === selectedChannelHandle) ?? null
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null

  if (appLoading) {
    return <main className="admin-shell admin-loading">Подготавливаем admin panel...</main>
  }

  if (!runtimeConfig) {
    return <main className="admin-shell admin-loading">Не удалось получить runtime config.</main>
  }

  if (!runtimeConfig.admin.enabled) {
    return (
      <main className="admin-shell admin-guard-screen">
        <div className="admin-guard-card">
          <strong>Admin panel выключена</strong>
          <p>В этой среде `ADMIN_PANEL_ENABLED=false`, поэтому internal admin UI недоступен.</p>
        </div>
      </main>
    )
  }

  if (!isAllowedAdminHost(runtimeConfig.admin.hosts)) {
    return (
      <main className="admin-shell admin-guard-screen">
        <div className="admin-guard-card">
          <strong>Неподходящий host</strong>
          <p>Admin UI разрешён только на `admin.staging.tinychok.ru`, `admin.tinychok.ru` и local dev host.</p>
        </div>
      </main>
    )
  }

  if (!bootstrap) {
    return (
      <main className="admin-shell admin-auth-shell">
        <section className="admin-auth-copy">
          <span className="admin-badge">{runtimeConfig.admin.bannerLabel}</span>
          <h1>Tinychok Admin</h1>
          <p>
            Internal staff console для moderation, premium support, media review и audit log.
            Вход разрешён только для staff-аккаунтов с ролью `owner`, `moderator` или `support`.
          </p>
          {appError ? <p className="admin-auth-error">{appError}</p> : null}
        </section>

        <section className="admin-auth-card">
          <h2>{authStep === 'phone' ? 'Staff Login' : 'Подтверждение кода'}</h2>

          {authStep === 'phone' ? (
            <label className="admin-field">
              <span>Телефон staff-аккаунта</span>
              <input
                type="tel"
                placeholder="+79990000000"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </label>
          ) : (
            <>
              <p className="admin-auth-note">{authHint || `Код отправлен на ${identifier}`}</p>
              <label className="admin-field">
                <span>Код из SMS</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="1111"
                  value={smsCode}
                  onChange={(event) => setSmsCode(event.target.value)}
                />
              </label>
            </>
          )}

          {authError ? <p className="admin-auth-error">{authError}</p> : null}

          <div className="admin-auth-actions">
            {authStep === 'code' ? (
              <button type="button" className="admin-secondary-button" onClick={() => setAuthStep('phone')}>
                Назад
              </button>
            ) : null}

            <button
              type="button"
              className="admin-primary-button"
              disabled={authBusy}
              onClick={() => {
                void (authStep === 'phone' ? handleRequestCode() : handleVerifyCode())
              }}
            >
              {authBusy ? 'Подождите...' : authStep === 'phone' ? 'Получить код' : 'Войти в admin'}
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-badge">{bootstrap.config.bannerLabel}</span>
          <strong>Tinychok Admin</strong>
        </div>

        <nav className="admin-nav">
          {([
            ['dashboard', 'Dashboard'],
            ['users', 'Users'],
            ['reports', 'Reports'],
            ['channels', 'Channels'],
            ['groups', 'Groups'],
            ['threads', 'Threads'],
            ['dialogs', 'Dialogs'],
            ['media', 'Media'],
            ['audit', 'Audit Log'],
          ] as Array<[AdminSection, string]>).map(([item, label]) => (
            <button
              key={item}
              type="button"
              className={section === item ? 'admin-nav-item active' : 'admin-nav-item'}
              onClick={() => setSection(item)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-actor-card">
            <span className="admin-actor-avatar">{getInitials(bootstrap.actor.displayName)}</span>
            <div className="admin-actor-meta">
              <strong>{bootstrap.actor.displayName}</strong>
              <span className="admin-actor-identifier">{bootstrap.actor.identifier}</span>
              <span className="admin-role-badge">{bootstrap.actor.role}</span>
            </div>
          </div>

          <button type="button" className="admin-secondary-button" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <section className="admin-content">
        <div className="admin-environment-strip">
          <span className="admin-badge">{bootstrap.config.bannerLabel}</span>
          <span className="admin-environment-copy">Internal staff-only environment</span>
          {appError ? <p className="admin-inline-error">{appError}</p> : null}
        </div>

        {section === 'dashboard' ? (
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>Dashboard</h2>
              <button type="button" className="admin-secondary-button" onClick={() => void refreshDashboard()}>
                Обновить
              </button>
            </div>

            <div className="admin-metric-grid">
              <article className="admin-metric-card">
                <span>Пользователи</span>
                <strong>{dashboard?.metrics.totalUsers ?? '...'}</strong>
              </article>
              <article className="admin-metric-card">
                <span>Premium</span>
                <strong>{dashboard?.metrics.premiumUsers ?? '...'}</strong>
              </article>
              <article className="admin-metric-card">
                <span>Жалобы</span>
                <strong>{dashboard?.metrics.openReports ?? '...'}</strong>
              </article>
              <article className="admin-metric-card">
                <span>Media items</span>
                <strong>{dashboard?.metrics.totalMediaItems ?? '...'}</strong>
              </article>
              <article className="admin-metric-card admin-metric-card-wide">
                <span>Общий storage usage</span>
                <strong>{dashboard ? formatBytes(dashboard.metrics.usedStorageBytes) : '...'}</strong>
              </article>
            </div>
          </section>
        ) : null}

        {section === 'users' ? (
          <section className="admin-two-column admin-section-split">
            <div className="admin-panel admin-list-panel">
              <div className="admin-panel-heading">
                <h2>Users</h2>
              </div>
              <div className="admin-filter-tabs" role="tablist" aria-label="Фильтр пользователей">
                <button
                  type="button"
                  className={userListFilter === 'all' ? 'admin-filter-tab active' : 'admin-filter-tab'}
                  onClick={() => setUserListFilter('all')}
                >
                  {`Все (${users.length})`}
                </button>
                <button
                  type="button"
                  className={userListFilter === 'blocked' ? 'admin-filter-tab active blocked' : 'admin-filter-tab blocked'}
                  onClick={() => setUserListFilter('blocked')}
                >
                  {`Заблокированные (${blockedUsersCount})`}
                </button>
              </div>
              <input
                className="admin-search-input"
                type="search"
                placeholder="Поиск по id, username, телефону"
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
              />

              <div className="admin-list">
                {visibleUsers.map((user) => (
                  <button
                    key={user.identifier}
                    type="button"
                    className={
                      selectedUserIdentifier === user.identifier
                        ? `admin-list-item active${user.blocked ? ' blocked' : ''}`
                        : `admin-list-item${user.blocked ? ' blocked' : ''}`
                    }
                    onClick={() => {
                      setSelectedUserIdentifier(user.identifier)
                      void refreshSelectedUser(user.identifier)
                    }}
                  >
                    <div className="admin-user-name-row">
                      <strong className={user.blocked ? 'admin-user-name-flag blocked' : undefined}>
                        {user.displayName}
                      </strong>
                    </div>
                    <span>{user.nickname ? `@${user.nickname}` : 'Нет username'}</span>
                    <span className={user.blocked ? 'admin-user-status blocked' : 'admin-user-status'}>
                      {user.status || (user.blocked ? 'Заблокирован' : user.staffRole ?? 'user')}
                    </span>
                    <span>{user.identifier}</span>
                  </button>
                ))}
                {visibleUsers.length === 0 ? (
                  <div className="admin-empty-state admin-empty-state-inline">
                    {userListFilter === 'blocked'
                      ? 'Заблокированных пользователей по текущему поиску нет.'
                      : 'Пользователи по текущему поиску не найдены.'}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="admin-panel admin-detail-panel">
              {selectedUser ? (
                <>
                  <div className="admin-panel-heading">
                    <div className="admin-user-identity">
                      <h2>{selectedUser.displayName}</h2>
                      <div className="admin-user-identity-meta">
                        <span>{selectedUser.nickname ? `@${selectedUser.nickname}` : 'Нет username'}</span>
                        <span>{selectedUser.status || 'Нет статуса'}</span>
                      </div>
                    </div>
                  </div>

                  {selectedUserAvatarState !== 'idle' ? (
                    <div className="admin-avatar-preview-card">
                      <strong>Аватарка</strong>
                      {selectedUserAvatarState === 'loading' ? (
                        <span>Загружаем...</span>
                      ) : selectedUserAvatarUrl ? (
                        <img
                          src={selectedUserAvatarUrl}
                          alt={`Аватарка ${selectedUser.displayName}`}
                          className="admin-avatar-preview-image"
                        />
                      ) : (
                        <span>нет</span>
                      )}
                    </div>
                  ) : null}

                  <dl className="admin-detail-grid">
                    <div>
                      <dt>ID</dt>
                      <dd>{selectedUser.identifier}</dd>
                    </div>
                    <div>
                      <dt>Username</dt>
                      <dd>{selectedUser.nickname || 'Нет username'}</dd>
                    </div>
                    <div>
                      <dt>Premium</dt>
                      <dd>{selectedUser.premium ? `Да, до ${formatDateTime(selectedUser.premiumExpiresAt)}` : 'Нет'}</dd>
                    </div>
                    <div>
                      <dt>Role</dt>
                      <dd>{selectedUser.staffRole ?? 'user'}</dd>
                    </div>
                    <div>
                      <dt>Зарегистрирован</dt>
                      <dd>{formatDateTime(selectedUser.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Последняя активность</dt>
                      <dd>{formatDateTime(selectedUser.lastActiveAt)}</dd>
                    </div>
                    <div>
                      <dt>Storage usage</dt>
                      <dd>
                        {formatBytes(selectedUser.storageUsage.usedBytes)} /{' '}
                        {formatBytes(selectedUser.storageUsage.quotaBytes)}
                      </dd>
                    </div>
                    <div>
                      <dt>Blocked</dt>
                      <dd>{selectedUser.blocked ? `Да · ${selectedUser.blockedAt ? formatDateTime(selectedUser.blockedAt) : 'без даты'}` : 'Нет'}</dd>
                    </div>
                    <div>
                      <dt>Причина блокировки</dt>
                      <dd>{selectedUser.blockedReason || 'Нет'}</dd>
                    </div>
                  </dl>

                  <div className="admin-actions-panel">
                    <div className="admin-inline-controls">
                      <label className="admin-inline-field">
                        <span>Логи пользователя</span>
                        <select
                          className="admin-select"
                          value={userLogPeriod}
                          onChange={(event) => setUserLogPeriod(event.target.value as AdminAuditPeriod)}
                        >
                          <option value="7d">7 дней</option>
                          <option value="30d">30 дней</option>
                          <option value="90d">90 дней</option>
                          <option value="all">All</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        className="admin-secondary-button"
                        onClick={() => void handleDownloadUserAuditCsv(selectedUser)}
                      >
                        Скачать audit CSV
                      </button>
                    </div>
                    <div className="admin-toolbar">
                      <button
                        type="button"
                        className="admin-secondary-button"
                        onClick={() => void handleRevealAvatar(selectedUser)}
                      >
                        {selectedUserAvatarState === 'ready' ? 'Скрыть аватарку' : 'Аватарка'}
                      </button>
                      <button type="button" className="admin-secondary-button" onClick={() => void handleToggleBlock(selectedUser)}>
                        {selectedUser.blocked ? 'Разблокировать' : 'Заблокировать'}
                      </button>
                      <button type="button" className="admin-primary-button" onClick={() => void handleTogglePremium(selectedUser)}>
                        {selectedUser.premium ? 'Снять premium' : 'Выдать premium'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="admin-empty-state">Выберите пользователя слева.</div>
              )}
            </div>
          </section>
        ) : null}

        {section === 'reports' ? (
          <section className="admin-two-column admin-section-split">
            <div className="admin-panel admin-list-panel">
              <div className="admin-panel-heading">
                <h2>Reports</h2>
                <select
                  className="admin-select"
                  value={reportStatus}
                  onChange={(event) => setReportStatus(event.target.value as typeof reportStatus)}
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="all">All</option>
                </select>
              </div>

              <div className="admin-list">
                {reports.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    className={selectedReportId === report.id ? 'admin-list-item active' : 'admin-list-item'}
                    onClick={() => {
                      setSelectedReportId(report.id)
                      void refreshSelectedReport(report.id)
                    }}
                  >
                    <strong>{report.entityLabel}</strong>
                    <span>{report.entityType}</span>
                    <span>{report.status}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-panel admin-detail-panel">
              {selectedReport ? (
                <>
                  <div className="admin-panel-heading">
                    <h2>{selectedReport.entityLabel}</h2>
                    <div className="admin-toolbar">
                      <button type="button" className="admin-secondary-button" onClick={() => void handleAddReportNote(selectedReport.id)}>
                        Add note
                      </button>
                      <button type="button" className="admin-secondary-button" onClick={() => void handleApplyReportAction('close_report')}>
                        Close
                      </button>
                      {selectedReport.canRestrictUser ? (
                        <button type="button" className="admin-secondary-button" onClick={() => void handleApplyReportAction('restrict_user')}>
                          Restrict user
                        </button>
                      ) : null}
                      {selectedReport.canHide ? (
                        <button type="button" className="admin-secondary-button" onClick={() => void handleApplyReportAction('hide_entity')}>
                          Hide entity
                        </button>
                      ) : null}
                      {selectedReport.canDelete ? (
                        <button type="button" className="admin-primary-button" onClick={() => void handleApplyReportAction('delete_entity')}>
                          Delete entity
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <dl className="admin-detail-grid">
                    <div>
                      <dt>ID</dt>
                      <dd>{selectedReport.id}</dd>
                    </div>
                    <div>
                      <dt>Тип</dt>
                      <dd>{selectedReport.entityType}</dd>
                    </div>
                    <div>
                      <dt>Статус</dt>
                      <dd>{selectedReport.status}</dd>
                    </div>
                    <div>
                      <dt>Причина</dt>
                      <dd>{selectedReport.reason}</dd>
                    </div>
                    <div>
                      <dt>Репортёр</dt>
                      <dd>{selectedReport.reporterIdentifier}</dd>
                    </div>
                    <div>
                      <dt>Связанный пользователь</dt>
                      <dd>{selectedReport.relatedUserIdentifier || 'Нет'}</dd>
                    </div>
                    <div>
                      <dt>Создана</dt>
                      <dd>{formatDateTime(selectedReport.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Обновлена</dt>
                      <dd>{formatDateTime(selectedReport.updatedAt)}</dd>
                    </div>
                  </dl>

                  <div className="admin-note-block">
                    <strong>Entity preview</strong>
                    <p>{selectedReport.entityPreview || 'Без текстового preview.'}</p>
                  </div>

                  <div className="admin-note-block">
                    <strong>Internal notes</strong>
                    {selectedReport.notes.length > 0 ? (
                      <div className="admin-note-list">
                        {selectedReport.notes.map((note) => (
                          <article key={note.id} className="admin-note-card">
                            <strong>{note.authorDisplayName}</strong>
                            <span>{formatDateTime(note.createdAt)}</span>
                            <p>{note.text}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p>Пока без внутренних заметок.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="admin-empty-state">Выберите жалобу слева.</div>
              )}
            </div>
          </section>
        ) : null}

        {section === 'media' ? (
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>Media</h2>
            </div>
            <input
              className="admin-search-input"
              type="search"
              placeholder="Поиск по типу, файлу, пользователю или media URL"
              value={mediaQuery}
              onChange={(event) => setMediaQuery(event.target.value)}
            />

            <div className="admin-table admin-media-table">
              <div className="admin-table-row admin-table-head admin-media-row">
                <span>Тип</span>
                <span>Владелец</span>
                <span>Где находится</span>
                <span>Файл</span>
                <span>Размер</span>
                <span>Жалобы</span>
                <span>Действия</span>
              </div>
              {mediaItems.map((item) => (
                <div key={`${item.entityType}-${item.mediaUrl}-${item.owner.identifier}`} className="admin-table-row admin-media-row">
                  <span>{item.typeLabel}</span>
                  <span className="admin-cell-stack">
                    <button
                      type="button"
                      className="admin-inline-link"
                      onClick={() => void openUserFromAdmin(item.owner.identifier)}
                    >
                      {item.owner.displayName}
                    </button>
                    <span>{item.owner.identifier}</span>
                  </span>
                  <span className="admin-cell-stack">
                    <strong>{item.contextLabel}</strong>
                    {item.relatedUsers.length > 1 ? (
                      <span className="admin-related-users">
                        {item.relatedUsers.map((user, index) => (
                          <span key={user.identifier}>
                            {index > 0 ? <span className="admin-related-users-separator">↔</span> : null}
                            <button
                              type="button"
                              className="admin-inline-link"
                              onClick={() => void openUserFromAdmin(user.identifier)}
                            >
                              {user.displayName}
                            </button>
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className="admin-cell-stack">
                    <strong>{item.fileName}</strong>
                    <span>{item.mediaUrl.split('/').at(-1) ?? item.mediaUrl}</span>
                  </span>
                  <span>{formatBytes(item.size)}</span>
                  <span>
                    <span className={item.relatedReportCount > 0 ? 'admin-report-count has-reports' : 'admin-report-count'}>
                      {item.relatedReportCount}
                    </span>
                  </span>
                  <span className="admin-table-actions">
                    <button type="button" className="admin-secondary-button" onClick={() => void handleDownloadMedia(item)}>
                      Скачать
                    </button>
                    <button type="button" className="admin-secondary-button" onClick={() => void handleModerateMedia(item, 'hide')}>
                      Hide
                    </button>
                    <button type="button" className="admin-primary-button" onClick={() => void handleModerateMedia(item, 'delete')}>
                      Delete
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {section === 'channels' ? (
          <section className="admin-two-column admin-section-split">
            <div className="admin-panel admin-list-panel">
              <div className="admin-panel-heading">
                <h2>Channels</h2>
              </div>
              <input
                className="admin-search-input"
                type="search"
                placeholder="Поиск по названию, @handle или владельцу"
                value={channelQuery}
                onChange={(event) => setChannelQuery(event.target.value)}
              />
              <div className="admin-list">
                {channels.map((channel) => (
                  <button
                    key={channel.handle}
                    type="button"
                    className={selectedChannelHandle === channel.handle ? 'admin-list-item active' : 'admin-list-item'}
                    onClick={() => setSelectedChannelHandle(channel.handle)}
                  >
                    <strong>{channel.title}</strong>
                    <span>{`@${channel.handle}`}</span>
                    <span>{`${channel.status} · ${channel.visibility}`}</span>
                  </button>
                ))}
                {channels.length === 0 ? (
                  <div className="admin-empty-state admin-empty-state-inline">Каналы по текущему поиску не найдены.</div>
                ) : null}
              </div>
            </div>

            <div className="admin-panel admin-detail-panel">
              {selectedChannel ? (
                <>
                  <div className="admin-panel-heading">
                    <div className="admin-user-identity">
                      <h2>{selectedChannel.title}</h2>
                      <div className="admin-user-identity-meta">
                        <span>{`@${selectedChannel.handle}`}</span>
                        <span>{`${selectedChannel.status} · ${selectedChannel.visibility}`}</span>
                      </div>
                    </div>
                  </div>
                  <dl className="admin-detail-grid">
                    <div>
                      <dt>Владелец</dt>
                      <dd>
                        <button
                          type="button"
                          className="admin-inline-link"
                          onClick={() => void openUserFromAdmin(selectedChannel.owner.identifier)}
                        >
                          {selectedChannel.owner.displayName}
                        </button>
                      </dd>
                    </div>
                    <div>
                      <dt>Телефон владельца</dt>
                      <dd>{selectedChannel.owner.identifier}</dd>
                    </div>
                    <div>
                      <dt>Постов</dt>
                      <dd>{selectedChannel.postsCount}</dd>
                    </div>
                    <div>
                      <dt>Читателей</dt>
                      <dd>{selectedChannel.readers}</dd>
                    </div>
                    <div>
                      <dt>Жалоб</dt>
                      <dd>{selectedChannel.relatedReportCount}</dd>
                    </div>
                    <div>
                      <dt>Последняя активность</dt>
                      <dd>{formatDateTime(selectedChannel.latestActivityAt)}</dd>
                    </div>
                  </dl>
                  <div className="admin-actions-panel">
                    <div className="admin-toolbar">
                      <button type="button" className="admin-secondary-button" onClick={() => void handleDownloadChannelCsv(selectedChannel)}>
                        Скачать CSV
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="admin-empty-state">Выберите канал слева.</div>
              )}
            </div>
          </section>
        ) : null}

        {section === 'groups' ? (
          <section className="admin-two-column admin-section-split">
            <div className="admin-panel admin-list-panel">
              <div className="admin-panel-heading">
                <h2>Groups</h2>
              </div>
              <input
                className="admin-search-input"
                type="search"
                placeholder="Поиск по названию, shared id или владельцу"
                value={groupQuery}
                onChange={(event) => setGroupQuery(event.target.value)}
              />
              <div className="admin-list">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={selectedGroupId === group.id ? 'admin-list-item active' : 'admin-list-item'}
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <strong>{group.title}</strong>
                    <span>{group.id}</span>
                    <span>{`${group.members} участников`}</span>
                  </button>
                ))}
                {groups.length === 0 ? (
                  <div className="admin-empty-state admin-empty-state-inline">Группы по текущему поиску не найдены.</div>
                ) : null}
              </div>
            </div>

            <div className="admin-panel admin-detail-panel">
              {selectedGroup ? (
                <>
                  <div className="admin-panel-heading">
                    <div className="admin-user-identity">
                      <h2>{selectedGroup.title}</h2>
                      <div className="admin-user-identity-meta">
                        <span>{selectedGroup.id}</span>
                      </div>
                    </div>
                  </div>
                  <dl className="admin-detail-grid">
                    <div>
                      <dt>Владелец</dt>
                      <dd>
                        <button
                          type="button"
                          className="admin-inline-link"
                          onClick={() => void openUserFromAdmin(selectedGroup.owner.identifier)}
                        >
                          {selectedGroup.owner.displayName}
                        </button>
                      </dd>
                    </div>
                    <div>
                      <dt>Телефон владельца</dt>
                      <dd>{selectedGroup.owner.identifier}</dd>
                    </div>
                    <div>
                      <dt>Участников</dt>
                      <dd>{selectedGroup.members}</dd>
                    </div>
                    <div>
                      <dt>Жалоб</dt>
                      <dd>{selectedGroup.relatedReportCount}</dd>
                    </div>
                    <div>
                      <dt>Последняя активность</dt>
                      <dd>{formatDateTime(selectedGroup.latestActivityAt)}</dd>
                    </div>
                  </dl>
                  <div className="admin-actions-panel">
                    <div className="admin-toolbar">
                      <button type="button" className="admin-secondary-button" onClick={() => void handleDownloadGroupCsv(selectedGroup)}>
                        Скачать CSV
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="admin-empty-state">Выберите группу слева.</div>
              )}
            </div>
          </section>
        ) : null}

        {section === 'threads' ? (
          <section className="admin-two-column admin-section-split">
            <div className="admin-panel admin-list-panel">
              <div className="admin-panel-heading">
                <h2>Threads</h2>
              </div>
              <input
                className="admin-search-input"
                type="search"
                placeholder="Поиск по треду, источнику или владельцу"
                value={threadQuery}
                onChange={(event) => setThreadQuery(event.target.value)}
              />
              <div className="admin-list">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={selectedThreadId === thread.id ? 'admin-list-item active' : 'admin-list-item'}
                    onClick={() => setSelectedThreadId(thread.id)}
                  >
                    <strong>{thread.title}</strong>
                    <span>{thread.contextLabel}</span>
                    <span>{`${thread.commentCount} комментариев`}</span>
                  </button>
                ))}
                {threads.length === 0 ? (
                  <div className="admin-empty-state admin-empty-state-inline">Треды по текущему поиску не найдены.</div>
                ) : null}
              </div>
            </div>

            <div className="admin-panel admin-detail-panel">
              {selectedThread ? (
                <>
                  <div className="admin-panel-heading">
                    <div className="admin-user-identity">
                      <h2>{selectedThread.title}</h2>
                      <div className="admin-user-identity-meta">
                        <span>{selectedThread.kind === 'group' ? 'Тред группы' : 'Тред канала'}</span>
                        <span>{selectedThread.id}</span>
                      </div>
                    </div>
                  </div>
                  <dl className="admin-detail-grid">
                    <div>
                      <dt>Владелец</dt>
                      <dd>
                        <button
                          type="button"
                          className="admin-inline-link"
                          onClick={() => void openUserFromAdmin(selectedThread.owner.identifier)}
                        >
                          {selectedThread.owner.displayName}
                        </button>
                      </dd>
                    </div>
                    <div>
                      <dt>Телефон владельца</dt>
                      <dd>{selectedThread.owner.identifier}</dd>
                    </div>
                    <div>
                      <dt>Комментариев</dt>
                      <dd>{selectedThread.commentCount}</dd>
                    </div>
                    <div>
                      <dt>Жалоб</dt>
                      <dd>{selectedThread.relatedReportCount}</dd>
                    </div>
                    <div>
                      <dt>Последняя активность</dt>
                      <dd>{formatDateTime(selectedThread.latestActivityAt)}</dd>
                    </div>
                    <div>
                      <dt>Контекст</dt>
                      <dd>{selectedThread.contextLabel}</dd>
                    </div>
                    <div>
                      <dt>Текст корневого сообщения</dt>
                      <dd>{selectedThread.sourceText || 'Без текста'}</dd>
                    </div>
                  </dl>
                  <div className="admin-actions-panel">
                    <div className="admin-toolbar">
                      <button type="button" className="admin-secondary-button" onClick={() => void handleDownloadThreadCsv(selectedThread)}>
                        Скачать CSV
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="admin-empty-state">Выберите тред слева.</div>
              )}
            </div>
          </section>
        ) : null}

        {section === 'dialogs' ? (
          <section className="admin-two-column admin-section-split">
            <div className="admin-panel admin-list-panel">
              <div className="admin-panel-heading">
                <h2>Dialogs</h2>
              </div>
              <label className="admin-inline-field">
                <span>Первый пользователь</span>
                {selectedDialogOwner ? (
                  <div className="admin-selector-token">
                    <div className="admin-selector-token-copy">
                      <strong>{selectedDialogOwner.displayName}</strong>
                      <span>
                        {selectedDialogOwner.nickname
                          ? `@${selectedDialogOwner.nickname} · ${selectedDialogOwner.identifier}`
                          : selectedDialogOwner.identifier}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="admin-selector-token-clear"
                      onClick={handleClearDialogOwner}
                      aria-label="Сбросить первого пользователя"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <input
                    className="admin-search-input"
                    type="search"
                    placeholder="+79990000000 или username"
                    value={dialogOwnerQuery}
                    onChange={(event) => setDialogOwnerQuery(event.target.value)}
                  />
                )}
              </label>
              <label className="admin-inline-field">
                <span>Второй пользователь</span>
                {dialogDetail ? (
                  <div className="admin-selector-token">
                    <div className="admin-selector-token-copy">
                      <strong>{dialogDetail.peer.displayName}</strong>
                      <span>{dialogDetail.peer.identifier}</span>
                    </div>
                    <button
                      type="button"
                      className="admin-selector-token-clear"
                      onClick={handleClearDialogPeer}
                      aria-label="Сбросить второго пользователя"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <input
                    className="admin-search-input"
                    type="search"
                    placeholder="+79990000000 или username"
                    value={dialogPeerQuery}
                    onChange={(event) => setDialogPeerQuery(event.target.value)}
                    disabled={!selectedDialogOwner}
                  />
                )}
              </label>
            </div>

            <div className="admin-panel admin-detail-panel">
              {!selectedDialogOwner ? (
                <>
                  <div className="admin-panel-heading">
                    <h2>Найденные пользователи</h2>
                  </div>
                  {dialogOwnerMatches.length > 0 ? (
                    <div className="admin-list">
                      {dialogOwnerMatches.map((user) => (
                        <button
                          key={user.identifier}
                          type="button"
                          className="admin-list-item"
                          onClick={() => handleSelectDialogOwner(user)}
                        >
                          <strong>{user.displayName}</strong>
                          <span>{user.nickname ? `@${user.nickname}` : 'Нет username'}</span>
                          <span>{user.identifier}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="admin-empty-state">
                      {dialogOwnerQuery.trim()
                        ? 'По текущему запросу пользователи не найдены.'
                        : 'Начните вводить первого пользователя, и здесь появятся результаты поиска.'}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="admin-panel-heading">
                    <div className="admin-user-identity">
                      <h2>Диалоги пользователя</h2>
                      <div className="admin-user-identity-meta">
                        <span>{selectedDialogOwner.displayName}</span>
                        <span>{selectedDialogOwner.identifier}</span>
                        <span>{`${dialogs.length} найдено`}</span>
                      </div>
                    </div>
                  </div>
                  {dialogs.length > 0 ? (
                    <div className="admin-list admin-dialog-list">
                      {dialogs.map((dialog) => (
                        <button
                          key={dialog.sharedKey}
                          type="button"
                          className={dialogDetail?.sharedKey === dialog.sharedKey ? 'admin-list-item active' : 'admin-list-item'}
                          onClick={() => handleSelectDialog(dialog)}
                        >
                          <strong>{dialog.peer.displayName}</strong>
                          <span>{dialog.peer.identifier}</span>
                          <span>{`Сообщений: ${dialog.messageCount}`}</span>
                          <span>{`Последнее: ${formatDateTime(dialog.updatedAt)}`}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="admin-empty-state">
                      {dialogPeerQuery.trim()
                        ? 'Диалоги по текущему фильтру не найдены.'
                        : 'У выбранного пользователя пока нет доступных диалогов.'}
                    </div>
                  )}

                  {dialogDetail ? (
                    <>
                      <dl className="admin-detail-grid">
                        <div>
                          <dt>Первое сообщение</dt>
                          <dd>{formatDateTime(dialogDetail.firstMessageAt)}</dd>
                        </div>
                        <div>
                          <dt>Последнее сообщение</dt>
                          <dd>{formatDateTime(dialogDetail.updatedAt)}</dd>
                        </div>
                        <div>
                          <dt>Количество сообщений</dt>
                          <dd>{dialogDetail.messageCount}</dd>
                        </div>
                        <div>
                          <dt>Preview</dt>
                          <dd>{dialogDetail.preview}</dd>
                        </div>
                      </dl>
                      <div className="admin-actions-panel">
                        <div className="admin-toolbar">
                          <button type="button" className="admin-secondary-button" onClick={() => void handleDownloadDialogCsv(dialogDetail)}>
                            Скачать CSV
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </section>
        ) : null}

        {section === 'audit' ? (
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>Audit Log</h2>
            </div>

            <div className="admin-inline-controls admin-audit-controls">
              <label className="admin-inline-field">
                <span>Актёр</span>
                <select
                  className="admin-select"
                  value={auditActorIdentifier}
                  onChange={(event) => setAuditActorIdentifier(event.target.value)}
                >
                  <option value="">Все актёры</option>
                  {auditActors.map((actor) => (
                    <option key={actor.identifier} value={actor.identifier}>
                      {actor.nickname
                        ? `${actor.displayName} (@${actor.nickname})`
                        : actor.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-inline-field">
                <span>Период</span>
                <select
                  className="admin-select"
                  value={auditPeriod}
                  onChange={(event) => setAuditPeriod(event.target.value as AdminAuditPeriod)}
                >
                  <option value="24h">24 часа</option>
                  <option value="7d">7 дней</option>
                  <option value="30d">30 дней</option>
                  <option value="90d">90 дней</option>
                  <option value="all">All</option>
                </select>
              </label>
              <button type="button" className="admin-secondary-button" onClick={() => void refreshAuditLog()}>
                Обновить
              </button>
              <button type="button" className="admin-primary-button" onClick={() => void handleDownloadAuditCsv()}>
                Сформировать CSV
              </button>
            </div>

            <div className="admin-table admin-audit-table">
              <div className="admin-table-row admin-table-head">
                <span>Когда</span>
                <span>Актёр</span>
                <span>Действие</span>
                <span>Объект</span>
                <span>Причина</span>
                <span>Summary</span>
              </div>
              {auditEntries.map((entry) => (
                <div key={entry.id} className="admin-table-row">
                  <span>{formatDateTime(entry.createdAt)}</span>
                  <span>
                    {entry.actorNickname
                      ? `${entry.actorDisplayName} (@${entry.actorNickname}) · ${entry.actorRole}`
                      : `${entry.actorDisplayName} · ${entry.actorRole}`}
                  </span>
                  <span>{entry.action}</span>
                  <span>{entry.targetLabel}</span>
                  <span>{entry.reason || 'Нет'}</span>
                  <span>{entry.summary}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}
