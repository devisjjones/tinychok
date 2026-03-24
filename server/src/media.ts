import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { UploadMediaKind, UploadMediaResponse } from '../../src/shared/backend'
import { makePublicUrl, runtimeConfig } from './config'

const MIME_EXTENSION_MAP: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

const SUPPORTED_IMAGE_ATTACHMENT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

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
    allowedMimeTypes: new Set(['image/jpeg', 'image/png']),
    directory: 'channel-avatars',
    maxSizeBytes: 1 * 1024 * 1024,
  },
  'group-avatar': {
    allowedMimeTypes: new Set(['image/jpeg', 'image/png']),
    directory: 'group-avatars',
    maxSizeBytes: 1 * 1024 * 1024,
  },
  'profile-avatar': {
    allowedMimeTypes: new Set(['image/jpeg', 'image/png']),
    directory: 'profile-avatars',
    maxSizeBytes: 1 * 1024 * 1024,
  },
  attachment: {
    directory: 'attachments',
    maxSizeBytes: 20 * 1024 * 1024,
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

function buildStorageKey(kind: UploadMediaKind, fileName: string, mimeType: string) {
  const extension = sanitizeFileExtension(fileName, mimeType)
  return `${MEDIA_KIND_CONFIG[kind].directory}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`
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

async function storeMediaFileLocally(options: {
  fileName: string
  kind: UploadMediaKind
  mimeType: string
  stream: NodeJS.ReadableStream
}) {
  const { fileName, kind, mimeType, stream } = options
  const storageKey = buildStorageKey(kind, fileName, mimeType)
  const absolutePath = join(runtimeConfig.storage.localMediaRoot, storageKey)
  let size = 0

  stream.on('data', (chunk) => {
    size += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk))
  })

  await mkdir(dirname(absolutePath), { recursive: true })
  await pipeline(stream, createWriteStream(absolutePath))

  return {
    mediaUrl: buildStableMediaUrl(storageKey),
    size,
    storageKey,
  } satisfies Pick<UploadMediaResponse, 'mediaUrl' | 'size' | 'storageKey'>
}

async function storeMediaBufferLocally(options: {
  buffer: Buffer
  fileName: string
  kind: UploadMediaKind
  mimeType: string
}) {
  const { buffer, fileName, kind, mimeType } = options
  const storageKey = buildStorageKey(kind, fileName, mimeType)
  const absolutePath = join(runtimeConfig.storage.localMediaRoot, storageKey)

  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, buffer)

  return {
    mediaUrl: buildStableMediaUrl(storageKey),
    size: buffer.byteLength,
    storageKey,
  } satisfies Pick<UploadMediaResponse, 'mediaUrl' | 'size' | 'storageKey'>
}

async function storeMediaFileInObjectStorage(options: {
  fileName: string
  kind: UploadMediaKind
  mimeType: string
  stream: NodeJS.ReadableStream
}) {
  const { fileName, kind, mimeType, stream } = options
  const bucket = runtimeConfig.storage.objectStorage.bucket
  const storageKey = buildStorageKey(kind, fileName, mimeType)
  const fileBody = await readStreamToBuffer(stream)

  await getObjectStorageClient().send(
    new PutObjectCommand({
      Body: fileBody,
      Bucket: bucket!,
      ContentType: mimeType,
      Key: storageKey,
    }),
  )

  return {
    mediaUrl: buildStableMediaUrl(storageKey),
    size: fileBody.byteLength,
    storageKey,
  } satisfies Pick<UploadMediaResponse, 'mediaUrl' | 'size' | 'storageKey'>
}

async function storeMediaBufferInObjectStorage(options: {
  buffer: Buffer
  fileName: string
  kind: UploadMediaKind
  mimeType: string
}) {
  const { buffer, fileName, kind, mimeType } = options
  const bucket = runtimeConfig.storage.objectStorage.bucket
  const storageKey = buildStorageKey(kind, fileName, mimeType)

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
  return SUPPORTED_IMAGE_ATTACHMENT_MIME_TYPES.has(mimeType)
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

export async function storeMediaFile(options: {
  fileName: string
  kind: UploadMediaKind
  mimeType: string
  stream: NodeJS.ReadableStream
}) {
  const kindConfig = getUploadKindConfig(options.kind)

  if (kindConfig.allowedMimeTypes && !kindConfig.allowedMimeTypes.has(options.mimeType)) {
    throw new Error('Неподдерживаемый тип файла для этого действия.')
  }

  if (options.kind === 'attachment' && options.mimeType.startsWith('image/')) {
    if (!isSupportedImageAttachmentMimeType(options.mimeType)) {
      throw new Error('Для фотографии поддерживаются только JPEG, PNG и WebP.')
    }

    const fileBuffer = await readStreamToBuffer(options.stream)

    if (fileBuffer.byteLength === 0) {
      throw new Error('Файл пустой или повреждён.')
    }

    if (fileBuffer.byteLength > kindConfig.maxSizeBytes) {
      throw new Error('Файл слишком большой.')
    }

    if (!hasValidImageSignature(fileBuffer, options.mimeType)) {
      throw new Error('Не удалось проверить фотографию. Выберите другой файл.')
    }

    return runtimeConfig.storage.mediaBackend === 'object-storage'
      ? storeMediaBufferInObjectStorage({
          buffer: fileBuffer,
          fileName: options.fileName,
          kind: options.kind,
          mimeType: options.mimeType,
        })
      : storeMediaBufferLocally({
          buffer: fileBuffer,
          fileName: options.fileName,
          kind: options.kind,
          mimeType: options.mimeType,
        })
  }

  return runtimeConfig.storage.mediaBackend === 'object-storage'
    ? storeMediaFileInObjectStorage(options)
    : storeMediaFileLocally(options)
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
