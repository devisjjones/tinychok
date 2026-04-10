import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type {
  AdminAuditCsvExportBody,
  AdminAuditLogResponse,
  AdminBootstrapResponse,
  AdminContentCsvExportBody,
  AdminCsvExportResponse,
  AdminDialogsResponse,
  AdminDialogDetailResponse,
  AdminDialogLookupBody,
  AdminEntityArchiveToggleBody,
  AdminIpLogCsvExportBody,
  AdminLegalExportBody,
  AdminStorageArchiveToggleBody,
  AdminStorageExportBody,
  AdminStorageExportJobResponse,
  AdminStorageExportJobStartBody,
  AdminStorageExportMode,
  AdminUserMediaExportBody,
  AdminManagedChannelsResponse,
  AdminManagedGroupsResponse,
  AdminMediaDownloadBody,
  AdminMediaDownloadResponse,
  AdminMediaActionBody,
  AdminMediaListResponse,
  AdminPermission,
  AdminReportActionBody,
  AdminReportDetailResponse,
  AdminReportNoteBody,
  AdminReportViewBody,
  AdminReportViewResponse,
  AdminReportsResponse,
  AdminSupportTicketDetailResponse,
  AdminSupportTicketReplyBody,
  AdminSupportTicketsResponse,
  AdminUserAvatarBody,
  AdminUserAvatarResponse,
  AdminUserBlockBody,
  AdminUserReportIntakeBody,
  AdminUserPremiumBody,
  AdminUsersResponse,
  AdminThreadsResponse,
  AdminThreadArchiveToggleBody,
  AdminThreadCsvExportBody,
} from '../../src/shared/backend'
import { getAdminPermissionsForRole, hasAdminPermission } from './admin-permissions'
import { runtimeConfig } from './config'
import type { AppStore } from './store-contract'

function getBearerToken(request: FastifyRequest) {
  const headerValue = request.headers.authorization
  if (!headerValue?.startsWith('Bearer ')) return null
  return headerValue.slice('Bearer '.length).trim()
}

function parseJsonPayload<T>(value: unknown) {
  return (value ?? {}) as T
}

function buildAttachmentContentDisposition(fileName: string) {
  const normalized = (fileName || 'download.zip').trim() || 'download.zip'
  const asciiFallback = normalized
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]+/g, '-')
    .replace(/["\\;]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'download.zip'
  const encodedName = encodeURIComponent(normalized)
    .replace(/['()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A')

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
}

type AdminStorageExportJobRecord = {
  actorIdentifier: string
  buffer?: Buffer
  cleanupTimer?: ReturnType<typeof setTimeout>
  createdAt: string
  errorMessage?: string
  failedFiles: number
  fileCount: number
  fileName?: string
  id: string
  mode: AdminStorageExportMode
  phase: 'preparing' | 'zipping' | null
  processedItems: number
  status: 'running' | 'ready' | 'cancelled' | 'failed'
  subjectId: string
  subjectKind: AdminStorageExportJobStartBody['subjectKind']
  totalItems: number
  updatedAt: string
  abortController: AbortController
}

const adminStorageExportJobs = new Map<string, AdminStorageExportJobRecord>()
const adminStorageExportJobTtlMs = 10 * 60 * 1000
const adminStorageExportCancelledMessage = 'Подготовка архива отменена.'

function getStorageExportPermission(mode: AdminStorageExportMode): AdminPermission {
  return mode === 'archive' ? 'users.archive.export' : 'users.media.export'
}

function computeAdminStorageExportJobProgressPercent(job: AdminStorageExportJobRecord) {
  if (job.status === 'ready') return 100
  if (job.phase === 'zipping') return 95
  if (job.totalItems <= 0) return 12
  return Math.max(5, Math.min(90, Math.round((job.processedItems / job.totalItems) * 90)))
}

function serializeAdminStorageExportJob(job: AdminStorageExportJobRecord): AdminStorageExportJobResponse {
  return {
    createdAt: job.createdAt,
    errorMessage: job.errorMessage,
    failedFiles: job.failedFiles,
    fileCount: job.fileCount,
    fileName: job.fileName,
    jobId: job.id,
    mode: job.mode,
    phase: job.phase,
    processedItems: job.processedItems,
    progressPercent: computeAdminStorageExportJobProgressPercent(job),
    status: job.status,
    subjectId: job.subjectId,
    subjectKind: job.subjectKind,
    totalItems: job.totalItems,
    updatedAt: job.updatedAt,
  }
}

function touchAdminStorageExportJob(
  job: AdminStorageExportJobRecord,
  patch: Partial<
    Pick<
      AdminStorageExportJobRecord,
      'buffer' | 'errorMessage' | 'failedFiles' | 'fileCount' | 'fileName' | 'phase' | 'processedItems' | 'status' | 'totalItems'
    >
  >,
) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() })
}

