import { useEffect, useEffectEvent, useState } from 'react'
import './admin.css'
import {
  ApiError,
  addAdminReportNote,
  applyAdminReportAction,
  blockAdminUser,
  fetchAdminAuditLog,
  fetchAdminBootstrap,
  fetchAdminDashboard,
  fetchAdminMedia,
  fetchAdminReport,
  fetchAdminReports,
  fetchAdminUser,
  fetchClientRuntimeConfig,
  moderateAdminMedia,
  requestAuthCode,
  searchAdminUsers,
  setAdminUserPremium,
  unblockAdminUser,
  verifyAuthCode,
} from './app/backend'
import { isAllowedAdminHost } from './app/runtimeMode'
import type {
  AdminAuditLogEntry,
  AdminBootstrapResponse,
  AdminDashboardResponse,
  AdminMediaItem,
  AdminReportAction,
  AdminReportSummary,
  AdminUserSummary,
  ClientRuntimeConfigResponse,
} from './shared/backend'

type AdminSection = 'dashboard' | 'users' | 'reports' | 'media' | 'audit'
type AdminAuthStep = 'phone' | 'code'

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
  const [selectedUserIdentifier, setSelectedUserIdentifier] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null)

  const [reports, setReports] = useState<AdminReportSummary[]>([])
  const [reportStatus, setReportStatus] = useState<'open' | 'closed' | 'all'>('open')
  const [selectedReportId, setSelectedReportId] = useState('')
  const [selectedReport, setSelectedReport] = useState<Awaited<ReturnType<typeof fetchAdminReport>>['report'] | null>(null)

  const [mediaQuery, setMediaQuery] = useState('')
  const [mediaItems, setMediaItems] = useState<AdminMediaItem[]>([])
  const [auditEntries, setAuditEntries] = useState<AdminAuditLogEntry[]>([])

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

  async function refreshAuditLog() {
    if (!sessionToken) return

    const response = await fetchAdminAuditLog(sessionToken)
    setAuditEntries(response.entries)
  }

  const hydrateAdminData = useEffectEvent(async () => {
    await refreshDashboard()
    await refreshUsers(userQuery)
    await refreshReports(reportStatus)
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
        if (!window.confirm(`Снять блокировку с ${user.identifier}?`)) {
          return
        }

        const response = await unblockAdminUser(sessionToken, user.identifier)
        setSelectedUser(response.user)
      } else {
        const reason = getActionReason('Причина блокировки', 'Нарушение правил сервиса')
        if (!reason) return
        if (!window.confirm(`Заблокировать ${user.identifier}?`)) {
          return
        }

        const response = await blockAdminUser(sessionToken, user.identifier, { reason })
        setSelectedUser(response.user)
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
      await refreshUsers()
      await refreshDashboard()
      await refreshAuditLog()
    } catch (error) {
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
      setSelectedReport(response.report)
      await refreshReports()
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
            <div>
              <strong>{bootstrap.actor.displayName}</strong>
              <span>{bootstrap.actor.role}</span>
            </div>
          </div>

          <button type="button" className="admin-secondary-button" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div>
            <strong>{bootstrap.config.bannerLabel}</strong>
            <span>Internal staff-only environment</span>
          </div>
          {appError ? <p className="admin-inline-error">{appError}</p> : null}
        </header>

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
          <section className="admin-panel admin-two-column">
            <div className="admin-list-panel">
              <div className="admin-panel-heading">
                <h2>Users</h2>
              </div>
              <input
                className="admin-search-input"
                type="search"
                placeholder="Поиск по id, username, телефону"
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
              />

              <div className="admin-list">
                {users.map((user) => (
                  <button
                    key={user.identifier}
                    type="button"
                    className={selectedUserIdentifier === user.identifier ? 'admin-list-item active' : 'admin-list-item'}
                    onClick={() => {
                      setSelectedUserIdentifier(user.identifier)
                      void refreshSelectedUser(user.identifier)
                    }}
                  >
                    <strong>{user.displayName}</strong>
                    <span>{user.identifier}</span>
                    <span>{user.blocked ? 'blocked' : user.staffRole ?? 'user'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-detail-panel">
              {selectedUser ? (
                <>
                  <div className="admin-panel-heading">
                    <h2>{selectedUser.displayName}</h2>
                    <div className="admin-toolbar">
                      <button type="button" className="admin-secondary-button" onClick={() => void handleToggleBlock(selectedUser)}>
                        {selectedUser.blocked ? 'Разблокировать' : 'Заблокировать'}
                      </button>
                      <button type="button" className="admin-primary-button" onClick={() => void handleTogglePremium(selectedUser)}>
                        {selectedUser.premium ? 'Снять premium' : 'Выдать premium'}
                      </button>
                    </div>
                  </div>

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
                      <dt>Status</dt>
                      <dd>{selectedUser.status || 'Нет статуса'}</dd>
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
                  </dl>
                </>
              ) : (
                <div className="admin-empty-state">Выберите пользователя слева.</div>
              )}
            </div>
          </section>
        ) : null}

        {section === 'reports' ? (
          <section className="admin-panel admin-two-column">
            <div className="admin-list-panel">
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

            <div className="admin-detail-panel">
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
              placeholder="Поиск по owner, label или media URL"
              value={mediaQuery}
              onChange={(event) => setMediaQuery(event.target.value)}
            />

            <div className="admin-table">
              <div className="admin-table-row admin-table-head">
                <span>Type</span>
                <span>Owner</span>
                <span>Entity</span>
                <span>Size</span>
                <span>Actions</span>
              </div>
              {mediaItems.map((item) => (
                <div key={`${item.entityType}-${item.mediaUrl}-${item.ownerIdentifier}`} className="admin-table-row">
                  <span>{item.kind}</span>
                  <span>{item.ownerIdentifier}</span>
                  <span>{item.entityLabel}</span>
                  <span>{formatBytes(item.size)}</span>
                  <span className="admin-table-actions">
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

        {section === 'audit' ? (
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <h2>Audit Log</h2>
              <button type="button" className="admin-secondary-button" onClick={() => void refreshAuditLog()}>
                Обновить
              </button>
            </div>

            <div className="admin-table">
              <div className="admin-table-row admin-table-head">
                <span>When</span>
                <span>Actor</span>
                <span>Action</span>
                <span>Target</span>
                <span>Summary</span>
              </div>
              {auditEntries.map((entry) => (
                <div key={entry.id} className="admin-table-row">
                  <span>{formatDateTime(entry.createdAt)}</span>
                  <span>{`${entry.actorDisplayName} · ${entry.actorRole}`}</span>
                  <span>{entry.action}</span>
                  <span>{`${entry.targetType}:${entry.targetId}`}</span>
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
