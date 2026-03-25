import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { UploadMediaKind, UploadMediaResponse } from '../../src/shared/backend'
import {
  avatarAcceptedMimeTypes,
  avatarSourceMaxSizeBytes,
  messageFileAcceptedExtensions,
  messageFileAcceptedMimeTypes,
  messageFileUploadMaxSizeBytes,
  messageGifUploadMaxSizeBytes,
  messagePhotoAcceptedMimeTypes,
  messagePhotoUploadMaxSizeBytes,
} from '../../src/shared/constants'
import { makePublicUrl, runtimeConfig } from './config'

const MIME_EXTENSION_MAP: Record<string, string> = {
  'application/msword': '.doc',
  'application/pdf': '.pdf',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/x-zip-compressed': '.zip',
  'application/zip': '.zip',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'text/plain': '.txt',
}

const SUPPORTED_IMAGE_ATTACHMENT_MIME_TYPES = new Set(messagePhotoAcceptedMimeTypes)
const SUPPORTED_FILE_ATTACHMENT_MIME_TYPES = new Set(messageFileAcceptedMimeTypes)
const SUPPORTED_FILE_ATTACHMENT_EXTENSIONS = new Set(messageFileAcceptedExtensions)

const MEDIA_KIND_CONFIG: Record<
  UploadMediaKind,
  {
    allowedMimeTypes?: Set<string>
    directory: string
    maxSizeBytes: number
  }
> = {
  // Avatars and attachments already live in separate prefixes, so switching from
  // local disk to Object Storage does not change the key layout.
  'channel-avatar': {
    allowedMimeTypes: new Set(avatarAcceptedMimeTypes),
    directory: 'channel-avatars',
    maxSizeBytes: avatarSourceMaxSizeBytes,
  },
  'group-avatar': {
    allowedMimeTypes: new Set(avatarAcceptedMimeTypes),
    directory: 'group-avatars',
    maxSizeBytes: avatarSourceMaxSizeBytes,
  },
  'profile-avatar': {
    allowedMimeTypes: new Set(avatarAcceptedMimeTypes),
    directory: 'profile-avatars',
    maxSizeBytes: avatarSourceMaxSizeBytes,
  },
  'user-gif': {
    allowedMimeTypes: new Set(['image/gif']),
    directory: 'user-gifs',
    maxSizeBytes: messageGifUploadMaxSizeBytes,
  },
  attachment: {
    directory: 'attachments',
    maxSizeBytes: messagePhotoUploadMaxSizeBytes,
  },
}

let objectStorageClient: S3Client | null = null

function sanitizeFileExtension(fileName: string, mimeType: string) {
  const rawExtension = extname(fileName).toLowerCase()
  if (/^\.[a-z0-9]{1,8}$/u.test(rawExtension)) {
    return rawExtension
  }

  return MIME_EXTENSION_MAP[mimeType] ?? ''
}

function sanitizeOwnerStorageSegment(ownerIdentifier?: string) {
  if (!ownerIdentifier) return null
  const normalized = ownerIdentifier.trim().replace(/[^a-zA-Z0-9_-]+/gu, '_')
  return normalized || null
}

function normalizeMimeType(mimeType: string) {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

function buildStorageKey(
  kind: UploadMediaKind,
  fileName: string,
  mimeType: string,
  ownerIdentifier?: string,
) {
  const extension = sanitizeFileExtension(fileName, mimeType)
  const ownerSegment = kind === 'user-gif' ? sanitizeOwnerStorageSegment(ownerIdentifier) : null
  const pathPrefix = ownerSegment
    ? `${MEDIA_KIND_CONFIG[kind].directory}/${ownerSegment}`
    : MEDIA_KIND_CONFIG[kind].directory
  return `${pathPrefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`
}

function buildStableMediaUrl(storageKey: string) {
  return makePublicUrl(
    `/uploads/${storageKey}`,
    runtimeConfig.publicUrls.mediaBaseUrl ?? runtimeConfig.publicUrls.apiBaseUrl,
  )
}

function extractStorageKeyFromMediaUrl(mediaUrl: string, kind: UploadMediaKind) {
  const trimmed = mediaUrl.trim()
  if (!trimmed) return null

  let normalizedPath = trimmed

  if (/^https?:\/\//u.test(trimmed)) {
    try {
      normalizedPath = new URL(trimmed).pathname
    } catch {
      return null
    }
  }

  normalizedPath = normalizedPath.replace(/^\/+/u, '')
  const uploadsPrefix = 'uploads/'

  if (normalizedPath.startsWith(uploadsPrefix)) {
    normalizedPath = normalizedPath.slice(uploadsPrefix.length)
  }

  if (normalizedPath.includes('..')) {
    return null
  }

  const kindPrefix = `${MEDIA_KIND_CONFIG[kind].directory}/`
  return normalizedPath.startsWith(kindPrefix) ? normalizedPath : null
}

function assertObjectStorageConfigured() {
  const { accessKey, bucket, secretKey } = runtimeConfig.storage.objectStorage
  if (!accessKey || !bucket || !secretKey) {
    throw new Error('Object Storage не настроен: не хватает bucket/access key/secret key.')
  }
}

function getObjectStorageClient() {
  assertObjectStorageConfigured()

  if (!objectStorageClient) {
    objectStorageClient = new S3Client({
      credentials: {
        accessKeyId: runtimeConfig.storage.objectStorage.accessKey!,
        secretAccessKey: runtimeConfig.storage.objectStorage.secretKey!,
      },
      endpoint: runtimeConfig.storage.objectStorage.endpoint,
      forcePathStyle: true,
      region: runtimeConfig.storage.objectStorage.region,
    })
  }

  return objectStorageClient
}

async function readStreamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Uint8Array[] = []

  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

async function storeMediaBufferLocally(options: {
  buffer: Buffer
  fileName: string
  kind: UploadMediaKind
  mimeType: string
  ownerIdentifier?: string
}) {
  const { buffer, fileName, kind, mimeType, ownerIdentifier } = options
  const storageKey = buildStorageKey(kind, fileName, mimeType, ownerIdentifier)
  const absolutePath = join(runtimeConfig.storage.localMediaRoot, storageKey)

  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, buffer)

  return {
    mediaUrl: buildStableMediaUrl(storageKey),
    size: buffer.byteLength,
    storageKey,
  } satisfies Pick<UploadMediaResponse, 'mediaUrl' | 'size' | 'storageKey'>
}

