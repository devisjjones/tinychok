import {
  composerAttachmentRenameMaxLength,
  messageFileAcceptedExtensions,
  messageFileAcceptedMimeTypes,
  messageFileUploadMaxSizeBytes,
  messageGifUploadMaxSizeBytes,
  messagePhotoAcceptedMimeTypes,
  messagePhotoCompressionTargetBytes,
  messagePhotoMaxDimensionPx,
  messagePhotoUploadMaxSizeBytes,
} from './constants'
import { isVideoMimeType } from '../shared/utils'
import type { MessageAttachmentPresentation, UserGifLibraryItem } from './types'
import type { PendingAttachmentDraft } from './usePendingMessageOutbox'

export type ComposerAttachmentDraftStatus = 'preparing' | 'ready' | 'error'
export type ComposerAttachmentKind = 'image' | 'file' | 'video-note'

export type ComposerAttachmentDraft = {
  compressionEligible?: boolean
  error?: string
  file?: File
  fileName: string
  height?: number
  kind: ComposerAttachmentKind
  mediaUrl?: string
  mimeType: string
  originalFile?: File
  originalHeight?: number
  originalSize: number
  originalWidth?: number
  presentation?: MessageAttachmentPresentation
  previewUrl: string
  processedFile?: File
  processedHeight?: number
  processedSize?: number
  processedWidth?: number
  sendOriginal: boolean
  size: number
  status: ComposerAttachmentDraftStatus
  width?: number
}

type ComposerAttachmentFileNameParts = {
  baseName: string
  extension: string
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

function replaceFileExtension(fileName: string, extension: string) {
  return fileName.replace(/\.[^.]+$/u, '') + extension
}

function createComposerPreviewUrl(file: File) {
  return URL.createObjectURL(file)
}

function resolveAttachmentKind(
  file: File,
  presentation?: MessageAttachmentPresentation,
): ComposerAttachmentKind {
  if (presentation === 'video-note') {
    return 'video-note'
  }

  return file.type.startsWith('image/') ? 'image' : 'file'
}

function normalizeAttachmentPresentation(
  presentation?: MessageAttachmentPresentation,
): MessageAttachmentPresentation | undefined {
  return presentation === 'video-note' ? 'video-note' : undefined
}

function isSupportedPhotoMimeType(mimeType: string) {
  return messagePhotoAcceptedMimeTypes.includes(
    mimeType as (typeof messagePhotoAcceptedMimeTypes)[number],
  )
}

function isGifFile(file: File) {
  return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
}

function getFileExtension(fileName: string) {
  const match = /\.[^.]+$/u.exec(fileName.trim().toLowerCase())
  return match?.[0] ?? ''
}

function getFileBaseName(fileName: string) {
  const trimmed = fileName.trim()
  const extension = getFileExtension(trimmed)
  const withoutExtension =
    extension && trimmed.toLowerCase().endsWith(extension)
      ? trimmed.slice(0, Math.max(0, trimmed.length - extension.length))
      : trimmed

  return withoutExtension.trim() || 'Файл'
}

function sanitizeAttachmentFileBaseName(baseName: string) {
  return baseName.replace(/\s+/g, ' ').trim().slice(0, composerAttachmentRenameMaxLength)
}

function resolveComposerAttachmentMimeType(fileName: string, mimeType: string | undefined) {
  const normalizedMimeType = mimeType?.split(';', 1)[0]?.trim().toLowerCase() ?? ''

  if (normalizedMimeType && normalizedMimeType !== 'application/octet-stream') {
    return normalizedMimeType
  }

  return ATTACHMENT_EXTENSION_MIME_TYPE_MAP[getFileExtension(fileName)] ?? 'application/octet-stream'
}

function buildComposerAttachmentFileName(baseName: string, sourceFileName: string) {
  const extension = getFileExtension(sourceFileName)
  const normalizedBaseName = sanitizeAttachmentFileBaseName(baseName) || getFileBaseName(sourceFileName)
  return `${normalizedBaseName}${extension}`
}

export function getComposerAttachmentFileNameParts(fileName: string): ComposerAttachmentFileNameParts {
  return {
    baseName: getFileBaseName(fileName),
    extension: getFileExtension(fileName),
  }
}

function isAllowedFileAttachment(file: File) {
  const extension = getFileExtension(file.name)
  const hasAllowedExtension = messageFileAcceptedExtensions.includes(
    extension as (typeof messageFileAcceptedExtensions)[number],
  )

  if (!hasAllowedExtension) return false

  if (!file.type || file.type === 'application/octet-stream') {
    return true
  }

  return messageFileAcceptedMimeTypes.includes(
    resolveComposerAttachmentMimeType(file.name, file.type) as (typeof messageFileAcceptedMimeTypes)[number],
  )
}

function readImageElement(file: File) {
  const previewUrl = URL.createObjectURL(file)

  return new Promise<{ height: number; image: HTMLImageElement; previewUrl: string; width: number }>((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      resolve({
        height: image.naturalHeight,
        image,
        previewUrl,
        width: image.naturalWidth,
      })
    }

    image.onerror = () => {
      URL.revokeObjectURL(previewUrl)
      reject(new Error('Не удалось прочитать изображение. Попробуйте другой файл.'))
    }

    image.src = previewUrl
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality)
  })
}

