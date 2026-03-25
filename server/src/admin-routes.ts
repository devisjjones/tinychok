import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type {
  AdminAuditLogResponse,
  AdminBootstrapResponse,
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
  AdminReportsResponse,
  AdminUserAvatarResponse,
  AdminUserBlockBody,
  AdminUserDetailResponse,
  AdminUserPremiumBody,
  AdminUsersResponse,
  AdminThreadsResponse,
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

function sendError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Внутренняя ошибка сервера.'
  return reply.code(400).send({ message })
}

function getRouteParam(request: FastifyRequest, key: string) {
  return decodeURIComponent(
    ((request.params as Record<string, string | undefined> | undefined)?.[key] ?? '').trim(),
  )
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

export async function registerAdminRoutes(app: FastifyInstance, store: AppStore) {
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

      return {
        users: store.adminSearchUsers(getSearchQuery(request)),
      } satisfies AdminUsersResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/users/:identifier', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.read')
      if (!auth) return reply

      return {
        user: store.adminGetUser(getRouteParam(request, 'identifier')),
      } satisfies AdminUserDetailResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/admin/users/:identifier/avatar', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.read')
      if (!auth) return reply

      const payload = await store.adminViewUserAvatar(
        auth.token,
        getRouteParam(request, 'identifier'),
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
      return {
        user: await store.adminSetUserBlocked(auth.token, getRouteParam(request, 'identifier'), {
          blocked: true,
          reason: body.reason,
        }),
      } satisfies AdminUserDetailResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.delete('/api/admin/users/:identifier/block', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.block')
      if (!auth) return reply

      return {
        user: await store.adminSetUserBlocked(auth.token, getRouteParam(request, 'identifier'), {
          blocked: false,
        }),
      } satisfies AdminUserDetailResponse
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/admin/users/:identifier/premium', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'users.premium.write')
      if (!auth) return reply

      const body = parseJsonPayload<AdminUserPremiumBody>(request.body)
      return {
        user: await store.adminSetUserPremium(auth.token, getRouteParam(request, 'identifier'), body),
      } satisfies AdminUserDetailResponse
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
      const payload = await store.adminGetMediaDownload(auth.token, body.mediaUrl)
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

  app.get('/api/admin/audit-log/export', async (request, reply) => {
    try {
      const auth = requireAdminActor(store, request, reply, 'audit.read')
      if (!auth) return reply

      const csv = await store.adminExportAuditLogsCsv(auth.token, getAuditQuery(request))
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', 'attachment; filename="tinychok-admin-audit.csv"')
      return reply.send(csv)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
