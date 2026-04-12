import { useEffect, type MouseEvent as ReactMouseEvent } from 'react'
import type { MessageAttachment } from '../app/types'
import { formatAttachmentSize, isImageMimeType, isVideoMimeType } from '../app/utils'

type MediaViewerOverlayProps = {
  allowDownload?: boolean
  attachment: MessageAttachment
  onClose: () => void
  onPrimaryAction?: () => void
  primaryActionBusy?: boolean
  primaryActionLabel?: string
  onReport?: () => void
  reportBusy?: boolean
  reportToast?: string
}

export function MediaViewerOverlay({
  allowDownload = true,
  attachment,
  onClose,
  onPrimaryAction,
  primaryActionBusy = false,
  primaryActionLabel = '',
  onReport,
  reportBusy = false,
  reportToast = '',
}: MediaViewerOverlayProps) {
  const isImage = isImageMimeType(attachment.mimeType)
  const isVideo = isVideoMimeType(attachment.mimeType)

  function handleDownloadClick(event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation()

    const link = document.createElement('a')
    link.href = attachment.mediaUrl
    link.download = attachment.fileName || 'attachment'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      className="media-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={attachment.fileName}
      onClick={onClose}
    >
      <div className="media-viewer-toolbar" onClick={(event) => event.stopPropagation()}>
        <div className="media-viewer-actions">
          {onPrimaryAction && primaryActionLabel ? (
            <button
              type="button"
              className="media-viewer-download"
              onClick={(event) => {
                event.stopPropagation()
                onPrimaryAction()
              }}
              disabled={primaryActionBusy}
            >
              <span className="media-viewer-download-label">
                {primaryActionBusy ? 'Добавляем...' : primaryActionLabel}
              </span>
            </button>
          ) : null}
          {allowDownload ? (
            <button
              type="button"
              className="media-viewer-download"
              onClick={handleDownloadClick}
              aria-label="Скачать вложение"
              title="Скачать вложение"
            >
              <span className="media-viewer-download-label">Скачать</span>
            </button>
          ) : null}
          {onReport ? (
            <button
              type="button"
              className="media-viewer-report"
              onClick={(event) => {
                event.stopPropagation()
                onReport()
              }}
              disabled={reportBusy || attachment.reportState?.alreadyReported}
            >
              {attachment.reportState?.alreadyReported
                ? 'Вы уже отправляли жалобу'
                : reportBusy
                  ? 'Отправляем...'
                  : 'Пожаловаться'}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="media-viewer-close"
          onClick={onClose}
          aria-label="Закрыть просмотр"
          title="Закрыть просмотр"
        >
          <img src="/icons/cancel.png" alt="" aria-hidden="true" />
        </button>
      </div>
      <figure className="media-viewer-figure" onClick={onClose}>
        {isImage ? (
          <img src={attachment.mediaUrl} alt={attachment.fileName} className="media-viewer-image" />
        ) : isVideo ? (
          <video
            src={attachment.mediaUrl}
            className="media-viewer-video"
            controls
            playsInline
            preload="metadata"
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <div className="media-viewer-file-card" onClick={(event) => event.stopPropagation()}>
            <span className="media-viewer-file-badge">Файл</span>
            <strong>{attachment.fileName}</strong>
            <span>{formatAttachmentSize(attachment.size)}</span>
          </div>
        )}
        <figcaption className="media-viewer-caption">{attachment.fileName}</figcaption>
      </figure>
      {reportToast ? <div className="media-viewer-toast">{reportToast}</div> : null}
    </div>
  )
}
