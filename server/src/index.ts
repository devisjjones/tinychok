import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import { randomUUID } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type WebSocket from 'ws'
import type {
  AppSnapshot,
  ClientRuntimeConfigResponse,
  CreateGroupBody,
  CreateManagedChannelBody,
  ChangePasswordBody,
  ChannelDiscoverySearchResponse,
  DeleteAccountBody,
  DeleteDialogMessageBody,
  DeleteStorageItemBody,
  DebugPremiumBody,
  DeleteDialogHistoryBody,
  DiscoverySearchResponse,
  DirectDialogHistoryResponse,
  GroupHistoryResponse,
  JoinGroupFromInviteResponse,
  InviteGroupMemberBody,
  InviteManagedChannelMembersBody,
  LoginPasswordBody,
  ManageGroupParticipantBody,
  ManageSubscriptionChannelSubscriberBody,
  OpenDirectDialogBody,
  ContactRequestActionResponse,
  OpenDirectDialogResponse,
  ResetPasswordBody,
  RegisterUserGifBody,
  ReportContactBody,
  ReportMediaBody,
  ReportSubscriptionChannelBody,
  RegisterBody,
  SaveSnapshotBody,
  SendContactRequestBody,
  SetDialogFavoriteBody,
  SetDialogPinnedMessageBody,
  SendDirectMessageBody,
  SendGroupMessageBody,
  SendManagedChannelPostBody,
  SendGroupThreadCommentBody,
  SendSupportTicketBody,
  SendSupportTicketCommentBody,
  SendSubscriptionChannelThreadCommentBody,
  SubscribeToChannelResponse,
  SetPasswordBody,
  SubscriptionChannelHistoryResponse,
  SubscriptionChannelPreviewResponse,
  TransferManagedChannelBody,
  UpdateDialogBody,
  UpdateGroupBody,
  UpdateManagedChannelBody,
  UpdateSubscriptionChannelBody,
  UpdateSessionBody,
  UploadMediaKind,
} from '../../src/shared/backend'
import type { RealtimeEvent } from '../../src/shared/backend'
import type { AnalyticsBatchBody } from '../../src/shared/analytics'
import {
  messageFileUploadMaxSizeBytes,
  premiumMessageFileUploadMaxSizeBytes,
} from '../../src/shared/constants'
import { ingestAnalyticsBatch, parseAnalyticsBatch } from './analytics'
import { registerAdminRoutes } from './admin-routes'
import { parseRequestCodeBody, parseVerifyCodeBody } from './auth-route-validation'
import { verifyCaptchaOrThrow } from './captcha'
import { runtimeConfig } from './config'
import { getErrorStatusCode } from './http-error'
import {
  deleteStoredMediaByUrl,
  getMediaBackend,
  getMediaObjectSignedUrl,
  getMediaRootPath,
  getUploadKindConfig,
  storeMediaBuffer,
} from './media'
import { createStore } from './store-factory'

function getBearerToken(request: FastifyRequest) {
  const headerValue = request.headers.authorization
  if (!headerValue?.startsWith('Bearer ')) return null
  return headerValue.slice('Bearer '.length).trim()
}

function sendError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Внутренняя ошибка сервера.'
  return reply.code(getErrorStatusCode(error)).send({ message })
}

function parseJsonPayload<T>(value: unknown) {
  return (value ?? {}) as T
}

function getNumericRouteParam(request: FastifyRequest, key: string) {
  const rawValue = (request.params as Record<string, string | undefined> | undefined)?.[key]
  const numericValue = Number(rawValue)

  if (!rawValue || !Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error('Некорректный идентификатор ресурса.')
  }

  return numericValue
}

function getNonNegativeNumericRouteParam(request: FastifyRequest, key: string) {
  const rawValue = (request.params as Record<string, string | undefined> | undefined)?.[key]
  const numericValue = Number(rawValue)

  if (!rawValue || !Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error('Некорректный идентификатор ресурса.')
  }

  return numericValue
}

function getPositiveNumericQueryParam(request: FastifyRequest, key: string) {
  const rawValue = (request.query as Record<string, string | undefined> | undefined)?.[key]
  const numericValue = Number(rawValue)

  if (!rawValue || !Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error('Некорректный идентификатор истории.')
  }

  return numericValue
}

function getRouteParam(request: FastifyRequest, key: string) {
  return decodeURIComponent(
    ((request.params as Record<string, string | undefined> | undefined)?.[key] ?? '').trim(),
  )
}

function getUploadKind(request: FastifyRequest): UploadMediaKind {
  const rawKind = (request.query as Record<string, string | undefined> | undefined)?.kind

  if (
    rawKind === 'attachment' ||
    rawKind === 'channel-avatar' ||
    rawKind === 'group-avatar' ||
    rawKind === 'profile-avatar' ||
    rawKind === 'user-gif'
  ) {
    return rawKind
  }

  throw new Error('Некорректный тип загрузки.')
}

function getSearchQuery(request: FastifyRequest) {
  return ((request.query as Record<string, string | undefined> | undefined)?.q ?? '').trim()
}

