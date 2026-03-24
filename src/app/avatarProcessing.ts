import {
  avatarAcceptedMimeTypes,
  avatarOutputSizePx,
  avatarSourceMaxSizeBytes,
} from './constants'

const preferredAvatarOutputMimeType = 'image/webp'
const fallbackAvatarOutputMimeType = 'image/jpeg'
const preferredAvatarOutputQuality = 0.86
const fallbackAvatarOutputQuality = 0.9

type LoadedAvatarImage =
  | {
      dispose: () => void
      height: number
      source: ImageBitmap
      width: number
    }
  | {
      dispose: () => void
      height: number
      source: HTMLImageElement
      width: number
    }

export type PreparedAvatarUpload = {
  file: File
  previewUrl: string
}

function isSupportedAvatarMimeType(mimeType: string) {
  return avatarAcceptedMimeTypes.includes(mimeType as (typeof avatarAcceptedMimeTypes)[number])
}

function buildAvatarOutputFileName(fileName: string, mimeType: string) {
  const baseName = fileName.replace(/\.[^.]+$/u, '').trim() || 'avatar'
  const extension = mimeType === 'image/webp' ? '.webp' : '.jpg'
  return `${baseName}${extension}`
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Не удалось подготовить изображение для аватарки.'))
        return
      }

      resolve(blob)
    }, mimeType, quality)
  })
}

async function loadAvatarImage(file: File): Promise<LoadedAvatarImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        dispose: () => bitmap.close(),
        height: bitmap.height,
        source: bitmap,
        width: bitmap.width,
      }
    } catch {
      // Safari can fail on createImageBitmap for some local files, so fall back to Image.
    }
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Не удалось прочитать изображение. Попробуйте другой файл.'))
      nextImage.src = objectUrl
    })

    return {
      dispose: () => URL.revokeObjectURL(objectUrl),
      height: image.naturalHeight,
      source: image,
      width: image.naturalWidth,
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

function renderAvatarCanvas(
  image: LoadedAvatarImage,
  size: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Не удалось подготовить превью аватарки.')
  }

  const cropSide = Math.min(image.width, image.height)
  const cropX = Math.max(0, (image.width - cropSide) / 2)
  const cropY = Math.max(0, (image.height - cropSide) / 2)

  context.clearRect(0, 0, size, size)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image.source,
    cropX,
    cropY,
    cropSide,
    cropSide,
    0,
    0,
    size,
    size,
  )

  return canvas
}

export async function prepareAvatarUpload(file: File): Promise<PreparedAvatarUpload> {
  if (!isSupportedAvatarMimeType(file.type)) {
    throw new Error('Поддерживаются только JPG, PNG и WebP.')
  }

  if (file.size > avatarSourceMaxSizeBytes) {
    throw new Error('Файл слишком большой. Максимальный размер аватарки 5 МБ.')
  }

  const loadedImage = await loadAvatarImage(file)

  try {
    if (loadedImage.width <= 0 || loadedImage.height <= 0) {
      throw new Error('Не удалось прочитать изображение. Попробуйте другой файл.')
    }

    const outputCanvas = renderAvatarCanvas(loadedImage, avatarOutputSizePx)
    let outputMimeType = preferredAvatarOutputMimeType
    let outputBlob: Blob

    try {
      outputBlob = await canvasToBlob(outputCanvas, preferredAvatarOutputMimeType, preferredAvatarOutputQuality)
      if (outputBlob.type !== preferredAvatarOutputMimeType) {
        throw new Error('Canvas returned unexpected avatar mime type.')
      }
    } catch {
      outputMimeType = fallbackAvatarOutputMimeType
      outputBlob = await canvasToBlob(outputCanvas, fallbackAvatarOutputMimeType, fallbackAvatarOutputQuality)
    }

    return {
      file: new File(
        [outputBlob],
        buildAvatarOutputFileName(file.name, outputMimeType),
        {
          lastModified: Date.now(),
          type: outputMimeType,
        },
      ),
      previewUrl: URL.createObjectURL(outputBlob),
    }
  } finally {
    loadedImage.dispose()
  }
}
