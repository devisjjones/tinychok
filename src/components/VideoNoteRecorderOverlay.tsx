import React, { useEffect, useRef, useState } from 'react'
import {
  buildVideoNoteFile,
  clampVideoNoteRecordingProgress,
  resolveSupportedVideoNoteMimeType,
  shouldAutoStopVideoNoteRecording,
  stopMediaStreamTracks,
  videoNoteRecordingLimitMs,
} from '../app/videoNotes'

// Keep the classic JSX runtime symbol available for server-side contract tests executed via `tsx`.
void React

type VideoNoteRecorderState =
  | 'requesting-permission'
  | 'ready'
  | 'recording'
  | 'review'
  | 'error'

type VideoNoteRecorderOverlayProps = {
  onClose: () => void
  onRecordingStart?: () => void
  onUse: (file: File, meta?: { durationMs: number }) => void | Promise<void>
}

const preferredVideoConstraints: MediaStreamConstraints[] = [
  {
    audio: true,
    video: {
      facingMode: 'user',
    },
  },
  {
    audio: true,
    video: true,
  },
]

function formatRecordingTimer(elapsedMs: number) {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const limitSeconds = Math.floor(videoNoteRecordingLimitMs / 1000)

  return `0:${String(elapsedSeconds).padStart(2, '0')} / 0:${String(limitSeconds).padStart(2, '0')}`
}

function buildRecorderErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Нет доступа к камере или микрофону. Разрешите доступ и попробуйте ещё раз.'
    }

    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'Не удалось найти доступную фронтальную камеру. Попробуйте другое устройство.'
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'Не удалось записать видеосообщение. Попробуйте ещё раз.'
}

