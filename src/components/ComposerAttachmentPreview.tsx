import type { ComposerAttachmentDraft } from '../app/composerAttachments'
import { formatAttachmentImageDimensions, formatAttachmentSize } from '../app/utils'

type ComposerAttachmentPreviewProps = {
  attachmentDraft: ComposerAttachmentDraft
  onClear: () => void
  onOpenPreview?: () => void
  onOpenPremiumUpsell?: () => void
  onToggleSendOriginal?: () => void
  premiumUnlocked?: boolean
}

export function ComposerAttachmentPreview({
  attachmentDraft,
  onClear,
  onOpenPreview,
  onOpenPremiumUpsell,
  onToggleSendOriginal,
  premiumUnlocked = false,
}: ComposerAttachmentPreviewProps) {
  const imageAttachment = attachmentDraft.kind === 'image'
  const dimensionsLabel = imageAttachment
    ? formatAttachmentImageDimensions(attachmentDraft.width, attachmentDraft.height)
    : null
  let statusCopy: string

  if (attachmentDraft.status === 'preparing') {
    statusCopy = 'Подготавливаем фото...'
  } else if (attachmentDraft.status === 'error') {
    statusCopy = attachmentDraft.error ?? 'Не удалось подготовить вложение.'
  } else if (!imageAttachment) {
    statusCopy = formatAttachmentSize(attachmentDraft.size)
  } else if (attachmentDraft.mimeType === 'image/gif') {
    statusCopy = `GIF ${formatAttachmentSize(attachmentDraft.size)}${dimensionsLabel ? `, ${dimensionsLabel}` : ''}`
  } else if (attachmentDraft.sendOriginal) {
    statusCopy = `Оригинал ${formatAttachmentSize(attachmentDraft.originalSize)}, ${dimensionsLabel}`
  } else if (
    attachmentDraft.processedSize &&
    attachmentDraft.processedSize !== attachmentDraft.originalSize
  ) {
    statusCopy = `Сжатая версия ${formatAttachmentSize(attachmentDraft.processedSize)}, ${dimensionsLabel}`
  } else {
    statusCopy = `Фото ${formatAttachmentSize(attachmentDraft.size)}, ${dimensionsLabel}`
  }

  return (
    <div className="composer-attachment-preview">
      {imageAttachment ? (
        <button
          type="button"
          className="composer-attachment-preview-image-button"
          onClick={() => onOpenPreview?.()}
          aria-label="Открыть превью фотографии"
          title="Открыть превью фотографии"
        >
          <img
            src={attachmentDraft.previewUrl}
            alt={attachmentDraft.fileName}
            className="composer-attachment-preview-image"
          />
        </button>
      ) : (
        <div className="composer-attachment-preview-file-badge">Файл</div>
      )}
      <div className="composer-attachment-preview-copy">
        <strong>{attachmentDraft.fileName}</strong>
        <span className={attachmentDraft.status === 'error' ? 'composer-attachment-preview-status error' : 'composer-attachment-preview-status'}>
          {statusCopy}
        </span>
        {imageAttachment && attachmentDraft.compressionEligible && attachmentDraft.status === 'ready' && onToggleSendOriginal ? (
          <button
            type="button"
            className={`composer-attachment-checkbox${premiumUnlocked ? '' : ' locked'}${attachmentDraft.sendOriginal ? ' active' : ''}`}
            onClick={() => {
              if (!premiumUnlocked) {
                onOpenPremiumUpsell?.()
                return
              }

              onToggleSendOriginal()
            }}
            aria-label="Без сжатия"
            title={premiumUnlocked ? 'Отправить без сжатия' : 'Доступно в премиуме'}
            role="checkbox"
            aria-checked={attachmentDraft.sendOriginal}
          >
            <span className="composer-attachment-checkbox-box" aria-hidden="true">
              {attachmentDraft.sendOriginal ? <span className="composer-attachment-checkbox-check">✓</span> : null}
            </span>
            <span className="composer-attachment-checkbox-copy">
              <span>Без сжатия</span>
              <span className="premium-crown composer-attachment-premium-crown" aria-hidden="true">
                <img src="/icons/crown64.png" alt="" />
              </span>
            </span>
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="soft-button composer-attachment-preview-clear"
        onClick={onClear}
        aria-label="Убрать вложение"
        title="Убрать вложение"
      >
        <img
          src="/icons/cancel.png"
          alt=""
          aria-hidden="true"
          className="composer-attachment-preview-clear-icon"
        />
      </button>
    </div>
  )
}