async function buildProcessedImageFile(file: File) {
  const { height, image, previewUrl, width } = await readImageElement(file)

  try {
    const longestSide = Math.max(width, height)
    const shouldResize = longestSide > messagePhotoMaxDimensionPx
    const shouldReencode = shouldResize || file.size > messagePhotoCompressionTargetBytes

    if (!shouldReencode) {
      return {
        file,
        height,
        mimeType: file.type || 'image/jpeg',
        originalHeight: height,
        originalWidth: width,
        size: file.size,
        width,
      }
    }

    const scale = shouldResize ? messagePhotoMaxDimensionPx / longestSide : 1
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Не удалось подготовить изображение для отправки.')
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight)

    const webpBlob = await canvasToBlob(canvas, 'image/webp', 0.84)
    const imageBlob =
      webpBlob && webpBlob.size > 0
        ? webpBlob
        : await canvasToBlob(canvas, 'image/jpeg', 0.86)

    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Не удалось сжать изображение.')
    }

    if (!shouldResize && imageBlob.size >= file.size * 0.97) {
      return {
        file,
        height,
        mimeType: file.type || 'image/jpeg',
        originalHeight: height,
        originalWidth: width,
        size: file.size,
        width,
      }
    }

    const nextExtension = imageBlob.type === 'image/webp' ? '.webp' : '.jpg'
    const processedFile = new File([imageBlob], replaceFileExtension(file.name, nextExtension), {
      lastModified: file.lastModified,
      type: imageBlob.type,
    })

    return {
      file: processedFile,
      height: targetHeight,
      mimeType: processedFile.type,
      originalHeight: height,
      originalWidth: width,
      size: processedFile.size,
      width: targetWidth,
    }
  } finally {
    URL.revokeObjectURL(previewUrl)
  }
}

export function releaseComposerAttachmentDraft(attachmentDraft?: ComposerAttachmentDraft) {
  if (!attachmentDraft?.previewUrl.startsWith('blob:')) return
  URL.revokeObjectURL(attachmentDraft.previewUrl)
}

export function buildPendingAttachmentDraft(attachmentDraft?: ComposerAttachmentDraft): PendingAttachmentDraft | undefined {
  if (!attachmentDraft) return undefined

  return {
    file: attachmentDraft.file,
    fileName: attachmentDraft.fileName,
    height: attachmentDraft.height,
    mediaUrl: attachmentDraft.mediaUrl,
    mimeType: attachmentDraft.mimeType,
    presentation: attachmentDraft.presentation,
    size: attachmentDraft.size,
    width: attachmentDraft.width,
  }
}

export function createPreparingComposerAttachmentDraft(
  file: File,
  options?: {
    presentation?: MessageAttachmentPresentation
  },
): ComposerAttachmentDraft {
  const presentation = normalizeAttachmentPresentation(options?.presentation)
  return {
    file,
    fileName: file.name,
    kind: resolveAttachmentKind(file, presentation),
    compressionEligible: false,
    mimeType: resolveComposerAttachmentMimeType(file.name, file.type),
    originalFile: file,
    originalSize: file.size,
    presentation,
    previewUrl: createComposerPreviewUrl(file),
    sendOriginal: false,
    size: file.size,
    status: 'preparing',
  }
}

export function buildComposerAttachmentDraftError(
  file: File,
  message: string,
  previewUrl = createComposerPreviewUrl(file),
  options?: {
    presentation?: MessageAttachmentPresentation
  },
): ComposerAttachmentDraft {
  const presentation = normalizeAttachmentPresentation(options?.presentation)
  return {
    error: message,
    file,
    fileName: file.name,
    kind: resolveAttachmentKind(file, presentation),
    compressionEligible: false,
    mimeType: resolveComposerAttachmentMimeType(file.name, file.type),
    originalFile: file,
    originalSize: file.size,
    presentation,
    previewUrl,
    sendOriginal: false,
    size: file.size,
    status: 'error',
  }
}

