import { useEffect, useEffectEvent, useState } from 'react'
import './admin.css'
import {
  ApiError,
  addAdminReportNote,
  applyAdminReportAction,
  blockAdminUser,
  downloadAdminAuditCsv,
  downloadAdminIpLogsCsv,
  downloadAdminLegalArchive,
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
  viewAdminReportEntity,
  verifyAuthCode,
} from './app/backend'
import { useCaptcha } from './app/useCaptcha'
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
  AdminUserIpSummary,
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
const adminViewedReportsStoragePrefix = 'tinychok.admin.viewedReports'

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

function buildViewedReportsStorageKey(actorIdentifier: string) {
  return `${adminViewedReportsStoragePrefix}:${actorIdentifier}`
}

function loadViewedReportIds(actorIdentifier: string) {
  if (typeof window === 'undefined' || !actorIdentifier.trim()) {
    return [] as string[]
  }

  try {
    const rawValue = window.localStorage.getItem(buildViewedReportsStorageKey(actorIdentifier))
    const parsed = rawValue ? JSON.parse(rawValue) : []
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function saveViewedReportIds(actorIdentifier: string, reportIds: string[]) {
  if (typeof window === 'undefined' || !actorIdentifier.trim()) {
    return
  }

  window.localStorage.setItem(
    buildViewedReportsStorageKey(actorIdentifier),
    JSON.stringify([...new Set(reportIds)]),
  )
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

function formatAdminBannerLabel(value: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION') {
  if (value === 'STAGING') return 'СТЕЙДЖИНГ'
  if (value === 'PRODUCTION') return 'ПРОД'
  return 'РАЗРАБОТКА'
}

function formatReportStatus(value: 'open' | 'closed') {
  return value === 'open' ? 'Открыта' : 'Закрыта'
}

function formatChannelStatus(value: 'draft' | 'active') {
  return value === 'draft' ? 'Черновик' : 'Активен'
}

function formatVisibility(value: 'private' | 'public' | 'closed') {
  if (value === 'private') return 'Приватный'
  if (value === 'public') return 'Публичный'
  return 'Закрытый'
}

function formatStaffRole(value: 'owner' | 'moderator' | 'support') {
  if (value === 'owner') return 'Владелец'
  if (value === 'moderator') return 'Модератор'
  return 'Поддержка'
}

function formatUserRole(value?: 'owner' | 'moderator' | 'support') {
  return value ? formatStaffRole(value) : 'Пользователь'
}

const reportActionLabels: Record<AdminReportAction, string> = {
  close_report: 'Закрыть жалобу',
  delete_entity: 'Удалить сущность',
  hide_entity: 'Скрыть сущность',
  restrict_user: 'Заблокировать пользователя',
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
  downloadBlobFile(fileName, blob)
}

function downloadBlobFile(fileName: string, blob: Blob) {
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
  const {
    captchaBusy,
    captchaContainerRef,
    captchaProvider,
    captchaRequired,
    getCaptchaTokenOrThrow,
    resetCaptcha,
  } = useCaptcha(runtimeConfig?.captcha, !bootstrap && authStep === 'phone')

  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null)
  const [users, setUsers] = useState<AdminUserSummary[]>([])
  const [totalUserCount, setTotalUserCount] = useState(0)
  const [blockedUserTotalCount, setBlockedUserTotalCount] = useState(0)
  const [userQuery, setUserQuery] = useState('')
  const [userListFilter, setUserListFilter] = useState<AdminUserListFilter>('all')
  const [selectedUserIdentifier, setSelectedUserIdentifier] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null)
  const [selectedUserIpSummary, setSelectedUserIpSummary] = useState<AdminUserIpSummary | null>(null)
  const [selectedUserAvatarUrl, setSelectedUserAvatarUrl] = useState<string | null>(null)
  const [selectedUserAvatarState, setSelectedUserAvatarState] = useState<'idle' | 'loading' | 'ready' | 'none'>('idle')

  const [reports, setReports] = useState<AdminReportSummary[]>([])
  const [openReportsInbox, setOpenReportsInbox] = useState<AdminReportSummary[]>([])
  const [reportStatus, setReportStatus] = useState<'open' | 'closed' | 'all'>('open')
  const [selectedReportId, setSelectedReportId] = useState('')
  const [selectedReport, setSelectedReport] = useState<Awaited<ReturnType<typeof fetchAdminReport>>['report'] | null>(null)
  const [viewedReportIds, setViewedReportIds] = useState<string[]>([])

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
    if (!bootstrap) {
      setViewedReportIds([])
      return
    }

    setViewedReportIds(loadViewedReportIds(bootstrap.actor.identifier))
  }, [bootstrap])

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
    setTotalUserCount(response.totalUsers)
    setBlockedUserTotalCount(response.blockedUsers)
    setUsers(response.users)
  }

  async function refreshSelectedUser(identifierToLoad = selectedUserIdentifier) {
    if (!sessionToken || !identifierToLoad) return

    const response = await fetchAdminUser(sessionToken, identifierToLoad)
    setSelectedUserIdentifier(response.user.identifier)
    setSelectedUserIpSummary(response.ipSummary)
    setSelectedUser(response.user)
  }

  async function refreshReports(statusFilter = reportStatus) {
    if (!sessionToken) return

    const response = await fetchAdminReports(
      sessionToken,
      statusFilter === 'all' ? undefined : statusFilter,
    )
    setReports(response.reports)
    if (statusFilter === 'open') {
      setOpenReportsInbox(response.reports)
    } else if (statusFilter === 'all') {
      setOpenReportsInbox(response.reports.filter((report) => report.status === 'open'))
    } else {
      const openResponse = await fetchAdminReports(sessionToken, 'open')
      setOpenReportsInbox(openResponse.reports)
    }
    if (selectedReportId && !response.reports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId('')
      setSelectedReport(null)
    }
  }

  function markReportViewed(reportId: string) {
    if (!bootstrap || !reportId) return

    setViewedReportIds((currentIds) => {
      if (currentIds.includes(reportId)) {
        return currentIds
      }

      const nextIds = [...currentIds, reportId]
      saveViewedReportIds(bootstrap.actor.identifier, nextIds)
      return nextIds
    })
  }

  async function refreshSelectedReport(reportId = selectedReportId) {
    if (!sessionToken || !reportId) return

    const response = await fetchAdminReport(sessionToken, reportId)
    setSelectedReportId(reportId)
    setSelectedReport(response.report)
    markReportViewed(reportId)
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
      const captchaToken = getCaptchaTokenOrThrow()
      const response = await requestAuthCode({ captchaToken, identifier })
      setAuthHint(
        response.existingAccount
          ? `Код отправлен staff-аккаунту ${response.existingAccount.displayName}.`
          : 'Код отправлен. Войти в админку смогут только уже существующие staff-аккаунты.',
      )
      setAuthStep('code')
    } catch (error) {
      setAuthError(getErrorMessage(error))
    } finally {
      resetCaptcha()
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
        setAuthError('Для входа в админку нужен уже существующий staff-аккаунт.')
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
    setSelectedUserIpSummary(null)
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

  async function handleViewReportEntity() {
    if (!sessionToken || !selectedReport) return

      const reason = getActionReason('Причина просмотра содержимого жалобы', 'Проверка жалобы')
    if (!reason) return

    try {
      const response = await viewAdminReportEntity(sessionToken, selectedReport.id, { reason })
      if (!response.previewUrl) {
        setAppError('Для этой жалобы сейчас нет отдельного предпросмотра.')
        return
      }

      markReportViewed(selectedReport.id)
      window.open(response.previewUrl, '_blank', 'noopener,noreferrer')
      await refreshAuditLog()
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function handleApplyReportAction(action: AdminReportAction) {
    if (!sessionToken || !selectedReport) return

    const reason = getActionReason('Причина admin-действия', 'Решение staff-команды')
    if (!reason) return

    if (!window.confirm(`Подтвердить действие «${reportActionLabels[action]}» для жалобы ${selectedReport.id}?`)) {
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
      const reason = getActionReason('Причина выгрузки CSV аудита', 'Внутренняя проверка staff-активности')
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
      const reason = getActionReason('Причина выгрузки CSV аудита по пользователю', 'Проверка staff-действий по пользователю')
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

  async function handleDownloadUserIpLogsCsv(user: AdminUserSummary) {
    if (!sessionToken || !bootstrap) return

    const confirmation = window.prompt(
      'Для подтверждения выгрузки IP логов введите номер текущего staff-аккаунта',
      bootstrap.actor.identifier,
    )
    if (confirmation === null) {
      return
    }
    if (confirmation.trim() !== bootstrap.actor.identifier) {
      setAppError('Подтверждение выгрузки IP логов не прошло.')
      return
    }

    try {
      const reason = getActionReason('Причина выгрузки CSV IP логов по пользователю', 'Проверка входов и смены IP по пользователю')
      if (!reason) return
      const response = await downloadAdminIpLogsCsv(sessionToken, {
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

  async function handleDownloadLegalArchive(user: AdminUserSummary) {
    if (!sessionToken || !bootstrap) return

    const confirmation = window.prompt(
      'Для подтверждения юр. выгрузки введите номер текущего staff-аккаунта',
      bootstrap.actor.identifier,
    )
    if (confirmation === null) {
      return
    }
    if (confirmation.trim() !== bootstrap.actor.identifier) {
      setAppError('Подтверждение юр. выгрузки не прошло.')
      return
    }

    const reason = getActionReason(
      'Основание для юридической выгрузки',
      'Исполнение официального запроса на выгрузку данных',
    )
    if (!reason) return

    const fromInput = window.prompt(
      'Дата начала периода в ISO формате (например, 2026-03-01T00:00:00.000Z). Оставьте пустым для выгрузки за всё время.',
      '',
    )
    if (fromInput === null) {
      return
    }

    const toInput = window.prompt(
      'Дата конца периода в ISO формате (например, 2026-03-31T23:59:59.999Z). Оставьте пустым для выгрузки по текущий момент.',
      '',
    )
    if (toInput === null) {
      return
    }

    const includeMedia = window.confirm(
      'Включить связанные media-файлы в архив? Это может заметно увеличить размер выгрузки.',
    )

    try {
      const response = await downloadAdminLegalArchive(sessionToken, {
        from: fromInput.trim() || undefined,
        includeMedia,
        reason,
        targetIdentifier: user.identifier,
        to: toInput.trim() || undefined,
      })
      downloadBlobFile(response.fileName, response.blob)
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

  async function openChannelFromAdmin(handleToOpen: string) {
    if (!sessionToken || !handleToOpen) return

    try {
      setSection('channels')
      setChannelQuery(handleToOpen)
      setSelectedChannelHandle(handleToOpen)
      await refreshChannels(handleToOpen)
    } catch (error) {
      setAppError(getErrorMessage(error))
    }
  }

  async function openGroupFromAdmin(groupIdToOpen: string) {
    if (!sessionToken || !groupIdToOpen) return

    try {
      setSection('groups')
      setGroupQuery(groupIdToOpen)
      setSelectedGroupId(groupIdToOpen)
      await refreshGroups(groupIdToOpen)
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

  const blockedUsersCount = blockedUserTotalCount
  const unviewedOpenReportCount = openReportsInbox.filter(
    (report) => !viewedReportIds.includes(report.id),
  ).length
  const visibleUsers =
    userListFilter === 'blocked' ? users.filter((user) => user.blocked) : users
  const selectedChannel = channels.find((channel) => channel.handle === selectedChannelHandle) ?? null
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null

  if (appLoading) {
    return <main className="admin-shell admin-loading">Подготавливаем админку...</main>
  }

  if (!runtimeConfig) {
    return <main className="admin-shell admin-loading">Не удалось получить runtime config.</main>
  }

  if (!runtimeConfig.admin.enabled) {
    return (
      <main className="admin-shell admin-guard-screen">
        <div className="admin-guard-card">
          <strong>Админка выключена</strong>
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
          <p>Админка разрешена только на `admin.staging.tinychok.ru`, `admin.tinychok.ru` и локальном dev-хосте.</p>
        </div>
      </main>
    )
  }

  if (!bootstrap) {
    return (
      <main className="admin-shell admin-auth-shell">
        <section className="admin-auth-copy">
          <span className="admin-badge">{runtimeConfig.admin.bannerLabel}</span>
          <h1>Админка Tinychok</h1>
          <p>
            Внутренняя панель модерации, поддержки премиума, проверки медиа и аудита.
            Вход разрешён только для staff-аккаунтов с ролью `владелец`, `модератор` или `поддержка`.
          </p>
          {appError ? <p className="admin-auth-error">{appError}</p> : null}
        </section>

        <section className="admin-auth-card">
          <h2>{authStep === 'phone' ? 'Staff Login' : 'Подтверждение кода'}</h2>

          {authStep === 'phone' ? (
            <>
              <label className="admin-field">
                <span>Телефон staff-аккаунта</span>
                <input
                  type="tel"
                  placeholder="+79990000000"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
              </label>

              {captchaRequired && captchaProvider === 'smartcaptcha' ? (
                <div className="admin-auth-captcha">
                  <div ref={captchaContainerRef} className="admin-auth-captcha-widget" aria-hidden="true" />
                  <p className="admin-auth-captcha-note">
                    Staff-вход защищён SmartCaptcha. Перед отправкой SMS подтвердите, что вы не робот.
                  </p>
                </div>
              ) : null}
            </>
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
              disabled={authBusy || captchaBusy}
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
          <span className="admin-badge">{formatAdminBannerLabel(bootstrap.config.bannerLabel)}</span>
          <strong>Админка Tinychok</strong>
        </div>

        <nav className="admin-nav">
          {([
            ['dashboard', 'Сводка'],
            ['users', 'Пользователи'],
            ['reports', 'Жалобы'],
            ['channels', 'Каналы'],
            ['groups', 'Группы'],
            ['threads', 'Треды'],
            ['dialogs', 'Диалоги'],
            ['media', 'Медиа'],
            ['audit', 'Аудит лог'],
          ] as Array<[AdminSection, string]>).map(([item, label]) => (
            <button
              key={item}
              type="button"
              className={section === item ? 'admin-nav-item active' : 'admin-nav-item'}
              onClick={() => setSection(item)}
            >
              <span>{label}</span>
              {item === 'reports' && unviewedOpenReportCount > 0 ? (
                <span className="admin-nav-badge">{unviewedOpenReportCount}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-actor-card">
            <span className="admin-actor-avatar">{getInitials(bootstrap.actor.displayName)}</span>
            <div className="admin-actor-meta">
              <strong>{bootstrap.actor.displayName}</strong>
              <div className="admin-actor-subline">
                <span className="admin-actor-identifier">{bootstrap.actor.identifier}</span>
                <span className="admin-role-badge">{formatStaffRole(bootstrap.actor.role)}</span>
              </div>
            </div>
          </div>

          <button type="button" className="admin-secondary-button" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <section className="admin-content">
        <div className="admin-environment-strip">
          <span className="admin-badge">{formatAdminBannerLabel(bootstrap.config.bannerLabel)}</span>
          <span className="admin-environment-copy">Внутренняя среда модерации</span>
          {appError ? <p className="admin-inline-error">{appError}</p> : null}
        </div>

        {section === 'dashboard' ? (
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>Сводка</h2>
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
                <span>Жалобы · Открытые</span>
                <strong>{dashboard?.metrics.openReports ?? '...'}</strong>
              </article>
              <article className="admin-metric-card">
                <span>Жалобы · Закрытые</span>
                <strong>{dashboard?.metrics.closedReports ?? '...'}</strong>
              </article>
              <article className="admin-metric-card">
                <span>Премиум · Месячные</span>
                <strong>{dashboard?.metrics.monthlyPremiumUsers ?? '...'}</strong>
              </article>
              <article className="admin-metric-card">
                <span>Премиум · Годовые</span>
                <strong>{dashboard?.metrics.yearlyPremiumUsers ?? '...'}</strong>
              </article>
              <article className="admin-metric-card">
                <span>Группы</span>
                <strong>{dashboard?.metrics.totalGroups ?? '...'}</strong>
              </article>
              <article className="admin-metric-card">
                <span>Каналы</span>
                <strong>{dashboard?.metrics.totalChannels ?? '...'}</strong>
              </article>
              <article className="admin-metric-card">
                <span>Треды</span>
                <strong>{dashboard?.metrics.totalThreads ?? '...'}</strong>
              </article>
              <article className="admin-metric-card">
                <span>Медиаобъекты</span>
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
                  {`Все (${totalUserCount})`}
                </button>
                <button
                  type="button"
                  className={userListFilter === 'blocked' ? 'admin-filter-tab active blocked' : 'admin-filter-tab blocked'}
                  onClick={() => setUserListFilter('blocked')}
                >
                  {`Заблокированные (${blockedUsersCount})`}
                </button>
              </div>
              <div className="admin-section-note">
                {userQuery.trim()
                  ? `Показаны последние ${users.length} результатов по текущему поиску.`
                  : `Показаны последние ${users.length} пользователей из ${totalUserCount}.`}
              </div>
              <input
                className="admin-search-input"
                type="search"
                placeholder="Поиск по id, юзернейму, телефону"
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
                    <span>{user.nickname ? `@${user.nickname}` : 'Нет юзернейма'}</span>
                    <span className={user.blocked ? 'admin-user-status blocked' : 'admin-user-status'}>
                      {user.status || (user.blocked ? 'Заблокирован' : formatUserRole(user.staffRole))}
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
                        <span>{selectedUser.nickname ? `@${selectedUser.nickname}` : 'Нет юзернейма'}</span>
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
                      <dd>{selectedUser.nickname || 'Нет юзернейма'}</dd>
                    </div>
                    <div>
                      <dt>Премиум</dt>
                      <dd>{selectedUser.premium ? `Да, до ${formatDateTime(selectedUser.premiumExpiresAt)}` : 'Нет'}</dd>
                    </div>
                    <div>
                      <dt>Роль</dt>
                      <dd>{formatUserRole(selectedUser.staffRole)}</dd>
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
                      <dt>Последний IP</dt>
                      <dd>{selectedUserIpSummary?.latestIp || 'Нет данных'}</dd>
                    </div>
                    <div>
                      <dt>Последний IP замечен</dt>
                      <dd>{formatDateTime(selectedUserIpSummary?.latestIpAt)}</dd>
                    </div>
                    <div>
                      <dt>IP входа</dt>
                      <dd>{selectedUserIpSummary?.lastLoginIp || 'Нет данных'}</dd>
                    </div>
                    <div>
                      <dt>Последний вход с IP</dt>
                      <dd>{formatDateTime(selectedUserIpSummary?.lastLoginAt)}</dd>
                    </div>
                    <div>
                      <dt>Смен IP</dt>
                      <dd>{selectedUserIpSummary?.ipChangeCount ?? 0}</dd>
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
                          <option value="all">За всё время</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        className="admin-secondary-button"
                        onClick={() => void handleDownloadUserAuditCsv(selectedUser)}
                      >
                        Скачать audit CSV
                      </button>
                      {bootstrap.actor.permissions.includes('ip.read') ? (
                        <button
                          type="button"
                          className="admin-secondary-button"
                          onClick={() => void handleDownloadUserIpLogsCsv(selectedUser)}
                        >
                          Логи IP
                        </button>
                      ) : null}
                      {bootstrap.actor.permissions.includes('legal.export') ? (
                        <button
                          type="button"
                          className="admin-secondary-button"
                          onClick={() => void handleDownloadLegalArchive(selectedUser)}
                        >
                          Юр. выгрузка ZIP
                        </button>
                      ) : null}
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
                <h2>Жалобы</h2>
                <select
                  className="admin-select"
                  value={reportStatus}
                  onChange={(event) => setReportStatus(event.target.value as typeof reportStatus)}
                >
                  <option value="open">Открытые</option>
                  <option value="closed">Закрытые</option>
                  <option value="all">Все</option>
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
                    <div className="admin-report-title-row">
                      <strong>{report.entityLabel}</strong>
                      {report.status === 'open' && !viewedReportIds.includes(report.id) ? (
                        <span className="admin-report-unread-dot" aria-hidden="true" />
                      ) : null}
                    </div>
                    <span>{report.entityType}</span>
                    <span>{formatReportStatus(report.status)}</span>
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
                        Добавить заметку
                      </button>
                      <button type="button" className="admin-secondary-button" onClick={() => void handleApplyReportAction('close_report')}>
                        Закрыть
                      </button>
                      {selectedReport.canRestrictUser ? (
                        <button type="button" className="admin-secondary-button" onClick={() => void handleApplyReportAction('restrict_user')}>
                          Заблокировать пользователя
                        </button>
                      ) : null}
                      {selectedReport.canHide ? (
                        <button type="button" className="admin-secondary-button" onClick={() => void handleApplyReportAction('hide_entity')}>
                          Скрыть сущность
                        </button>
                      ) : null}
                      {selectedReport.canDelete ? (
                        <button type="button" className="admin-primary-button" onClick={() => void handleApplyReportAction('delete_entity')}>
                          Удалить сущность
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
                      <dd>{formatReportStatus(selectedReport.status)}</dd>
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
                    <strong>Предпросмотр сущности</strong>
                    <p>{selectedReport.entityPreview || 'Нет текстового превью.'}</p>
                    {['media', 'avatar', 'gif'].includes(selectedReport.entityType) ? (
                      <div className="admin-toolbar">
                        <button type="button" className="admin-secondary-button" onClick={() => void handleViewReportEntity()}>
                          Посмотреть
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="admin-note-block">
                    <strong>Внутренние заметки</strong>
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
              <h2>Медиа</h2>
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
                <span>Дата и время</span>
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
                  <span>{formatDateTime(item.createdAt)}</span>
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
                      Скрыть
                    </button>
                    <button type="button" className="admin-primary-button" onClick={() => void handleModerateMedia(item, 'delete')}>
                      Удалить
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
                <h2>Каналы</h2>
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
                    <span>{`${formatChannelStatus(channel.status)} · ${formatVisibility(channel.visibility)}`}</span>
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
                        <span>{`${formatChannelStatus(selectedChannel.status)} · ${formatVisibility(selectedChannel.visibility)}`}</span>
                      </div>
                    </div>
                  </div>
                  <dl className="admin-detail-grid">
                    <div>
                      <dt>Владелец</dt>
                      <dd className="admin-contact-card">
                        <button
                          type="button"
                          className="admin-inline-link"
                          onClick={() => void openUserFromAdmin(selectedChannel.owner.identifier)}
                        >
                          {selectedChannel.owner.displayName}
                        </button>
                        <span>{selectedChannel.owner.nickname ? `@${selectedChannel.owner.nickname}` : 'Нет юзернейма'}</span>
                        <span>{selectedChannel.owner.identifier}</span>
                      </dd>
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
                <h2>Группы</h2>
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
                <h2>Треды</h2>
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
                        <span>{selectedThread.kind === 'group' ? 'Источник треда: группа' : 'Источник треда: канал'}</span>
                        <button
                          type="button"
                          className="admin-inline-link"
                          onClick={() =>
                            selectedThread.kind === 'group'
                              ? void openGroupFromAdmin(selectedThread.sourceGroupId ?? '')
                              : void openChannelFromAdmin(selectedThread.sourceChannelHandle ?? '')
                          }
                        >
                          {selectedThread.contextLabel}
                        </button>
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
                      <dd>
                        <button
                          type="button"
                          className="admin-inline-link"
                          onClick={() =>
                            selectedThread.kind === 'group'
                              ? void openGroupFromAdmin(selectedThread.sourceGroupId ?? '')
                              : void openChannelFromAdmin(selectedThread.sourceChannelHandle ?? '')
                          }
                        >
                          {selectedThread.contextLabel}
                        </button>
                      </dd>
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
                <h2>Диалоги</h2>
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
                    placeholder="+79990000000 или юзернейм"
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
                    placeholder="+79990000000 или юзернейм"
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
                          <span>{user.nickname ? `@${user.nickname}` : 'Нет юзернейма'}</span>
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
                      <h2>{dialogDetail ? `${dialogDetail.owner.displayName} ↔ ${dialogDetail.peer.displayName}` : 'Диалоги пользователя'}</h2>
                      <div className="admin-user-identity-meta">
                        <span>{selectedDialogOwner.displayName}</span>
                        <span>{selectedDialogOwner.identifier}</span>
                        {!dialogDetail ? <span>{`${dialogs.length} найдено`}</span> : null}
                      </div>
                    </div>
                  </div>
                  {!dialogDetail && dialogs.length > 0 ? (
                    <div className="admin-list admin-dialog-list">
                      {dialogs.map((dialog) => (
                        <button
                          key={dialog.sharedKey}
                          type="button"
                          className="admin-list-item"
                          onClick={() => handleSelectDialog(dialog)}
                        >
                          <strong>{dialog.peer.displayName}</strong>
                          <span>{dialog.peer.identifier}</span>
                          <span>{`Сообщений: ${dialog.messageCount}`}</span>
                          <span>{`Последнее: ${formatDateTime(dialog.updatedAt)}`}</span>
                        </button>
                      ))}
                    </div>
                  ) : !dialogDetail ? (
                    <div className="admin-empty-state">
                      {dialogPeerQuery.trim()
                        ? 'Диалоги по текущему фильтру не найдены.'
                        : 'У выбранного пользователя пока нет доступных диалогов.'}
                    </div>
                  ) : null}

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
              <h2>Аудит лог</h2>
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
                  <option value="all">За всё время</option>
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
                <span>Сводка</span>
              </div>
              {auditEntries.map((entry) => (
                <div key={entry.id} className="admin-table-row">
                  <span>{formatDateTime(entry.createdAt)}</span>
                  <span>
                    {entry.actorNickname
                      ? `${entry.actorDisplayName} (@${entry.actorNickname}) · ${formatStaffRole(entry.actorRole)}`
                      : `${entry.actorDisplayName} · ${formatStaffRole(entry.actorRole)}`}
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
