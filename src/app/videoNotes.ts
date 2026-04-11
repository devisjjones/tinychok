export const videoNoteRecordingLimitMs = 30_000

export const videoNoteRecorderMimeTypeCandidates = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
] as const

function normalizeVideoNoteMimeType(mimeType: string) {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() || 'video/webm'
}

type MediaRecorderSupportLike = {
  isTypeSupported?: (mimeType: string) => boolean
}

type VideoNoteRecordingSupportEnvironment = {
  MediaRecorder?: MediaRecorderSupportLike
  navigator?: {
    mediaDevices?: {
      getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
    }
  }
}

export function resolveSupportedVideoNoteMimeType(
  mediaRecorderSupport: MediaRecorderSupportLike | undefined = typeof MediaRecorder === 'undefined'
    ? undefined
    : MediaRecorder,
) {
  if (!mediaRecorderSupport?.isTypeSupported) {
    return undefined
  }

  for (const candidate of videoNoteRecorderMimeTypeCandidates) {
    if (mediaRecorderSupport.isTypeSupported(candidate)) {
      return candidate
    }
  }

  return undefined
}

export function isVideoNoteRecordingSupported(
  environment: VideoNoteRecordingSupportEnvironment = {
    MediaRecorder: typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder,
    navigator: typeof navigator === 'undefined' ? undefined : navigator,
  },
) {
  return Boolean(
    environment.MediaRecorder &&
      environment.navigator?.mediaDevices?.getUserMedia,
  )
}

export function getVideoNoteFileExtension(mimeType: string) {
  const normalizedMimeType = normalizeVideoNoteMimeType(mimeType)

  if (normalizedMimeType.includes('mp4')) {
    return '.mp4'
  }

  return '.webm'
}

function padFileNamePart(value: number) {
  return String(value).padStart(2, '0')
}

export function buildVideoNoteFileName(now = new Date(), mimeType = 'video/webm') {
  return `video-note-${now.getFullYear()}${padFileNamePart(now.getMonth() + 1)}${padFileNamePart(
    now.getDate(),
  )}-${padFileNamePart(now.getHours())}${padFileNamePart(now.getMinutes())}${padFileNamePart(
    now.getSeconds(),
  )}${getVideoNoteFileExtension(mimeType)}`
}

export function buildVideoNoteFile(
  blob: Blob,
  options?: {
    mimeType?: string
    now?: Date
  },
) {
  const now = options?.now ?? new Date()
  const mimeType = normalizeVideoNoteMimeType(blob.type || options?.mimeType || 'video/webm')
  const fileName = buildVideoNoteFileName(now, mimeType)

  return new File([blob], fileName, {
    lastModified: now.getTime(),
    type: mimeType,
  })
}

export function clampVideoNoteRecordingProgress(
  elapsedMs: number,
  limitMs = videoNoteRecordingLimitMs,
) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0
  }

  return Math.min(1, Math.max(0, elapsedMs / limitMs))
}

export function shouldAutoStopVideoNoteRecording(
  elapsedMs: number,
  limitMs = videoNoteRecordingLimitMs,
) {
  return elapsedMs >= limitMs
}

export function stopMediaStreamTracks(
  stream?: Pick<MediaStream, 'getTracks'> | null,
) {
  if (!stream) {
    return
  }

  for (const track of stream.getTracks()) {
    track.stop()
  }
}