function scheduleAdminStorageExportJobCleanup(jobId: string, delayMs = adminStorageExportJobTtlMs) {
  const job = adminStorageExportJobs.get(jobId)
  if (!job) return
  if (job.cleanupTimer) {
    clearTimeout(job.cleanupTimer)
  }
  job.cleanupTimer = setTimeout(() => {
    const current = adminStorageExportJobs.get(jobId)
    if (current?.cleanupTimer) {
      clearTimeout(current.cleanupTimer)
    }
    adminStorageExportJobs.delete(jobId)
  }, delayMs)
}

function sendError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Внутренняя ошибка сервера.'
  return reply.code(400).send({ message })
}

function getRouteParam(request: FastifyRequest, key: string) {
  return decodeURIComponent(
    ((request.params as Record<string, string | undefined> | undefined)?.[key] ?? '').trim(),
  )
}

function getNonNegativeNumericRouteParam(request: FastifyRequest, key: string) {
  const rawValue = (request.params as Record<string, string | undefined> | undefined)?.[key]
  const numericValue = Number(rawValue)

  if (!rawValue || !Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error('Некорректный идентификатор ресурса.')
  }

  return numericValue
}

function getSearchQuery(request: FastifyRequest) {
  return ((request.query as Record<string, string | undefined> | undefined)?.q ?? '').trim()
}

function getStatusQuery(request: FastifyRequest) {
  const status = ((request.query as Record<string, string | undefined> | undefined)?.status ?? '').trim()
  return status === 'closed' ? 'closed' : status === 'open' ? 'open' : undefined
}

function getAuditQuery(request: FastifyRequest) {
  const query = (request.query as Record<string, string | undefined> | undefined) ?? {}
  return {
    actorIdentifier: (query.actor ?? '').trim() || undefined,
    from: (query.from ?? '').trim() || undefined,
    targetIdentifier: (query.target ?? '').trim() || undefined,
    to: (query.to ?? '').trim() || undefined,
  }
}

function getOwnerQuery(request: FastifyRequest) {
  return ((request.query as Record<string, string | undefined> | undefined)?.owner ?? '').trim()
}

