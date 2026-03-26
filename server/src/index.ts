import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type WebSocket from 'ws'
import type {
  AppSnapshot,
  ClientRuntimeConfigResponse,
  CreateGroupBody,
  CreateManagedChannelBody,
  DebugPremiumBody,
  DiscoverySearchResponse,
  DirectDialogHistoryResponse,
  GroupHistoryResponse,
  InviteGroupMemberBody,
  InviteManagedChannelMembersBody,
  ManageSubscriptionChannelSubscriberBody,
  OpenDirectDialogBody,
  OpenDirectDialogResponse,
  RegisterUserGifBody,
  ReportContactBody,
  ReportMediaBody,
  ReportSubscriptionChannelBody,
  RegisterBody,
  RequestCodeBody,
  SaveSnapshotBody,
  SetDialogFavoriteBody,
  SetDialogPinnedMessageBody,
  SendDirectMessageBody,
  SendGroupMessageBody,
  SendManagedChannelPostBody,
  SendGroupThreadCommentBody,
  SendSubscriptionChannelThreadCommentBody,
  SubscriptionChannelHistoryResponse,
  UpdateDialogBody,
  UpdateGroupBody,
  UpdateManagedChannelBody,
  UpdateSubscriptionChannelBody,
  UpdateSessionBody,
  UploadMediaKind,
  VerifyCodeBody,
} from '../../src/shared/backend'
import type { RealtimeEvent } from '../../src/shared/backend'
import type { AnalyticsBatchBody } from '../../src/shared/analytics'
import { ingestAnalyticsBatch, parseAnalyticsBatch } from './analytics'
import { registerAdminRoutes } from './admin-routes'
import { verifyCaptchaOrThrow } from './captcha'
import { runtimeConfig } from './config'
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
  return reply.code(400).send({ message })
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

function getPositiveNumericQueryParam(request: FastifyRequest, key: string) {
  const rawValue = (request.query as Record<string, string | undefined> | undefined)?.[key]
  const numericValue = Number(rawValue)

  if (!rawValue || !Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error('Некорректный идентификатор истории.')
  }

  return numericValue
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
const socketsByToken = new Map<string, WebSocket>()

async function broadcastSnapshotsForIdentifier(identifier: string) {
  const tokens = store.listTokensByIdentifier(identifier)

  for (const token of tokens) {
    const socket = socketsByToken.get(token)
    const snapshot = store.getSnapshotByToken(token)

    if (!socket || socket.readyState !== socket.OPEN || !snapshot) continue

    const payload: RealtimeEvent = {
      snapshot,
      type: 'snapshot.updated',
    }
    socket.send(JSON.stringify(payload))
  }
}

async function broadcastSnapshotsForIdentifiers(identifiers: string[]) {
  for (const identifier of [...new Set(identifiers)]) {
    await broadcastSnapshotsForIdentifier(identifier)
  }
}

const app = Fastify({
  logger: true,
})

void store.cleanupExpiredPendingMediaUploads().catch((error) => {
  app.log.error(error)
})
setInterval(() => {
  void store.cleanupExpiredPendingMediaUploads().catch((error) => {
    app.log.error(error)
  })
}, 60 * 60 * 1000)

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
    const body = parseJsonPayload<RequestCodeBody>(request.body)
    await verifyCaptchaOrThrow({
      action: 'auth.request-code',
      remoteIp: request.ip,
      token: body.captchaToken,
    })
    return await store.requestCode(body.identifier ?? '')
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/auth/verify-code', async (request, reply) => {
  try {
    const body = parseJsonPayload<VerifyCodeBody>(request.body)
    return await store.verifyCode(body.identifier ?? '', body.code ?? '')
  } catch (error) {
    return sendError(reply, error)
  }
})

app.post('/api/auth/register', async (request, reply) => {
  try {
    const body = parseJsonPayload<RegisterBody>(request.body)
    const snapshot = await store.registerAccount(body)
    return { snapshot }
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
    uploadDiagnostic.mimeType = normalizeUploadMimeType(file.mimetype)

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

    store.assertMediaUploadWithinQuota(token, fileBuffer.byteLength)
    const ownerIdentifier = store.getIdentifierByToken(token)
    if (!ownerIdentifier) {
      return reply.code(401).send({ message: 'Сессия устарела. Войдите снова.' })
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
    const result = await store.deleteDialogMessage(token, dialogId, messageId)
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
    const result = await store.deleteDialogHistory(token, dialogId)
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

await registerAdminRoutes(app, store)

app.get('/ws', { websocket: true }, (connection, request) => {
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

  socketsByToken.set(token, connection)
  connection.send(
    JSON.stringify({
      snapshot,
      type: 'connection.ready',
    } satisfies RealtimeEvent),
  )

  connection.on('close', () => {
    socketsByToken.delete(token)
  })
})

await app.listen({
  host: runtimeConfig.server.host,
  port: runtimeConfig.server.port,
})