export async function buildComposerAttachmentDraft(
  file: File,
  options?: {
    presentation?: MessageAttachmentPresentation
    maxFileUploadCopy?: string
    maxFileUploadSizeBytes?: number
    previewUrl?: string
  },
): Promise<ComposerAttachmentDraft> {
  const previewUrl = options?.previewUrl ?? createComposerPreviewUrl(file)
  const presentation = normalizeAttachmentPresentation(options?.presentation)
  const kind = resolveAttachmentKind(file, presentation)
  const maxFileUploadSizeBytes =
    options?.maxFileUploadSizeBytes ?? messageFileUploadMaxSizeBytes
  const maxFileUploadCopy =
    options?.maxFileUploadCopy ??
    `Максимальный размер ${Math.round(maxFileUploadSizeBytes / (1024 * 1024))} МБ.`

  if (kind === 'image' && file.size > messagePhotoUploadMaxSizeBytes) {
    return buildComposerAttachmentDraftError(
      file,
      'Фотография слишком большая. Максимальный размер 10 МБ.',
      previewUrl,
      { presentation },
    )
  }

  if (kind === 'file' || kind === 'video-note') {
    if (isGifFile(file)) {
      return buildComposerAttachmentDraftError(
        file,
        `GIF загружаются через вкладку GIFs. Максимальный размер ${Math.round(messageGifUploadMaxSizeBytes / (1024 * 1024))} МБ.`,
        previewUrl,
        { presentation },
      )
    }

    if (file.size > maxFileUploadSizeBytes) {
      return buildComposerAttachmentDraftError(
        file,
        `Файл слишком большой. ${maxFileUploadCopy}`,
        previewUrl,
        { presentation },
      )
    }

    if (!isAllowedFileAttachment(file)) {
      return buildComposerAttachmentDraftError(
        file,
        'Поддерживаются PDF, DOC, DOCX, XLS, XLSX, TXT, ZIP и видео MP4, MOV, WEBM, M4V.',
        previewUrl,
        { presentation },
      )
    }

    const resolvedMimeType = resolveComposerAttachmentMimeType(file.name, file.type)

    if (kind === 'video-note' && !isVideoMimeType(resolvedMimeType)) {
      return buildComposerAttachmentDraftError(
        file,
        'Видеосообщение можно записать только в видеоформате.',
        previewUrl,
        { presentation },
      )
    }

    return {
      file,
      fileName: file.name,
      kind,
      compressionEligible: false,
      mimeType: resolvedMimeType,
      originalFile: file,
      originalSize: file.size,
      presentation,
      previewUrl,
      sendOriginal: false,
      size: file.size,
      status: 'ready',
    }
  }

  if (!isSupportedPhotoMimeType(file.type)) {
    return buildComposerAttachmentDraftError(file, 'Поддерживаются только JPEG, PNG и WebP.', previewUrl)
  }

  try {
    const processed = await buildProcessedImageFile(file)

    return {
      file: processed.file,
      fileName: file.name,
      kind,
      compressionEligible: true,
      mimeType: processed.mimeType,
      originalFile: file,
      originalHeight: processed.originalHeight,
      originalSize: file.size,
      originalWidth: processed.originalWidth,
      height: processed.height,
      previewUrl,
      processedFile: processed.file,
      processedHeight: processed.height,
      processedSize: processed.size,
      processedWidth: processed.width,
      sendOriginal: false,
      size: processed.size,
      status: 'ready',
      width: processed.width,
    }
  } catch (error) {
    return buildComposerAttachmentDraftError(
      file,
      error instanceof Error ? error.message : 'Не удалось подготовить изображение.',
      previewUrl,
      { presentation },
    )
  }
}

export function setComposerAttachmentSendOriginal(
  attachmentDraft: ComposerAttachmentDraft,
  sendOriginal: boolean,
): ComposerAttachmentDraft {
  if (attachmentDraft.kind !== 'image' || !attachmentDraft.compressionEligible || !attachmentDraft.originalFile) {
    return attachmentDraft
  }

  const nextFile = sendOriginal ? attachmentDraft.originalFile : attachmentDraft.processedFile ?? attachmentDraft.originalFile
  const nextBaseName = getComposerAttachmentFileNameParts(attachmentDraft.fileName).baseName

  return {
    ...attachmentDraft,
    file: nextFile,
    fileName: buildComposerAttachmentFileName(nextBaseName, nextFile.name),
    height: sendOriginal
      ? attachmentDraft.originalHeight ?? attachmentDraft.height
      : attachmentDraft.processedHeight ?? attachmentDraft.height,
    mimeType: nextFile.type || attachmentDraft.mimeType,
    sendOriginal,
    size: nextFile.size,
    width: sendOriginal
      ? attachmentDraft.originalWidth ?? attachmentDraft.width
      : attachmentDraft.processedWidth ?? attachmentDraft.width,
  }
}

export function setComposerAttachmentFileBaseName(
  attachmentDraft: ComposerAttachmentDraft,
  nextBaseName: string,
): ComposerAttachmentDraft {
  return {
    ...attachmentDraft,
    fileName: buildComposerAttachmentFileName(nextBaseName, attachmentDraft.fileName),
  }
}

export function buildGifLibraryAttachmentDraft(gif: UserGifLibraryItem): ComposerAttachmentDraft {
  return {
    compressionEligible: false,
    fileName: gif.fileName,
    height: gif.height,
    kind: 'image',
    mediaUrl: gif.mediaUrl,
    mimeType: gif.mimeType,
    originalHeight: gif.height,
    originalSize: gif.size,
    originalWidth: gif.width,
    presentation: undefined,
    previewUrl: gif.mediaUrl,
    sendOriginal: false,
    size: gif.size,
    status: 'ready',
    width: gif.width,
  }
}