async function storeMediaBufferInObjectStorage(options: {
  buffer: Buffer
  fileName: string
  kind: UploadMediaKind
  mimeType: string
  ownerIdentifier?: string
}) {
  const { buffer, fileName, kind, mimeType, ownerIdentifier } = options
  const bucket = runtimeConfig.storage.objectStorage.bucket
  const storageKey = buildStorageKey(kind, fileName, mimeType, ownerIdentifier)

  await getObjectStorageClient().send(
    new PutObjectCommand({
      Body: buffer,
      Bucket: bucket!,
      ContentType: mimeType,
      Key: storageKey,
    }),
  )

  return {
    mediaUrl: buildStableMediaUrl(storageKey),
    size: buffer.byteLength,
    storageKey,
  } satisfies Pick<UploadMediaResponse, 'mediaUrl' | 'size' | 'storageKey'>
}

export function getUploadKindConfig(kind: UploadMediaKind) {
  return MEDIA_KIND_CONFIG[kind]
}

function isSupportedImageAttachmentMimeType(mimeType: string) {
  return SUPPORTED_IMAGE_ATTACHMENT_MIME_TYPES.has(
    mimeType as (typeof messagePhotoAcceptedMimeTypes)[number],
  )
}

function isSupportedFileAttachment(fileName: string, mimeType: string) {
  const extension = extname(fileName).toLowerCase()
  if (!SUPPORTED_FILE_ATTACHMENT_EXTENSIONS.has(extension as (typeof messageFileAcceptedExtensions)[number])) {
    return false
  }

  if (!mimeType) {
    return extension === '.txt'
  }

  return SUPPORTED_FILE_ATTACHMENT_MIME_TYPES.has(
    mimeType as (typeof messageFileAcceptedMimeTypes)[number],
  )
}

function hasValidImageSignature(buffer: Buffer, mimeType: string) {
  if (buffer.byteLength < 12) return false

  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }

  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    )
  }

  if (mimeType === 'image/webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
  }

  return false
}

function hasValidGifSignature(buffer: Buffer) {
  if (buffer.byteLength < 6) return false
  const signature = buffer.subarray(0, 6).toString('ascii')
  return signature === 'GIF87a' || signature === 'GIF89a'
}

