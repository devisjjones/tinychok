import {
  messageAttachmentUploadMaxSizeBytes,
  messagePhotoAcceptedMimeTypes,
  messagePhotoCompressionTargetBytes,
  messagePhotoMaxDimensionPx,
} from './constants'
import type { PendingAttachmentDraft } from './usePendingMessageOutbox'

export type ComposerAttachmentDraftStatus = 'preparing' | 'ready' | 'error'
export type ComposerAttachmentKind = 'image' | 'file'

export type ComposerAttachmentDraft = {
  error?: string
  file: File
  fileName: string
  height?: number
  kind: ComposerAttachmentKind
  mimeType: string
  originalFile: File
  originalHeight?: number
  originalSize: number
  originalWidth?: number
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

function replaceFileExtension(fileName: string, extension: string) {
  return fileName.replace(/\.[^.]+$/u, '') + extension
}

function createComposerPreviewUrl(file: File) {
  return URL.createObjectURL(file)
}

function resolveAttachmentKind(file: File): ComposerAttachmentKind {
  return file.type.startsWith('image/') ? 'image' : 'file'
}

function isSupportedPhotoMimeType(mimeType: string) {
  return messagePhotoAcceptedMimeTypes.includes(
    mimeType as (typeof messagePhotoAcceptedMimeTypes)[number],
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
    mimeType: attachmentDraft.mimeType,
    size: attachmentDraft.size,
    width: attachmentDraft.width,
  }
}

export function createPreparingComposerAttachmentDraft(file: File): ComposerAttachmentDraft {
  return {
    file,
    fileName: file.name,
    kind: resolveAttachmentKind(file),
    mimeType: file.type || 'application/octet-stream',
    originalFile: file,
    originalSize: file.size,
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
): ComposerAttachmentDraft {
  return {
    error: message,
    file,
    fileName: file.name,
    kind: resolveAttachmentKind(file),
    mimeType: file.type || 'application/octet-stream',
    originalFile: file,
    originalSize: file.size,
    previewUrl,
    sendOriginal: false,
    size: file.size,
    status: 'error',
  }
}

export async function buildComposerAttachmentDraft(
  file: File,
  options?: { previewUrl?: string },
): Promise<ComposerAttachmentDraft> {
  const previewUrl = options?.previewUrl ?? createComposerPreviewUrl(file)

  if (file.size > messageAttachmentUploadMaxSizeBytes) {
    return buildComposerAttachmentDraftError(
      file,
      'Файл слишком большой. Максимальный размер 20 МБ.',
      previewUrl,
    )
  }

  const kind = resolveAttachmentKind(file)

  if (kind === 'file') {
    return {
      file,
      fileName: file.name,
      kind,
      mimeType: file.type || 'application/octet-stream',
      originalFile: file,
      originalSize: file.size,
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
    )
  }
}

export function setComposerAttachmentSendOriginal(
  attachmentDraft: ComposerAttachmentDraft,
  sendOriginal: boolean,
): ComposerAttachmentDraft {
  if (attachmentDraft.kind !== 'image') {
    return attachmentDraft
  }

  const nextFile = sendOriginal ? attachmentDraft.originalFile : attachmentDraft.processedFile ?? attachmentDraft.originalFile

  return {
    ...attachmentDraft,
    file: nextFile,
    fileName: attachmentDraft.originalFile.name,
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
