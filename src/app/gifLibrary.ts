import { messageGifUploadMaxSizeBytes } from './constants'
import type { RegisterUserGifBody } from '../shared/backend'
import type { UploadMediaResponse } from '../shared/backend'

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `gif-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function validateGifUploadFile(file: File) {
  const fileName = file.name.trim()

  if (!fileName.toLowerCase().endsWith('.gif') || file.type !== 'image/gif') {
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
    width: dimensions.width,
  }
}