function toOrigin(value: string | undefined) {
  if (!value) return null

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function getAdminBannerLabel() {
  if (runtimeConfig.environment === 'production') {
    return 'PRODUCTION' as const
  }

  if (runtimeConfig.environment === 'staging') {
    return 'STAGING' as const
  }

  return 'DEVELOPMENT' as const
}

function getAdminAllowedOrigins() {
  return [
    ...runtimeConfig.allowedOrigins,
    toOrigin(runtimeConfig.publicUrls.adminStagingBaseUrl),
    toOrigin(runtimeConfig.publicUrls.adminProductionBaseUrl),
  ].filter((value): value is string => Boolean(value))
}

function assertAdminRequestAllowed(request: FastifyRequest) {
  if (!runtimeConfig.admin.enabled) {
    throw new Error('Admin panel выключена в текущей среде.')
  }

  const origin = toOrigin(request.headers.origin) ?? toOrigin(request.headers.referer)
  if (!origin) {
    return
  }

  if (!getAdminAllowedOrigins().includes(origin)) {
    throw new Error('Запрос к admin API пришёл с неподходящего origin.')
  }
}

function requireAdminActor(
  store: AppStore,
  request: FastifyRequest,
  reply: FastifyReply,
  permission: AdminPermission,
) {
  assertAdminRequestAllowed(request)

  const token = getBearerToken(request)
  if (!token) {
    reply.code(401).send({ message: 'Не найдена активная staff-сессия.' })
    return null
  }

  const actor = store.getAdminActorByToken(token)
  if (!actor) {
    reply.code(403).send({ message: 'Доступ к admin panel разрешён только staff-аккаунтам.' })
    return null
  }

  const permissions = getAdminPermissionsForRole(actor.role)
  if (!hasAdminPermission(actor.role, permission)) {
    reply.code(403).send({ message: 'Недостаточно прав для этого admin-действия.' })
    return null
  }

  return {
    permissions,
    token,
  }
}

function requireAdminStorageExportJobActor(
  store: AppStore,
  request: FastifyRequest,
  reply: FastifyReply,
  job: AdminStorageExportJobRecord,
) {
  const auth = requireAdminActor(store, request, reply, getStorageExportPermission(job.mode))
  if (!auth) return null
  const actor = store.getAdminActorByToken(auth.token)
  if (!actor || actor.identifier !== job.actorIdentifier) {
    reply.code(403).send({ message: 'Эта выгрузка принадлежит другому owner-аккаунту.' })
    return null
  }
  return auth
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  store: AppStore,
  broadcastSnapshotsForIdentifiers: (identifiers: string[]) => void | Promise<void>,
) {
  app.get('/api/admin/bootstrap', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'admin.access')
      if (!auth) return reply

      const actor = store.getAdminActorByToken(auth.token)!
      return {
        actor: {
          ...actor,
          permissions: auth.permissions,
        },
        config: {
          bannerLabel: getAdminBannerLabel(),
          enabled: runtimeConfig.admin.enabled,
          environment: runtimeConfig.environment,
          hosts: [runtimeConfig.admin.hosts.staging, runtimeConfig.admin.hosts.production],
        },
      } satisfies AdminBootstrapResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/dashboard', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'dashboard.read')
      if (!auth) return reply

      return store.getAdminDashboard()
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/users', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.read')
      if (!auth) return reply

      return store.adminSearchUsers(getSearchQuery(request)) satisfies AdminUsersResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/users/:identifier', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.read')
      if (!auth) return reply

      return store.adminGetUser(getRouteParam(request, 'identifier'))
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/users/:identifier/status-history/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.read')
      if (!auth) return reply

      return await store.adminExportUserStatusHistoryCsv(
        auth.token,
        getRouteParam(request, 'identifier'),
      ) satisfies AdminCsvExportResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/users/:identifier/avatar', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminUserAvatarBody>(request.body)
      const payload = await store.adminViewUserAvatar(
        auth.token,
        getRouteParam(request, 'identifier'),
        body.reason,
      )
      return payload satisfies AdminUserAvatarResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/users/:identifier/block', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.block')
      if (!auth) return reply

      const body = parseJsonPayload<AdminUserBlockBody>(request.body)
      const identifier = getRouteParam(request, 'identifier')
      await store.adminSetUserBlocked(auth.token, identifier, {
        blocked: true,
        reason: body.reason,
      })
      return store.adminGetUser(identifier)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.delete('/api/admin/users/:identifier/block', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.block')
      if (!auth) return reply

      const identifier = getRouteParam(request, 'identifier')
      await store.adminSetUserBlocked(auth.token, identifier, {
        blocked: false,
      })
      return store.adminGetUser(identifier)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/users/:identifier/unblock', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.block')
      if (!auth) return reply

      const body = parseJsonPayload<AdminUserBlockBody>(request.body)
      const identifier = getRouteParam(request, 'identifier')
      await store.adminSetUserBlocked(auth.token, identifier, {
        blocked: false,
        reason: body.reason,
      })
      return store.adminGetUser(identifier)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/users/:identifier/premium', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.premium.write')
      if (!auth) return reply

      const body = parseJsonPayload<AdminUserPremiumBody>(request.body)
      const identifier = getRouteParam(request, 'identifier')
      await store.adminSetUserPremium(auth.token, identifier, body)
      return store.adminGetUser(identifier)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/users/:identifier/report-intake', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.block')
      if (!auth) return reply

      const body = parseJsonPayload<AdminUserReportIntakeBody>(request.body)
      const identifier = getRouteParam(request, 'identifier')
      await store.adminSetUserReportsMutedInAdmin(auth.token, identifier, body)
      return store.adminGetUser(identifier)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/reports', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'reports.read')
      if (!auth) return reply

      return {
        reports: store.adminListReports(getStatusQuery(request)),
      } satisfies AdminReportsResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/reports/:reportId', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'reports.read')
      if (!auth) return reply

      return {
        report: await store.adminGetReport(auth.token, getRouteParam(request, 'reportId')),
      } satisfies AdminReportDetailResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/reports/:reportId/notes', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'reports.note')
      if (!auth) return reply

      const body = parseJsonPayload<AdminReportNoteBody>(request.body)
      return {
        report: await store.adminAddReportNote(auth.token, getRouteParam(request, 'reportId'), body.text),
      } satisfies AdminReportDetailResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/reports/:reportId/view', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'reports.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminReportViewBody>(request.body)
      return await store.adminViewReportEntity(
        auth.token,
        getRouteParam(request, 'reportId'),
        body.reason,
      ) satisfies AdminReportViewResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/reports/:reportId/actions', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'reports.resolve')
      if (!auth) return reply

      const body = parseJsonPayload<AdminReportActionBody>(request.body)
      return {
        report: await store.adminApplyReportAction(auth.token, getRouteParam(request, 'reportId'), body),
      } satisfies AdminReportDetailResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/media', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'media.read')
      if (!auth) return reply

      return {
        items: store.adminListMedia(getSearchQuery(request)),
      } satisfies AdminMediaListResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/channels', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'media.read')
      if (!auth) return reply

      return {
        channels: store.adminListChannels(getSearchQuery(request)),
      } satisfies AdminManagedChannelsResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/groups', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'media.read')
      if (!auth) return reply

      return {
        groups: store.adminListGroups(getSearchQuery(request)),
      } satisfies AdminManagedGroupsResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/threads', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'media.read')
      if (!auth) return reply

      return {
        threads: store.adminListThreads(getSearchQuery(request)),
      } satisfies AdminThreadsResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/support-tickets', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'reports.read')
      if (!auth) return reply

      return {
        tickets: store.adminListSupportTickets(getSearchQuery(request)),
      } satisfies AdminSupportTicketsResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/support-tickets/:ticketId', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'reports.read')
      if (!auth) return reply

      const ticket = await store.adminGetSupportTicket(
        auth.token,
        getNonNegativeNumericRouteParam(request, 'ticketId'),
      )
      return {
        ticket,
      } satisfies AdminSupportTicketDetailResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/support-tickets/:ticketId/reply', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'reports.note')
      if (!auth) return reply

      const payload = await store.adminReplySupportTicket(
        auth.token,
        getNonNegativeNumericRouteParam(request, 'ticketId'),
        parseJsonPayload<AdminSupportTicketReplyBody>(request.body),
      )
      await broadcastSnapshotsForIdentifiers(payload.broadcastIdentifiers)
      return {
        ticket: payload.ticket,
      } satisfies AdminSupportTicketDetailResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/dialogs', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.read')
      if (!auth) return reply

      return {
        dialogs: store.adminListDialogs(getOwnerQuery(request), getSearchQuery(request)),
      } satisfies AdminDialogsResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/channels/:handle/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'media.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminContentCsvExportBody>(request.body)
      return await store.adminExportChannelCsv(
        auth.token,
        getRouteParam(request, 'handle'),
        body.reason,
      ) satisfies AdminCsvExportResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/groups/:groupId/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'media.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminContentCsvExportBody>(request.body)
      return await store.adminExportGroupCsv(
        auth.token,
        getRouteParam(request, 'groupId'),
        body.reason,
      ) satisfies AdminCsvExportResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/groups/:groupId/participants/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminContentCsvExportBody>(request.body)
      return await store.adminExportGroupParticipantsCsv(
        auth.token,
        getRouteParam(request, 'groupId'),
        body.reason,
      ) satisfies AdminCsvExportResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/groups/:groupId/archive-toggle', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'groups.archive.manage')
      if (!auth) return reply

      const body = parseJsonPayload<AdminEntityArchiveToggleBody>(request.body)
      const payload = await store.adminSetGroupArchived(
        auth.token,
        getRouteParam(request, 'groupId'),
        body,
      )
      await broadcastSnapshotsForIdentifiers(payload.broadcastIdentifiers)
      return {
        groups: payload.groups,
      } satisfies AdminManagedGroupsResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/channels/:handle/subscribers/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminContentCsvExportBody>(request.body)
      return await store.adminExportChannelSubscribersCsv(
        auth.token,
        getRouteParam(request, 'handle'),
        body.reason,
      ) satisfies AdminCsvExportResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/channels/:handle/archive-toggle', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'channels.archive.manage')
      if (!auth) return reply

      const body = parseJsonPayload<AdminEntityArchiveToggleBody>(request.body)
      const payload = await store.adminSetManagedChannelArchived(
        auth.token,
        getRouteParam(request, 'handle'),
        body,
      )
      await broadcastSnapshotsForIdentifiers(payload.broadcastIdentifiers)
      return {
        channels: payload.channels,
      } satisfies AdminManagedChannelsResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/threads/:threadId/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'media.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminContentCsvExportBody>(request.body)
      return await store.adminExportThreadCsv(
        auth.token,
        getRouteParam(request, 'threadId'),
        body.reason,
      ) satisfies AdminCsvExportResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/threads/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'media.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminThreadCsvExportBody>(request.body)
      return await store.adminExportThreadCsv(
        auth.token,
        body.threadId,
        body.reason,
      ) satisfies AdminCsvExportResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/threads/:threadId/archive-toggle', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'threads.archive.manage')
      if (!auth) return reply

      const body = parseJsonPayload<AdminEntityArchiveToggleBody>(request.body)
      const payload = await store.adminSetThreadArchived(
        auth.token,
        getRouteParam(request, 'threadId'),
        body,
      )
      await broadcastSnapshotsForIdentifiers(payload.broadcastIdentifiers)
      return {
        threads: payload.threads,
      } satisfies AdminThreadsResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/threads/archive-toggle', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'threads.archive.manage')
      if (!auth) return reply

      const body = parseJsonPayload<AdminThreadArchiveToggleBody>(request.body)
      const payload = await store.adminSetThreadArchived(
        auth.token,
        body.threadId,
        body,
      )
      await broadcastSnapshotsForIdentifiers(payload.broadcastIdentifiers)
      return {
        threads: payload.threads,
      } satisfies AdminThreadsResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/dialogs/lookup', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminDialogLookupBody>(request.body)
      return {
        dialog: store.adminLookupDialog(body.ownerIdentifier, body.peerIdentifier),
      } satisfies AdminDialogDetailResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/dialogs/:sharedKey/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminContentCsvExportBody>(request.body)
      return await store.adminExportDialogCsv(
        auth.token,
        getRouteParam(request, 'sharedKey'),
        body.reason,
      ) satisfies AdminCsvExportResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/legal-export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'legal.export')
      if (!auth) return reply

      const body = parseJsonPayload<AdminLegalExportBody>(request.body)
      const payload = await store.adminExportLegalArchive(auth.token, body)
      reply.header('Content-Type', 'application/zip')
      reply.header('Content-Disposition', buildAttachmentContentDisposition(payload.fileName))
      return reply.send(payload.buffer)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/users/media-export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.media.export')
      if (!auth) return reply

      const body = parseJsonPayload<AdminUserMediaExportBody>(request.body)
      const payload = await store.adminExportUserMediaArchive(auth.token, body)
      reply.header('Content-Type', 'application/zip')
      reply.header('Content-Disposition', buildAttachmentContentDisposition(payload.fileName))
      return reply.send(payload.buffer)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/storage/export-jobs', async (request, reply) => {
    try {
      const body = parseJsonPayload<AdminStorageExportJobStartBody>(request.body)
      const mode: AdminStorageExportMode = body.mode === 'archive' ? 'archive' : 'current'
      const auth = requireAdminActor(store, request, reply, getStorageExportPermission(mode))
      if (!auth) return reply

      const actor = store.getAdminActorByToken(auth.token)
      if (!actor) {
        reply.code(403).send({ message: 'Доступ к admin panel разрешён только staff-аккаунтам.' })
        return reply
      }

      const now = new Date().toISOString()
      const jobId = randomUUID()
      const job: AdminStorageExportJobRecord = {
        abortController: new AbortController(),
        actorIdentifier: actor.identifier,
        createdAt: now,
        failedFiles: 0,
        fileCount: 0,
        id: jobId,
        mode,
        phase: 'preparing',
        processedItems: 0,
        status: 'running',
        subjectId: body.subjectId,
        subjectKind: body.subjectKind,
        totalItems: 0,
        updatedAt: now,
      }
      adminStorageExportJobs.set(jobId, job)

      void (async () => {
        try {
          const payload =
            mode === 'archive'
              ? await store.adminExportStorageArchive(auth.token, body, {
                  onProgress: (progress) => {
                    if (job.status !== 'running') return
                    touchAdminStorageExportJob(job, {
                      failedFiles: progress.failedFiles,
                      fileCount: progress.fileCount,
                      phase: progress.phase,
                      processedItems: progress.processedItems,
                      totalItems: progress.totalItems,
                    })
                  },
                  signal: job.abortController.signal,
                })
              : await store.adminExportCurrentStorage(auth.token, body, {
                  onProgress: (progress) => {
                    if (job.status !== 'running') return
                    touchAdminStorageExportJob(job, {
                      failedFiles: progress.failedFiles,
                      fileCount: progress.fileCount,
                      phase: progress.phase,
                      processedItems: progress.processedItems,
                      totalItems: progress.totalItems,
                    })
                  },
                  signal: job.abortController.signal,
                })

          if (job.abortController.signal.aborted || job.status === 'cancelled') {
            touchAdminStorageExportJob(job, {
              buffer: undefined,
              errorMessage: adminStorageExportCancelledMessage,
              phase: null,
              status: 'cancelled',
            })
            scheduleAdminStorageExportJobCleanup(jobId, 30_000)
            return
          }

          touchAdminStorageExportJob(job, {
            buffer: payload.buffer,
            fileName: payload.fileName,
            phase: null,
            status: 'ready',
          })
          scheduleAdminStorageExportJobCleanup(jobId)
        } catch (error) {
          if (job.abortController.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
            touchAdminStorageExportJob(job, {
              buffer: undefined,
              errorMessage: adminStorageExportCancelledMessage,
              phase: null,
              status: 'cancelled',
            })
            scheduleAdminStorageExportJobCleanup(jobId, 30_000)
            return
          }

          touchAdminStorageExportJob(job, {
            buffer: undefined,
            errorMessage: error instanceof Error ? error.message : 'Не удалось подготовить архив.',
            phase: null,
            status: 'failed',
          })
          scheduleAdminStorageExportJobCleanup(jobId, 60_000)
        }
      })()

      return serializeAdminStorageExportJob(job)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/storage/export-jobs/:jobId', async (request, reply) => {
    try {
      const job = adminStorageExportJobs.get(getRouteParam(request, 'jobId'))
      if (!job) {
        reply.code(404).send({ message: 'Выгрузка архива не найдена.' })
        return reply
      }
      const auth = requireAdminStorageExportJobActor(store, request, reply, job)
      if (!auth) return reply
      return serializeAdminStorageExportJob(job)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/storage/export-jobs/:jobId/cancel', async (request, reply) => {
    try {
      const job = adminStorageExportJobs.get(getRouteParam(request, 'jobId'))
      if (!job) {
        reply.code(404).send({ message: 'Выгрузка архива не найдена.' })
        return reply
      }
      const auth = requireAdminStorageExportJobActor(store, request, reply, job)
      if (!auth) return reply

      job.abortController.abort()
      touchAdminStorageExportJob(job, {
        buffer: undefined,
        errorMessage: adminStorageExportCancelledMessage,
        phase: null,
        status: 'cancelled',
      })
      scheduleAdminStorageExportJobCleanup(job.id, 15_000)
      return serializeAdminStorageExportJob(job)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/storage/export-jobs/:jobId/download', async (request, reply) => {
    try {
      const job = adminStorageExportJobs.get(getRouteParam(request, 'jobId'))
      if (!job) {
        reply.code(404).send({ message: 'Выгрузка архива не найдена.' })
        return reply
      }
      const auth = requireAdminStorageExportJobActor(store, request, reply, job)
      if (!auth) return reply
      if (job.status !== 'ready' || !job.buffer || !job.fileName) {
        throw new Error('Архив ещё не готов к скачиванию.')
      }

      const payload = job.buffer
      const fileName = job.fileName
      scheduleAdminStorageExportJobCleanup(job.id, 0)
      reply.header('Content-Type', 'application/zip')
      reply.header('Content-Disposition', buildAttachmentContentDisposition(fileName))
      return reply.send(payload)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/storage/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.media.export')
      if (!auth) return reply

      const body = parseJsonPayload<AdminStorageExportBody>(request.body)
      const payload = await store.adminExportCurrentStorage(auth.token, body)
      reply.header('Content-Type', 'application/zip')
      reply.header('Content-Disposition', buildAttachmentContentDisposition(payload.fileName))
      return reply.send(payload.buffer)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/storage/archive-export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.archive.export')
      if (!auth) return reply

      const body = parseJsonPayload<AdminStorageExportBody>(request.body)
      const payload = await store.adminExportStorageArchive(auth.token, body)
      reply.header('Content-Type', 'application/zip')
      reply.header('Content-Disposition', buildAttachmentContentDisposition(payload.fileName))
      return reply.send(payload.buffer)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/storage/archive-toggle', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.archive.manage')
      if (!auth) return reply

      const body = parseJsonPayload<AdminStorageArchiveToggleBody>(request.body)
      return await store.adminSetStorageArchiveUnlimited(auth.token, body)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/media/actions', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'media.moderate')
      if (!auth) return reply

      const body = parseJsonPayload<AdminMediaActionBody & { mediaUrl: string }>(request.body)
      return {
        items: await store.adminModerateMedia(auth.token, body.mediaUrl, body.action, body.reason),
      } satisfies AdminMediaListResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/media/download', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'media.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminMediaDownloadBody>(request.body)
      const payload = await store.adminGetMediaDownload(auth.token, body.mediaUrl, body.reason)
      return payload satisfies AdminMediaDownloadResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/audit-log', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'audit.read')
      if (!auth) return reply

      const filters = getAuditQuery(request)
      return {
        actors: store.adminListAuditActors(),
        entries: store.adminListAuditLogs(filters),
      } satisfies AdminAuditLogResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/audit-log/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'audit.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminAuditCsvExportBody>(request.body)
      return await store.adminExportAuditLogsCsv(auth.token, body) satisfies AdminCsvExportResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/ip-logs/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'ip.read')
      if (!auth) return reply

      const body = parseJsonPayload<AdminIpLogCsvExportBody>(request.body)
      return await store.adminExportIpLogsCsv(auth.token, body) satisfies AdminCsvExportResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