function normalizeUploadMimeType(mimeType: string | undefined) {
  return mimeType?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

const ATTACHMENT_EXTENSION_MIME_TYPE_MAP: Record<string, string> = {
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.webm': 'video/webm',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
}

function resolveAttachmentUploadMimeType(fileName: string, mimeType: string | undefined) {
  const normalizedMimeType = normalizeUploadMimeType(mimeType)

  if (normalizedMimeType && normalizedMimeType !== 'application/octet-stream') {
    return normalizedMimeType
  }

  const extensionMatch = /\.[^.]+$/u.exec(fileName.trim().toLowerCase())
  return ATTACHMENT_EXTENSION_MIME_TYPE_MAP[extensionMatch?.[0] ?? ''] ?? normalizedMimeType
}

function getRequestedMediaKey(request: FastifyRequest) {
  const rawKey = (request.params as Record<string, string | undefined> | undefined)?.['*']
  const storageKey = rawKey?.replace(/^\/+/u, '').trim()

  if (!storageKey || storageKey.includes('..')) {
    throw new Error('Некорректный путь к media-объекту.')
  }

  return storageKey
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

function isLocalOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

const { metadata: storeMetadata, store } = await createStore()
type LiveSocket = {
  id: string
  isAlive: boolean
  socket: WebSocket
}

const socketsByToken = new Map<string, Map<string, LiveSocket>>()

function isAllowedRealtimeOrigin(origin: string | undefined) {
  if (!origin) {
    return false
  }

  return isLocalOrigin(origin) || runtimeConfig.allowedOrigins.includes(origin)
}

function addLiveSocket(token: string, liveSocket: LiveSocket) {
  const currentSockets = socketsByToken.get(token) ?? new Map<string, LiveSocket>()
  currentSockets.set(liveSocket.id, liveSocket)
  socketsByToken.set(token, currentSockets)
}

function dropLiveSocketByToken(
  token: string,
  socketId?: string,
  options?: {
    close?: boolean
    code?: number
    reason?: string
  },
) {
  const liveSockets = socketsByToken.get(token)
  if (!liveSockets || liveSockets.size === 0) {
    return
  }

  const socketsToDrop = socketId
    ? [liveSockets.get(socketId)].filter((value): value is LiveSocket => Boolean(value))
    : [...liveSockets.values()]

  for (const liveSocket of socketsToDrop) {
    liveSockets.delete(liveSocket.id)
    if (options?.close) {
      liveSocket.socket.close(options.code, options.reason)
    }
  }

  if (liveSockets.size === 0) {
    socketsByToken.delete(token)
  }
}

function closeLiveSocketsForToken(token: string, options?: { code?: number; reason?: string }) {
  dropLiveSocketByToken(token, undefined, {
    close: true,
    code: options?.code,
    reason: options?.reason,
  })
}

function hasLiveSocketsForToken(token: string) {
  const liveSockets = socketsByToken.get(token)
  return Boolean(liveSockets && liveSockets.size > 0)
}

function broadcastPresenceChangesForToken(token: string, mode: 'online' | 'offline') {
  const identifiers =
    mode === 'online'
      ? store.markSessionLive(token)
      : store.markSessionOffline(token)

  if (identifiers.length > 0) {
    broadcastSnapshotsForIdentifiers(identifiers)
  }
}

function broadcastSnapshotsForIdentifier(identifier: string) {
  const tokens = store.listTokensByIdentifier(identifier)
  if (tokens.length === 0) {
    return
  }

  // Realtime fan-out must not rebuild a full snapshot per token for the same user.
  // We build the shared snapshot body once per identifier and only patch sessionToken per connection.
  const baseSnapshot = store.getRealtimeSnapshotByIdentifier(identifier)
  if (!baseSnapshot) {
    return
  }

  for (const token of tokens) {
    const liveSockets = socketsByToken.get(token)
    if (!liveSockets || liveSockets.size === 0) continue

    const payload: RealtimeEvent = {
      snapshot: {
        ...baseSnapshot,
        session: {
          ...baseSnapshot.session,
          sessionToken: token,
        },
      },
      type: 'snapshot.updated',
    }

    for (const liveSocket of liveSockets.values()) {
      const socket = liveSocket.socket
      if (socket.readyState !== socket.OPEN) continue
      socket.send(JSON.stringify(payload))
    }
  }
}

function broadcastSnapshotsForIdentifiers(identifiers: string[]) {
  for (const identifier of [...new Set(identifiers)]) {
    broadcastSnapshotsForIdentifier(identifier)
  }
}

const app = Fastify({
  logger: true,
  trustProxy: runtimeConfig.server.trustProxy,
})

void store.cleanupExpiredPendingMediaUploads().catch((error) => {
  app.log.error(error)
})
setInterval(() => {
  void store.cleanupExpiredPendingMediaUploads().catch((error) => {
    app.log.error(error)
  })
}, 60 * 60 * 1000)

void store.cleanupExpiredRetentionData().catch((error) => {
  app.log.error(error)
})
setInterval(() => {
  void store.cleanupExpiredRetentionData().catch((error) => {
    app.log.error(error)
  })
}, runtimeConfig.storage.retention.cleanupIntervalHours * 60 * 60 * 1000)

setInterval(() => {
  for (const [token, liveSockets] of socketsByToken) {
    if (!store.getIdentifierByToken(token)) {
      const staleSockets = [...liveSockets.values()]
      closeLiveSocketsForToken(token)
      broadcastPresenceChangesForToken(token, 'offline')
      for (const liveSocket of staleSockets) {
        liveSocket.socket.terminate()
      }
      continue
    }

    for (const liveSocket of liveSockets.values()) {
      const socket = liveSocket.socket

      if (socket.readyState !== socket.OPEN) {
        dropLiveSocketByToken(token, liveSocket.id)
        if (!hasLiveSocketsForToken(token)) {
          broadcastPresenceChangesForToken(token, 'offline')
        }
        continue
      }

      if (!liveSocket.isAlive) {
        dropLiveSocketByToken(token, liveSocket.id)
        if (!hasLiveSocketsForToken(token)) {
          broadcastPresenceChangesForToken(token, 'offline')
        }
        socket.terminate()
        continue
      }

      liveSocket.isAlive = false
      socket.ping()
    }
  }
}, 30 * 1000)

await app.register(cors, {
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  origin(origin, callback) {
    if (!origin || isLocalOrigin(origin) || runtimeConfig.allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(null, false)
  },
})

await app.register(multipart)
await app.register(websocket)

app.addHook('preHandler', async (request) => {
  const pathname = request.url.split('?', 1)[0] ?? request.url
  if (!pathname.startsWith('/api/')) {
    return
  }

  const token = getBearerToken(request)
  if (!token) {
    return
  }

  await store.recordSessionAccessByToken(token, {
    ip: request.ip,
    source: 'http-api',
    userAgent: request.headers['user-agent'],
  })
})

function mapMediaUploadError(kind: UploadMediaKind, error: unknown) {
  if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
    if (kind === 'user-gif') {
      return new Error('GIF слишком большая. Максимальный размер 5 МБ.')
    }

    return new Error('Файл слишком большой для этого действия.')
  }

  if (
    error instanceof app.multipartErrors.FilesLimitError ||
    error instanceof app.multipartErrors.PartsLimitError ||
    error instanceof app.multipartErrors.FieldsLimitError ||
    error instanceof app.multipartErrors.InvalidMultipartContentTypeError
  ) {
    return new Error('Не удалось прочитать загружаемый файл. Попробуйте выбрать его заново.')
  }

  if (error instanceof Error) {
    if (
      error.message === 'Unexpected end of multipart data' ||
      error.message === 'Multipart: Boundary not found'
    ) {
      return new Error('Не удалось прочитать загружаемый файл. Попробуйте выбрать его заново.')
    }
  }

  return error
}

if (getMediaBackend() === 'local') {
  await app.register(fastifyStatic, {
    prefix: '/uploads/',
    root: getMediaRootPath(),
  })
} else {
  app.get('/uploads/*', async (request, reply) => {
    try {
      const signedUrl = await getMediaObjectSignedUrl(getRequestedMediaKey(request))
      return reply.redirect(signedUrl)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}

app.get('/healthz', async () => ({ status: 'ok' }))

app.get('/readyz', async () => ({
  environment: runtimeConfig.environment,
  publicUrls: runtimeConfig.publicUrls,
  server: runtimeConfig.server,
  storage: {
    mediaBackend: getMediaBackend(),
    mode: storeMetadata.mode,
    layout: storeMetadata.storageLayout ?? 'state-store',
    stateTableName: storeMetadata.stateTableName ?? null,
  },
  storageBootstrapSource: storeMetadata.bootstrapSource ?? null,
  status: 'ok',
}))

app.get('/api/client-config', async () => ({
  analytics: {
    enabled: runtimeConfig.analytics.enabled,
    flushIntervalMs: runtimeConfig.analytics.flushIntervalMs,
    maxBatchSize: runtimeConfig.analytics.maxBatchSize,
    metricaCounterId: runtimeConfig.analytics.metricaCounterId,
    provider: runtimeConfig.analytics.provider,
  },
  admin: {
    bannerLabel: getAdminBannerLabel(),
    enabled: runtimeConfig.admin.enabled,
    environment: runtimeConfig.environment,
    hosts: [runtimeConfig.admin.hosts.staging, runtimeConfig.admin.hosts.production],
  },
  captcha: {
    enabled: runtimeConfig.auth.captcha.provider !== 'disabled',
    provider: runtimeConfig.auth.captcha.provider,
    siteKey: runtimeConfig.auth.captcha.siteKey,
  },
}) satisfies ClientRuntimeConfigResponse)

app.post('/api/auth/request-code', async (request, reply) => {
  try {
    const body = parseRequestCodeBody(request.body)
    const { entryPoint, flow } = body
    const captchaRequired = entryPoint === 'admin' || flow === 'default' || flow === 'password-reset'

    if (captchaRequired) {
      await verifyCaptchaOrThrow({
        action: 'auth.request-code',
        remoteIp: request.ip,
        token: body.captchaToken,
      })
    }

    return await store.requestCode(body.identifier ?? '', {
      entryPoint,
      flow,
      ip: request.ip,
    })
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/auth/verify-code', async (request, reply) => {
  try {
    const body = parseVerifyCodeBody(request.body)
    return await store.verifyCode(body.identifier ?? '', body.code ?? '', {
      accessContext: {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
      entryPoint: body.entryPoint,
    })
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/auth/login-password', async (request, reply) => {
  try {
    const body = parseJsonPayload<LoginPasswordBody>(request.body)
    const passwordCaptchaRequired = store.shouldRequirePasswordLoginCaptcha(body.identifier ?? '', request.ip)

    if (passwordCaptchaRequired) {
      await verifyCaptchaOrThrow({
        action: 'auth.login-password',
        remoteIp: request.ip,
        token: body.captchaToken,
      })
    }

    const snapshot = await store.loginWithPassword(body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    }, {
      captchaVerified: passwordCaptchaRequired,
    })
    return { snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/auth/register', async (request, reply) => {
  try {
    const body = parseJsonPayload<RegisterBody>(request.body)
    const snapshot = await store.registerAccount(body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    })
    return { snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/auth/set-password', async (request, reply) => {
  try {
    const body = parseJsonPayload<SetPasswordBody>(request.body)
    const result = await store.setPasswordAfterCode(body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    })
    for (const revokedToken of result.revokedTokens) {
      closeLiveSocketsForToken(revokedToken, { code: 4003, reason: 'Session revoked' })
    }
    broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/auth/reset-password', async (request, reply) => {
  try {
    const body = parseJsonPayload<ResetPasswordBody>(request.body)
    const result = await store.resetPasswordAfterCode(body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    })
    for (const revokedToken of result.revokedTokens) {
      closeLiveSocketsForToken(revokedToken, { code: 4003, reason: 'Session revoked' })
    }
    broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/session/change-password', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<ChangePasswordBody>(request.body)
    const result = await store.changePassword(token, body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    })
    for (const revokedToken of result.revokedTokens) {
      closeLiveSocketsForToken(revokedToken, { code: 4003, reason: 'Session revoked' })
    }
    broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/session/delete-account', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<DeleteAccountBody>(request.body)
    return await store.deleteAccountSelfService(token, body)
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/analytics/events', async (request, reply) => {
  try {
    const token = getBearerToken(request)
    const identifier = token ? store.getIdentifierByToken(token) : null
    const events = parseAnalyticsBatch(request.body as AnalyticsBatchBody)

    if (events.length === 0) {
      return reply.code(202).send({ accepted: 0 })
    }

    await ingestAnalyticsBatch(app.log, events, {
      identifier,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    })

    return reply.code(202).send({ accepted: events.length })
  } catch (error) {
    return sendError(reply, error)
  }
})

app.get('/api/bootstrap', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  const snapshot = store.getSnapshotByToken(token)
  if (!snapshot) {
    return reply.code(401).send({ message: 'Сессия устарела. Войдите снова.' })
  }

  return snapshot
})

app.post('/api/logout', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const result = await store.logoutCurrentSession(token)
    closeLiveSocketsForToken(token, { code: 4003, reason: 'Logged out' })
    broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { ok: true as const }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.get('/api/discovery', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const results = store.searchAccounts(token, getSearchQuery(request))
    return { results } satisfies DiscoverySearchResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.get('/api/channel-discovery', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const results = store.searchSubscriptionChannels(token, getSearchQuery(request))
    return { results } satisfies ChannelDiscoverySearchResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.get('/api/dialogs/:dialogId/history', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const dialogId = getNumericRouteParam(request, 'dialogId')
    const beforeMessageId = getPositiveNumericQueryParam(request, 'beforeId')
    return store.getDirectDialogHistory(token, dialogId, beforeMessageId) satisfies DirectDialogHistoryResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.get('/api/groups/:groupId/history', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const beforeMessageId = getPositiveNumericQueryParam(request, 'beforeId')
    return store.getGroupHistory(token, groupId, beforeMessageId) satisfies GroupHistoryResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.get('/api/subscription-channels/:channelId/history', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const beforePostId = getPositiveNumericQueryParam(request, 'beforeId')
    return store.getSubscriptionChannelHistory(
      token,
      channelId,
      beforePostId,
    ) satisfies SubscriptionChannelHistoryResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.get('/api/channel-previews/:handle', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const handle = getRouteParam(request, 'handle')
    return store.getSubscriptionChannelPreviewByHandle(
      token,
      handle,
    ) satisfies SubscriptionChannelPreviewResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/channel-previews/:handle/subscribe', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const handle = getRouteParam(request, 'handle')
    const result = await store.subscribeToChannelByHandle(token, handle)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return {
      channelId: result.channelId,
      snapshot: result.snapshot,
    } satisfies SubscribeToChannelResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.put('/api/snapshot', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<SaveSnapshotBody>(request.body)
    const nextSnapshot = await store.saveSnapshot(token, body.snapshot as AppSnapshot)
    const identifier = store.getIdentifierByToken(token)

    if (identifier) {
      await broadcastSnapshotsForIdentifier(identifier)
    }

    return nextSnapshot
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/dialogs', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<OpenDirectDialogBody>(request.body)
    const result = await store.openDirectDialog(token, body)
    return {
      dialogId: result.dialogId,
      snapshot: result.snapshot,
    } satisfies OpenDirectDialogResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/contacts/requests', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<SendContactRequestBody>(request.body)
    const result = await store.sendContactRequest(token, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return {
      snapshot: result.snapshot,
    } satisfies ContactRequestActionResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/contacts/requests/:identifier/accept', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const identifier = getRouteParam(request, 'identifier')
    const result = await store.acceptContactRequest(token, identifier)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return {
      snapshot: result.snapshot,
    } satisfies ContactRequestActionResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/contacts/requests/:identifier/cancel', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const identifier = getRouteParam(request, 'identifier')
    const result = await store.cancelContactRequest(token, identifier)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return {
      snapshot: result.snapshot,
    } satisfies ContactRequestActionResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/contacts/requests/:identifier/reject', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const identifier = getRouteParam(request, 'identifier')
    const result = await store.rejectContactRequest(token, identifier)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return {
      snapshot: result.snapshot,
    } satisfies ContactRequestActionResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/contacts/requests/:identifier/block', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const identifier = getRouteParam(request, 'identifier')
    const result = await store.blockContactRequest(token, identifier)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return {
      snapshot: result.snapshot,
    } satisfies ContactRequestActionResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/dialogs/:dialogId/report', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const dialogId = getNumericRouteParam(request, 'dialogId')
    const body = parseJsonPayload<ReportContactBody>(request.body)
    const result = await store.reportContact(token, dialogId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/media/report', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<ReportMediaBody>(request.body)
    const result = await store.reportMediaAttachment(token, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.put('/api/dialogs/:dialogId', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const dialogId = getNumericRouteParam(request, 'dialogId')
    const body = parseJsonPayload<UpdateDialogBody>(request.body)
    const result = await store.updateDialog(token, dialogId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/media', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  const uploadDiagnostic = {
    fileName: '',
    kind: 'attachment' as UploadMediaKind,
    mimeType: '',
    size: null as number | null,
    stage: 'init',
  }

  try {
    const kind = getUploadKind(request)
    uploadDiagnostic.kind = kind
    const kindConfig = getUploadKindConfig(kind)
    const file = await (async () => {
      try {
        uploadDiagnostic.stage = 'request.file'
        return await request.file({
          limits: {
            files: 1,
            fileSize: kindConfig.maxSizeBytes,
          },
        })
      } catch (error) {
        if (kind === 'user-gif') {
          request.log.error(
            {
              err: error,
              fileName: uploadDiagnostic.fileName,
              kind,
              mimeType: uploadDiagnostic.mimeType,
              size: uploadDiagnostic.size,
              stage: uploadDiagnostic.stage,
            },
            'gif upload failed',
          )
        }
        throw mapMediaUploadError(kind, error)
      }
    })()

    if (!file) {
      throw new Error('Файл не найден в запросе.')
    }

    uploadDiagnostic.fileName = file.filename
    uploadDiagnostic.mimeType = resolveAttachmentUploadMimeType(file.filename, file.mimetype)

    const fileBuffer = await (async () => {
      try {
        uploadDiagnostic.stage = 'file.toBuffer'
        const nextBuffer = await file.toBuffer()
        uploadDiagnostic.size = nextBuffer.byteLength
        return nextBuffer
      } catch (error) {
        if (kind === 'user-gif') {
          request.log.error(
            {
              err: error,
              fileName: uploadDiagnostic.fileName,
              kind,
              mimeType: uploadDiagnostic.mimeType,
              size: uploadDiagnostic.size,
              stage: uploadDiagnostic.stage,
            },
            'gif upload failed',
          )
        }
        throw mapMediaUploadError(kind, error)
      }
    })()

    await store.assertMediaUploadWithinQuota(token, fileBuffer.byteLength, kind)
    const ownerIdentifier = store.getIdentifierByToken(token)
    if (!ownerIdentifier) {
      return reply.code(401).send({ message: 'Сессия устарела. Войдите снова.' })
    }

    const sessionSnapshot = store.getSnapshotByToken(token)
    const sessionHasPremium = Boolean(sessionSnapshot?.session.premium)
    if (kind === 'attachment' && !uploadDiagnostic.mimeType.startsWith('image/')) {
      const allowedMaxFileBytes = sessionHasPremium
        ? premiumMessageFileUploadMaxSizeBytes
        : messageFileUploadMaxSizeBytes
      if (fileBuffer.byteLength > allowedMaxFileBytes) {
        throw new Error(
          sessionHasPremium
            ? 'Файл слишком большой. Максимальный размер 200 МБ.'
            : 'Файл слишком большой. Максимальный размер 10 МБ. С премиумом доступно до 200 МБ.',
        )
      }
    }

    const storedFile = await (async () => {
      try {
        uploadDiagnostic.stage = 'storeMediaBuffer'
        return await storeMediaBuffer({
          buffer: fileBuffer,
          fileName: file.filename,
          kind,
          mimeType: uploadDiagnostic.mimeType,
          ownerIdentifier,
        })
      } catch (error) {
        if (kind === 'user-gif') {
          request.log.error(
            {
              err: error,
              fileName: uploadDiagnostic.fileName,
              kind,
              mimeType: uploadDiagnostic.mimeType,
              size: uploadDiagnostic.size,
              stage: uploadDiagnostic.stage,
            },
            'gif upload failed',
          )
        }
        throw error
      }
    })()

    try {
      uploadDiagnostic.stage = 'registerPendingMediaUpload'
      await store.registerPendingMediaUpload(token, {
        fileName: file.filename,
        kind,
        mediaUrl: storedFile.mediaUrl,
        mimeType: uploadDiagnostic.mimeType,
        size: storedFile.size,
        storageKey: storedFile.storageKey,
      })
    } catch (error) {
      if (kind === 'user-gif') {
        request.log.error(
          {
            err: error,
            fileName: uploadDiagnostic.fileName,
            kind,
            mimeType: uploadDiagnostic.mimeType,
            size: uploadDiagnostic.size,
            stage: uploadDiagnostic.stage,
          },
          'gif upload failed',
        )
      }
      try {
        await deleteStoredMediaByUrl(storedFile.mediaUrl, kind)
      } catch (cleanupError) {
        request.log.error(cleanupError)
      }
      throw error
    }

    return {
      fileName: file.filename,
      kind,
      mediaUrl: storedFile.mediaUrl,
      mimeType: uploadDiagnostic.mimeType,
      size: storedFile.size,
      storageKey: storedFile.storageKey,
    }
  } catch (error) {
    return sendError(reply, mapMediaUploadError(uploadDiagnostic.kind, error))
  }
})

app.post('/api/session/gifs', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<RegisterUserGifBody>(request.body)
    const result = await store.addUserGif(token, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.get('/api/session/gifs/search', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const query = getSearchQuery(request)
    return store.searchUserGifs(token, query)
  } catch (error) {
    return sendError(reply, error)
  }
})

app.delete('/api/session/gifs/:gifId', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const gifId = ((request.params as Record<string, string | undefined> | undefined)?.gifId ?? '').trim()
    if (!gifId) {
      throw new Error('Некорректный идентификатор GIF.')
    }

    const result = await store.removeUserGif(token, gifId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.get('/api/session/storage-items', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    return store.listUserStorageItems(token)
  } catch (error) {
    return sendError(reply, error)
  }
})

async function handleDeleteSessionStorageItem(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const storageItemIdFromParams =
      ((request.params as Record<string, string | undefined> | undefined)?.storageItemId ?? '').trim()
    const storageItemIdFromBody =
      ((request.body as Record<string, unknown> | undefined | null)?.storageItemId)?.toString().trim() ?? ''
    const storageItemId = storageItemIdFromParams || storageItemIdFromBody
    if (!storageItemId) {
      throw new Error('Некорректный объект хранилища.')
    }

    const result = await store.removeUserStorageItem(token, storageItemId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/session/storage-items', handleDeleteSessionStorageItem)
app.delete('/api/session/storage-items/:storageItemId', handleDeleteSessionStorageItem)

app.get('/api/channels/:channelId/storage-items', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    return store.listChannelStorageItems(token, getNumericRouteParam(request, 'channelId'))
  } catch (error) {
    return sendError(reply, error)
  }
})

async function handleDeleteChannelStorageItem(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<DeleteStorageItemBody>(request.body)
    if (!body.storageItemId?.trim()) {
      throw new Error('Некорректный объект хранилища.')
    }
    const result = await store.removeChannelStorageItem(
      token,
      getNumericRouteParam(request, 'channelId'),
      body.storageItemId.trim(),
    )
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/channels/:channelId/storage-items', handleDeleteChannelStorageItem)

app.get('/api/groups/:groupId/storage-items', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  const snapshot = store.getSnapshotByToken(token)
  if (!snapshot) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  // Compatibility shim for cached clients: groups no longer have their own storage surface.
  // Return an empty payload instead of a 404 so stale bundles fail soft while fresh UI rolls out.
  return {
    items: [],
    usage: {
      storageUsage: {
        percentUsed: 0,
        quotaBytes: 0,
        remainingBytes: 0,
        usedBytes: 0,
      },
    },
  }
})

app.delete('/api/groups/:groupId/storage-items', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  const snapshot = store.getSnapshotByToken(token)
  if (!snapshot) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  return { snapshot }
})

app.post('/api/session/debug-premium', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<DebugPremiumBody>(request.body)
    const result = await store.setDebugPremiumState(token, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

async function handleSessionUpdate(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<UpdateSessionBody>(request.body)
    const result = await store.updateSession(token, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.put('/api/session', handleSessionUpdate)
app.post('/api/session', handleSessionUpdate)

app.post('/api/dialogs/:dialogId/messages', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const dialogId = getNumericRouteParam(request, 'dialogId')
    const body = parseJsonPayload<SendDirectMessageBody>(request.body)
    const result = await store.sendDirectMessage(token, dialogId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.put('/api/dialogs/:dialogId/favorite', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const dialogId = getNumericRouteParam(request, 'dialogId')
    const body = parseJsonPayload<SetDialogFavoriteBody>(request.body)
    const result = await store.setDialogFavorite(token, dialogId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.put('/api/dialogs/:dialogId/pinned-message', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const dialogId = getNumericRouteParam(request, 'dialogId')
    const body = parseJsonPayload<SetDialogPinnedMessageBody>(request.body)
    const result = await store.setDialogPinnedMessage(token, dialogId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

async function handleDeleteDialogMessage(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const dialogId = getNumericRouteParam(request, 'dialogId')
    const messageId = getNumericRouteParam(request, 'messageId')
    const body = parseJsonPayload<DeleteDialogMessageBody>(request.body)
    const result = await store.deleteDialogMessage(token, dialogId, messageId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/dialogs/:dialogId/messages/:messageId', handleDeleteDialogMessage)
app.post('/api/dialogs/:dialogId/messages/:messageId', handleDeleteDialogMessage)

async function handleDeleteDialogHistory(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const dialogId = getNumericRouteParam(request, 'dialogId')
    const body = parseJsonPayload<DeleteDialogHistoryBody>(request.body)
    const result = await store.deleteDialogHistory(token, dialogId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/dialogs/:dialogId/history', handleDeleteDialogHistory)
app.post('/api/dialogs/:dialogId/history', handleDeleteDialogHistory)

async function handleDeleteDialog(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const dialogId = getNumericRouteParam(request, 'dialogId')
    const result = await store.deleteDialog(token, dialogId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/dialogs/:dialogId', handleDeleteDialog)
app.post('/api/dialogs/:dialogId', handleDeleteDialog)

app.post('/api/dialogs/:dialogId/read', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const dialogId = getNumericRouteParam(request, 'dialogId')
    const result = await store.markDialogRead(token, dialogId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/groups', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<CreateGroupBody>(request.body)
    const result = await store.createGroup(token, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return {
      groupId: result.groupId,
      snapshot: result.snapshot,
    }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/groups/:groupId/messages', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const body = parseJsonPayload<SendGroupMessageBody>(request.body)
    const result = await store.sendGroupMessage(token, groupId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/groups/:groupId/messages/:messageId/comments', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const messageId = getNumericRouteParam(request, 'messageId')
    const body = parseJsonPayload<SendGroupThreadCommentBody>(request.body)
    const result = await store.sendGroupThreadComment(token, groupId, messageId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

async function handleDeleteGroupThreadComment(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const messageId = getNumericRouteParam(request, 'messageId')
    const commentId = getNumericRouteParam(request, 'commentId')
    const result = await store.deleteGroupThreadComment(token, groupId, messageId, commentId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/groups/:groupId/messages/:messageId/comments/:commentId', handleDeleteGroupThreadComment)
app.post('/api/groups/:groupId/messages/:messageId/comments/:commentId', handleDeleteGroupThreadComment)

app.post('/api/groups/:groupId/messages/:messageId/thread-subscription', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const messageId = getNumericRouteParam(request, 'messageId')
    const result = await store.subscribeToGroupThread(token, groupId, messageId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.delete('/api/groups/:groupId/messages/:messageId/thread-subscription', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const messageId = getNumericRouteParam(request, 'messageId')
    const result = await store.unsubscribeFromGroupThread(token, groupId, messageId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/groups/:groupId/messages/:messageId/thread-read', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const messageId = getNumericRouteParam(request, 'messageId')
    const result = await store.markGroupThreadRead(token, groupId, messageId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/support/tickets', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<SendSupportTicketBody>(request.body)
    const result = await store.sendSupportTicket(token, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/support/tickets/:ticketId/comments', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const ticketId = getNonNegativeNumericRouteParam(request, 'ticketId')
    const body = parseJsonPayload<SendSupportTicketCommentBody>(request.body)
    const result = await store.sendSupportTicketComment(token, ticketId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/support/tickets/:ticketId/read', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const ticketId = getNonNegativeNumericRouteParam(request, 'ticketId')
    const result = await store.markSupportTicketRead(token, ticketId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/groups/:groupId/read', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const result = await store.markGroupRead(token, groupId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.put('/api/groups/:groupId', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const body = parseJsonPayload<UpdateGroupBody>(request.body)
    const result = await store.updateGroup(token, groupId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/groups/:groupId/invite', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const body = parseJsonPayload<InviteGroupMemberBody>(request.body)
    const result = await store.inviteGroupMember(token, groupId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/groups/:groupId/participants/remove', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const body = parseJsonPayload<ManageGroupParticipantBody>(request.body)
    const result = await store.removeGroupParticipant(token, groupId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/groups/:groupId/participants/blacklist', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const body = parseJsonPayload<ManageGroupParticipantBody>(request.body)
    const result = await store.blacklistGroupParticipant(token, groupId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/groups/by-shared/:sharedId/join', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const sharedId = getRouteParam(request, 'sharedId')
    const result = await store.joinGroupBySharedId(token, sharedId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return {
      groupId: result.groupId,
      snapshot: result.snapshot,
    } satisfies JoinGroupFromInviteResponse
  } catch (error) {
    return sendError(reply, error)
  }
})

async function handleLeaveGroup(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const result = await store.leaveGroup(token, groupId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/groups/:groupId/membership', handleLeaveGroup)
app.post('/api/groups/:groupId/membership', handleLeaveGroup)

async function handleDeleteGroupMessage(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const groupId = getNumericRouteParam(request, 'groupId')
    const messageId = getNumericRouteParam(request, 'messageId')
    const result = await store.deleteGroupMessage(token, groupId, messageId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/groups/:groupId/messages/:messageId', handleDeleteGroupMessage)
app.post('/api/groups/:groupId/messages/:messageId', handleDeleteGroupMessage)

app.post('/api/channels', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const body = parseJsonPayload<CreateManagedChannelBody>(request.body)
    const result = await store.createManagedChannel(token, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return {
      channelId: result.channelId,
      snapshot: result.snapshot,
    }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/channels/:channelId/invitations', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const body = parseJsonPayload<InviteManagedChannelMembersBody>(request.body)
    const result = await store.inviteManagedChannelMembers(token, channelId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/subscription-channels/:channelId/invitations', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const body = parseJsonPayload<InviteManagedChannelMembersBody>(request.body)
    const result = await store.inviteSubscriptionChannelMembers(token, channelId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/subscription-channels/:channelId/subscribers/remove', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const body = parseJsonPayload<ManageSubscriptionChannelSubscriberBody>(request.body)
    const result = await store.removeSubscriptionChannelSubscriber(token, channelId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/subscription-channels/:channelId/subscribers/blacklist', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const body = parseJsonPayload<ManageSubscriptionChannelSubscriberBody>(request.body)
    const result = await store.blacklistSubscriptionChannelSubscriber(token, channelId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.put('/api/channels/:channelId', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const body = parseJsonPayload<UpdateManagedChannelBody>(request.body)
    const result = await store.updateManagedChannel(token, channelId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/channels/:channelId/transfer', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const body = parseJsonPayload<TransferManagedChannelBody>(request.body)
    const result = await store.transferManagedChannel(token, channelId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

async function handleDeleteManagedChannel(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const result = await store.deleteManagedChannel(token, channelId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/channels/:channelId', handleDeleteManagedChannel)
app.post('/api/channels/:channelId', handleDeleteManagedChannel)

app.post('/api/managed-channels/:channelId/posts', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const body = parseJsonPayload<SendManagedChannelPostBody>(request.body)
    const result = await store.sendManagedChannelPost(token, channelId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

async function handleDeleteManagedChannelPost(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const postId = getNumericRouteParam(request, 'postId')
    const result = await store.deleteManagedChannelPost(token, channelId, postId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/managed-channels/:channelId/posts/:postId', handleDeleteManagedChannelPost)
app.post('/api/managed-channels/:channelId/posts/:postId', handleDeleteManagedChannelPost)

app.post('/api/subscription-channels/:channelId/read', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const result = await store.markSubscriptionChannelRead(token, channelId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.put('/api/subscription-channels/:channelId', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const body = parseJsonPayload<UpdateSubscriptionChannelBody>(request.body)
    const result = await store.updateSubscriptionChannel(token, channelId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/subscription-channels/:channelId/posts/:postId/comments', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const postId = getNumericRouteParam(request, 'postId')
    const body = parseJsonPayload<SendSubscriptionChannelThreadCommentBody>(request.body)
    const result = await store.sendSubscriptionChannelThreadComment(token, channelId, postId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

async function handleDeleteSubscriptionChannelThreadComment(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const postId = getNumericRouteParam(request, 'postId')
    const commentId = getNumericRouteParam(request, 'commentId')
    const result = await store.deleteSubscriptionChannelThreadComment(token, channelId, postId, commentId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/subscription-channels/:channelId/posts/:postId/comments/:commentId', handleDeleteSubscriptionChannelThreadComment)
app.post('/api/subscription-channels/:channelId/posts/:postId/comments/:commentId', handleDeleteSubscriptionChannelThreadComment)

app.post('/api/subscription-channels/:channelId/posts/:postId/thread-subscription', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const postId = getNumericRouteParam(request, 'postId')
    const result = await store.subscribeToSubscriptionChannelThread(token, channelId, postId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.delete('/api/subscription-channels/:channelId/posts/:postId/thread-subscription', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const postId = getNumericRouteParam(request, 'postId')
    const result = await store.unsubscribeFromSubscriptionChannelThread(token, channelId, postId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/subscription-channels/:channelId/posts/:postId/thread-read', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const postId = getNumericRouteParam(request, 'postId')
    const result = await store.markSubscriptionChannelThreadRead(token, channelId, postId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

async function handleDeleteSubscriptionChannel(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const result = await store.deleteSubscriptionChannel(token, channelId)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
}

app.delete('/api/subscription-channels/:channelId', handleDeleteSubscriptionChannel)
app.post('/api/subscription-channels/:channelId', handleDeleteSubscriptionChannel)

app.post('/api/subscription-channels/:channelId/report', async (request, reply) => {
  const token = getBearerToken(request)
  if (!token) {
    return reply.code(401).send({ message: 'Не найдена активная сессия.' })
  }

  try {
    const channelId = getNumericRouteParam(request, 'channelId')
    const body = parseJsonPayload<ReportSubscriptionChannelBody>(request.body)
    const result = await store.reportSubscriptionChannel(token, channelId, body)
    await broadcastSnapshotsForIdentifiers(result.broadcastIdentifiers)
    return { snapshot: result.snapshot }
  } catch (error) {
    return sendError(reply, error)
  }
})

await registerAdminRoutes(app, store, broadcastSnapshotsForIdentifiers)

app.get('/ws', { websocket: true }, (connection, request) => {
  const origin = Array.isArray(request.headers.origin)
    ? request.headers.origin[0]
    : request.headers.origin
  // Query-token auth is still the legacy transport for v1 realtime, so origin-check is mandatory.
  if (!isAllowedRealtimeOrigin(origin)) {
    connection.close(4003, 'Invalid origin')
    return
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`)
  const token = requestUrl.searchParams.get('token')

  if (!token) {
    connection.close(4001, 'Missing session token')
    return
  }

  const snapshot = store.getSnapshotByToken(token)
  if (!snapshot) {
    connection.close(4002, 'Unknown session')
    return
  }

  void store.recordSessionAccessByToken(token, {
    ip: request.ip,
    source: 'websocket',
    userAgent: request.headers['user-agent'],
  }).catch((error: unknown) => {
    app.log.error(error)
  })

  const liveSocket: LiveSocket = {
    id: randomUUID(),
    isAlive: true,
    socket: connection,
  }
  addLiveSocket(token, liveSocket)
  broadcastPresenceChangesForToken(token, 'online')
  connection.send(
    JSON.stringify({
      snapshot,
      type: 'connection.ready',
    } satisfies RealtimeEvent),
  )

  connection.on('pong', () => {
    liveSocket.isAlive = true
  })

  connection.on('close', () => {
    dropLiveSocketByToken(token, liveSocket.id)
    if (!hasLiveSocketsForToken(token)) {
      broadcastPresenceChangesForToken(token, 'offline')
    }
  })

  connection.on('error', () => {
    dropLiveSocketByToken(token, liveSocket.id)
    if (!hasLiveSocketsForToken(token)) {
      broadcastPresenceChangesForToken(token, 'offline')
    }
  })
})

await app.listen({
  host: runtimeConfig.server.host,
  port: runtimeConfig.server.port,
})
