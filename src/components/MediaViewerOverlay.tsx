import { useEffect, type MouseEvent as ReactMouseEvent } from 'react'
import type { MessageAttachment } from '../app/types'

type MediaViewerOverlayProps = {
  allowDownload?: boolean
  attachment: MessageAttachment
  onClose: () => void
}

export function MediaViewerOverlay({
  allowDownload = true,
  attachment,
  onClose,
}: MediaViewerOverlayProps) {
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
      {allowDownload ? (
        <button
          type="button"
          className="media-viewer-download"
          onClick={handleDownloadClick}
          aria-label="Скачать фотографию"
          title="Скачать фотографию"
        >
          <span className="media-viewer-download-label">Скачать</span>
        </button>
      ) : null}
      <button
        type="button"
        className="media-viewer-close"
        onClick={onClose}
        aria-label="Закрыть просмотр"
        title="Закрыть просмотр"
      >
        <img src="/icons/cancel.png" alt="" aria-hidden="true" />
      </button>
      <figure className="media-viewer-figure" onClick={onClose}>
        <img src={attachment.mediaUrl} alt={attachment.fileName} className="media-viewer-image" />
        <figcaption className="media-viewer-caption">{attachment.fileName}</figcaption>
      </figure>
    </div>
  )
}
