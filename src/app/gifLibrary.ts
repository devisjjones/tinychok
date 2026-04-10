import { messageGifUploadMaxSizeBytes } from './constants'
import type { RegisterUserGifBody } from '../shared/backend'
import type { UploadMediaResponse } from '../shared/backend'
import type { MessageAttachment, UserGifLibraryItem } from './types'

export const duplicateUserGifMessage = 'У вас такая GIF уже загружена.'

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `gif-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function normalizeGifFileName(fileName: string) {
  return fileName
    .replace(/\.gif$/iu, '')
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function buildUserGifDuplicateKey(fileName: string, size: number) {
  return `${normalizeGifFileName(fileName)}:${Math.max(0, Math.floor(size))}`
}

export function findDuplicateUserGif<T extends Pick<UserGifLibraryItem, 'fileName' | 'size'>>(
  gifLibrary: UserGifLibraryItem[],
  candidate: T,
) {
  const nextKey = buildUserGifDuplicateKey(candidate.fileName, candidate.size)
  return gifLibrary.find((item) => buildUserGifDuplicateKey(item.fileName, item.size) === nextKey) ?? null
}

export function validateGifUploadFile(file: File) {
  const fileName = file.name.trim()
  const fileType = file.type.trim().toLowerCase()

  if (!fileName.toLowerCase().endsWith('.gif')) {
    throw new Error('Можно загружать только GIF.')
  }

  if (fileType && fileType !== 'image/gif' && fileType !== 'application/octet-stream') {
    throw new Error('Можно загружать только GIF.')
  }

  if (file.size > messageGifUploadMaxSizeBytes) {
    throw new Error('GIF слишком большая. Максимальный размер 5 МБ.')
  }
}

export function readGifDimensions(file: File) {
  const previewUrl = URL.createObjectURL(file)

  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(previewUrl)
      resolve({
        height: image.naturalHeight,
        width: image.naturalWidth,
      })
    }

    image.onerror = () => {
      URL.revokeObjectURL(previewUrl)
      reject(new Error('Не удалось прочитать GIF. Выберите другой файл.'))
    }

    image.src = previewUrl
  })
}

export function buildUserGifRegistrationBody(
  file: File,
  uploadedMedia: UploadMediaResponse,
  dimensions: { height: number; width: number },
): RegisterUserGifBody {
  return {
    createdAt: new Date().toISOString(),
    fileName: file.name,
    height: dimensions.height,
    id: createClientId(),
    mediaUrl: uploadedMedia.mediaUrl,
    mimeType: 'image/gif',
    size: uploadedMedia.size,
    source: 'upload',
    width: dimensions.width,
  }
}

export function buildUserGifRegistrationBodyFromAttachment(
  attachment: Pick<MessageAttachment, 'fileName' | 'height' | 'mediaUrl' | 'mimeType' | 'size' | 'width'>,
): RegisterUserGifBody {
  return {
    createdAt: new Date().toISOString(),
    fileName: attachment.fileName,
    height: attachment.height,
    id: createClientId(),
    mediaUrl: attachment.mediaUrl,
    mimeType: 'image/gif',
    size: attachment.size,
    source: 'viewer',
    width: attachment.width,
  }
}