export async function storeMediaBuffer(options: {
  buffer: Buffer
  fileName: string
  kind: UploadMediaKind
  mimeType: string
  ownerIdentifier?: string
}) {
  const normalizedMimeType = normalizeMimeType(options.mimeType)
  const normalizedOptions = normalizedMimeType === options.mimeType
    ? options
    : {
        ...options,
        mimeType: normalizedMimeType,
      }
  const kindConfig = getUploadKindConfig(options.kind)

  if (
    options.kind !== 'user-gif' &&
    kindConfig.allowedMimeTypes &&
    !kindConfig.allowedMimeTypes.has(normalizedMimeType)
  ) {
    throw new Error('Неподдерживаемый тип файла для этого действия.')
  }

  if (options.buffer.byteLength === 0) {
    throw new Error('Файл пустой или повреждён.')
  }

  if (
    options.kind === 'channel-avatar' ||
    options.kind === 'group-avatar' ||
    options.kind === 'profile-avatar'
  ) {
    if (!isSupportedImageAttachmentMimeType(normalizedMimeType)) {
      throw new Error('Для аватарки поддерживаются только JPG, PNG и WebP.')
    }

    if (options.buffer.byteLength > avatarSourceMaxSizeBytes) {
      throw new Error('Файл слишком большой. Максимальный размер аватарки 5 МБ.')
    }

    if (!hasValidImageSignature(options.buffer, normalizedMimeType)) {
      throw new Error('Не удалось проверить изображение для аватарки. Выберите другой файл.')
    }

    return runtimeConfig.storage.mediaBackend === 'object-storage'
      ? storeMediaBufferInObjectStorage(normalizedOptions)
      : storeMediaBufferLocally(normalizedOptions)
  }

  if (options.kind === 'attachment' && normalizedMimeType.startsWith('image/')) {
    if (!isSupportedImageAttachmentMimeType(normalizedMimeType)) {
      throw new Error('Для фотографии поддерживаются только JPEG, PNG и WebP.')
    }

    if (options.buffer.byteLength > messagePhotoUploadMaxSizeBytes) {
      throw new Error('Фотография слишком большая. Максимальный размер 10 МБ.')
    }

    if (!hasValidImageSignature(options.buffer, normalizedMimeType)) {
      throw new Error('Не удалось проверить фотографию. Выберите другой файл.')
    }

    return runtimeConfig.storage.mediaBackend === 'object-storage'
      ? storeMediaBufferInObjectStorage(normalizedOptions)
      : storeMediaBufferLocally(normalizedOptions)
  }

  if (options.kind === 'attachment') {
    if (options.buffer.byteLength > messageFileUploadMaxSizeBytes) {
      throw new Error('Файл слишком большой. Максимальный размер 10 МБ.')
    }

    if (!isSupportedFileAttachment(options.fileName, normalizedMimeType)) {
      throw new Error('Поддерживаются только PDF, DOC, DOCX, XLS, XLSX, TXT и ZIP.')
    }

    return runtimeConfig.storage.mediaBackend === 'object-storage'
      ? storeMediaBufferInObjectStorage(normalizedOptions)
      : storeMediaBufferLocally(normalizedOptions)
  }

  if (options.kind === 'user-gif') {
    if (!options.ownerIdentifier) {
      throw new Error('Не удалось определить владельца GIF.')
    }

    if (
      normalizedMimeType &&
      normalizedMimeType !== 'image/gif' &&
      normalizedMimeType !== 'application/octet-stream'
    ) {
      throw new Error('Поддерживаются только GIF.')
    }

    if (options.buffer.byteLength > messageGifUploadMaxSizeBytes) {
      throw new Error('GIF слишком большая. Максимальный размер 5 МБ.')
    }

    const extension = extname(options.fileName).toLowerCase()
    if (extension !== '.gif' || !hasValidGifSignature(options.buffer)) {
      throw new Error('Поддерживаются только корректные GIF-файлы.')
    }

    return runtimeConfig.storage.mediaBackend === 'object-storage'
      ? storeMediaBufferInObjectStorage(normalizedOptions)
      : storeMediaBufferLocally(normalizedOptions)
  }

  return runtimeConfig.storage.mediaBackend === 'object-storage'
    ? storeMediaBufferInObjectStorage(normalizedOptions)
    : storeMediaBufferLocally(normalizedOptions)
}

export async function storeMediaFile(options: {
  fileName: string
  kind: UploadMediaKind
  mimeType: string
  ownerIdentifier?: string
  stream: NodeJS.ReadableStream
}) {
  const fileBuffer = await readStreamToBuffer(options.stream)
  return storeMediaBuffer({
    buffer: fileBuffer,
    fileName: options.fileName,
    kind: options.kind,
    mimeType: options.mimeType,
    ownerIdentifier: options.ownerIdentifier,
  })
}

export async function deleteStoredMediaByUrl(mediaUrl: string, kind: UploadMediaKind) {
  const storageKey = extractStorageKeyFromMediaUrl(mediaUrl, kind)
  if (!storageKey) return false

  if (runtimeConfig.storage.mediaBackend === 'object-storage') {
    try {
      await getObjectStorageClient().send(
        new DeleteObjectCommand({
          Bucket: runtimeConfig.storage.objectStorage.bucket!,
          Key: storageKey,
        }),
      )
      return true
    } catch (error) {
      if (error instanceof Error && error.name === 'NoSuchKey') {
        return false
      }

      throw error
    }
  }

  try {
    await unlink(join(runtimeConfig.storage.localMediaRoot, storageKey))
    return true
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false
    }

    throw error
  }
}

export function getMediaBackend() {
  return runtimeConfig.storage.mediaBackend
}

export function getMediaRootPath() {
  return runtimeConfig.storage.localMediaRoot
}

export async function getMediaObjectSignedUrl(storageKey: string) {
  assertObjectStorageConfigured()

  return getSignedUrl(
    getObjectStorageClient(),
    new GetObjectCommand({
      Bucket: runtimeConfig.storage.objectStorage.bucket!,
      Key: storageKey,
    }),
    {
      expiresIn: runtimeConfig.storage.objectStorage.signedUrlTtlSeconds,
    },
  )
}
