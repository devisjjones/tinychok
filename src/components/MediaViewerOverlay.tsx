import { useEffect } from 'react'
import type { MessageAttachment } from '../app/types'

type MediaViewerOverlayProps = {
  attachment: MessageAttachment
  onClose: () => void
}

export function MediaViewerOverlay({
  attachment,
  onClose,
}: MediaViewerOverlayProps) {
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