export function VideoNoteRecorderOverlay({
  onClose,
  onRecordingStart,
  onUse,
}: VideoNoteRecorderOverlayProps) {
  const recorderTitle = 'Видео-квадратик'
  const [busy, setBusy] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [state, setState] = useState<VideoNoteRecorderState>('requesting-permission')
  const [streamVersion, setStreamVersion] = useState(0)
  const livePreviewRef = useRef<HTMLVideoElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const reviewBlobRef = useRef<Blob | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const autoStopTimeoutRef = useRef<number | null>(null)
  const elapsedIntervalRef = useRef<number | null>(null)
  const permissionRequestTokenRef = useRef(0)
  const chunksRef = useRef<Blob[]>([])

  function clearTimers() {
    if (autoStopTimeoutRef.current !== null) {
      window.clearTimeout(autoStopTimeoutRef.current)
      autoStopTimeoutRef.current = null
    }

    if (elapsedIntervalRef.current !== null) {
      window.clearInterval(elapsedIntervalRef.current)
      elapsedIntervalRef.current = null
    }
  }

  function clearPreviewUrl() {
    setPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentPreviewUrl)
      }
      return ''
    })
  }

  function detachLivePreview() {
    if (livePreviewRef.current?.srcObject) {
      livePreviewRef.current.srcObject = null
    }
  }

  function stopCurrentStream() {
    stopMediaStreamTracks(streamRef.current)
    streamRef.current = null
    detachLivePreview()
    setStreamVersion((currentVersion) => currentVersion + 1)
  }

  async function requestRecordingStream() {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setErrorMessage('Видеосообщения не поддерживаются в этом браузере.')
      setState('error')
      return
    }

    setBusy(false)
    setElapsedMs(0)
    setErrorMessage('')
    clearPreviewUrl()
    clearTimers()
    stopCurrentStream()
    reviewBlobRef.current = null
    recorderRef.current = null
    chunksRef.current = []
    setState('requesting-permission')

    const requestToken = permissionRequestTokenRef.current + 1
    permissionRequestTokenRef.current = requestToken

    let lastError: unknown = null

    for (const constraints of preferredVideoConstraints) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (permissionRequestTokenRef.current !== requestToken) {
          stopMediaStreamTracks(stream)
          return
        }

        streamRef.current = stream
        setStreamVersion((currentVersion) => currentVersion + 1)
        setState('ready')
        return
      } catch (error) {
        lastError = error
      }
    }

    setErrorMessage(buildRecorderErrorMessage(lastError))
    setState('error')
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') {
      return
    }

    recorder.stop()
  }

  function startRecording() {
    if (!streamRef.current || typeof MediaRecorder === 'undefined') {
      setErrorMessage('Не удалось подготовить запись. Попробуйте ещё раз.')
      setState('error')
      return
    }

    setErrorMessage('')
    clearPreviewUrl()
    reviewBlobRef.current = null
    chunksRef.current = []

    try {
      const preferredMimeType = resolveSupportedVideoNoteMimeType(MediaRecorder)
      const recorder = preferredMimeType
        ? new MediaRecorder(streamRef.current, { mimeType: preferredMimeType })
        : new MediaRecorder(streamRef.current)

      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }
      recorder.onerror = (event) => {
        const nextError =
          'error' in event && event.error ? event.error : new Error('Не удалось завершить запись.')
        setErrorMessage(buildRecorderErrorMessage(nextError))
        setState('error')
        clearTimers()
        stopCurrentStream()
      }
      recorder.onstop = () => {
        clearTimers()
        const nextElapsedMs = Math.min(videoNoteRecordingLimitMs, Math.max(0, Date.now() - startedAtRef.current))

        const nextBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || resolveSupportedVideoNoteMimeType(MediaRecorder) || 'video/webm',
        })
        chunksRef.current = []
        recorderRef.current = null
        stopCurrentStream()

        if (nextBlob.size <= 0) {
          setErrorMessage('Запись получилась пустой. Попробуйте ещё раз.')
          setState('error')
          return
        }

        reviewBlobRef.current = nextBlob
        setPreviewUrl(URL.createObjectURL(nextBlob))
        setElapsedMs(nextElapsedMs)
        setState('review')
        void handleUse(nextElapsedMs)
      }

      recorder.start(250)
      startedAtRef.current = Date.now()
      setElapsedMs(0)
      setState('recording')
      onRecordingStart?.()

      elapsedIntervalRef.current = window.setInterval(() => {
        const nextElapsedMs = Date.now() - startedAtRef.current
        setElapsedMs(nextElapsedMs)
        if (shouldAutoStopVideoNoteRecording(nextElapsedMs)) {
          stopRecording()
        }
      }, 100)

      autoStopTimeoutRef.current = window.setTimeout(() => {
        stopRecording()
      }, videoNoteRecordingLimitMs)
    } catch (error) {
      setErrorMessage(buildRecorderErrorMessage(error))
      setState('error')
      clearTimers()
      stopCurrentStream()
    }
  }

  async function handleUse(durationMs = elapsedMs) {
    if (!reviewBlobRef.current) {
      return
    }

    setBusy(true)

    try {
      await Promise.resolve(
        onUse(
          buildVideoNoteFile(reviewBlobRef.current, {
            mimeType: reviewBlobRef.current.type,
          }),
          { durationMs },
        ),
      )
      onClose()
    } catch (error) {
      setErrorMessage(buildRecorderErrorMessage(error))
      setState('error')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void requestRecordingStream()

    return () => {
      permissionRequestTokenRef.current += 1
      clearTimers()
      clearPreviewUrl()
      reviewBlobRef.current = null
      const recorder = recorderRef.current
      recorderRef.current = null
      if (recorder) {
        recorder.ondataavailable = null
        recorder.onerror = null
        recorder.onstop = null
        if (recorder.state !== 'inactive') {
          try {
            recorder.stop()
          } catch {
            // Ignore recorder shutdown errors on unmount.
          }
        }
      }
      stopCurrentStream()
    }
  }, [])

  useEffect(() => {
    const livePreviewElement = livePreviewRef.current
    if (!livePreviewElement) {
      return
    }

    if (!streamRef.current || state === 'review' || state === 'error') {
      livePreviewElement.srcObject = null
      return
    }

    livePreviewElement.srcObject = streamRef.current
    void livePreviewElement.play().catch(() => undefined)

    return () => {
      livePreviewElement.srcObject = null
    }
  }, [state, streamVersion])

  const recordingProgress = clampVideoNoteRecordingProgress(elapsedMs)
  const recordedClipAvailable = Boolean(reviewBlobRef.current)
  const showingRecordedPreview = Boolean(previewUrl) && (state === 'review' || state === 'error')
  const mainActionLabel =
    state === 'recording'
      ? 'Отправить'
      : state === 'error' && recordedClipAvailable
        ? 'Отправить снова'
      : state === 'review'
        ? 'Использовать'
        : 'Начать запись'

  return (
    <div
      className="video-note-recorder-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={recorderTitle}
      onClick={onClose}
    >
      <div
        className="video-note-recorder-panel"
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="video-note-recorder-header">
          <h3>{recorderTitle}</h3>
          <button
            type="button"
            className="soft-button video-note-recorder-close"
            onClick={onClose}
            aria-label={`Закрыть ${recorderTitle.toLowerCase()}`}
            title={`Закрыть ${recorderTitle.toLowerCase()}`}
          >
            <img src="/icons/cancel.png" alt="" aria-hidden="true" />
          </button>
        </div>

        <div className="video-note-recorder-preview-shell">
          {showingRecordedPreview ? (
            <video
              src={previewUrl}
              className="video-note-recorder-preview"
              playsInline
              preload="metadata"
            />
          ) : (
            <video
              ref={livePreviewRef}
              className="video-note-recorder-preview"
              muted
              playsInline
              autoPlay
            />
          )}
        </div>

        <div className="video-note-recorder-preview-meta" aria-live="polite">
          <span className={`video-note-recorder-state video-note-recorder-state-${state}`}>
            {state === 'requesting-permission'
              ? 'Запрашиваем доступ к камере...'
              : state === 'ready'
                ? 'Готово к записи'
                : state === 'recording'
                  ? 'Идёт запись'
                  : state === 'review'
                    ? 'Проверьте запись'
                    : 'Ошибка'}
          </span>
          <span className="video-note-recorder-timer">{formatRecordingTimer(elapsedMs)}</span>
        </div>

        <div
          className="video-note-recorder-progress"
          role="progressbar"
          aria-label="Прогресс записи видеосообщения"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(recordingProgress * 100)}
        >
          <span
            className="video-note-recorder-progress-fill"
            style={{ width: `${Math.round(recordingProgress * 100)}%` }}
          />
        </div>

        {errorMessage ? <p className="auth-error video-note-recorder-error">{errorMessage}</p> : null}

        <div className="video-note-recorder-actions">
          <button
            type="button"
            className="soft-button"
            onClick={state === 'review' || state === 'error' ? () => void requestRecordingStream() : onClose}
            disabled={busy}
          >
            {state === 'review' || state === 'error' ? 'Перезаписать' : 'Отмена'}
          </button>
          <button
            type="button"
            className={`send-button video-note-recorder-main-action${
              state === 'recording' ? ' recording' : ''
            }`}
            onClick={() => {
              if (state === 'review' || (state === 'error' && reviewBlobRef.current)) {
                void handleUse()
                return
              }

              if (state === 'recording') {
                stopRecording()
                return
              }

              if (state === 'ready') {
                startRecording()
                return
              }

              if (state === 'error') {
                void requestRecordingStream()
              }
            }}
            disabled={busy || state === 'requesting-permission'}
          >
            {busy ? 'Сохраняем...' : mainActionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
