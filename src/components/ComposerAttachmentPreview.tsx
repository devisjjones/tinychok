import type { ComposerAttachmentDraft } from '../app/composerAttachments'
import { formatAttachmentImageDimensions, formatAttachmentSize } from '../app/utils'

type ComposerAttachmentPreviewProps = {
  attachmentDraft: ComposerAttachmentDraft
  onClear: () => void
  onOpenPremiumUpsell?: () => void
  onToggleSendOriginal?: () => void
  premiumUnlocked?: boolean
}

export function ComposerAttachmentPreview({
  attachmentDraft,
  onClear,
  onOpenPremiumUpsell,
  onToggleSendOriginal,
  premiumUnlocked = false,
}: ComposerAttachmentPreviewProps) {
  const imageAttachment = attachmentDraft.kind === 'image'
  const dimensionsLabel = imageAttachment
    ? formatAttachmentImageDimensions(attachmentDraft.width, attachmentDraft.height)
    : null
  const statusCopy =
    attachmentDraft.status === 'preparing'
      ? 'Подготавливаем фото...'
      : attachmentDraft.status === 'error'
        ? attachmentDraft.error ?? 'Не удалось подготовить вложение.'
        : imageAttachment
          ? attachmentDraft.sendOriginal
            ? `Оригинал ${formatAttachmentSize(attachmentDraft.originalSize)}, ${dimensionsLabel}`
            : attachmentDraft.processedSize && attachmentDraft.processedSize !== attachmentDraft.originalSize
              ? `Сжатая версия ${formatAttachmentSize(attachmentDraft.processedSize)}, ${dimensionsLabel}`
              : `Фото ${formatAttachmentSize(attachmentDraft.size)}, ${dimensionsLabel}`
          : formatAttachmentSize(attachmentDraft.size)

  return (
    <div className="composer-attachment-preview">
      {imageAttachment ? (
        <img
          src={attachmentDraft.previewUrl}
          alt={attachmentDraft.fileName}
          className="composer-attachment-preview-image"
        />
      ) : (
        <div className="composer-attachment-preview-file-badge">Файл</div>
      )}
      <div className="composer-attachment-preview-copy">
        <strong>{attachmentDraft.fileName}</strong>
        <span className={attachmentDraft.status === 'error' ? 'composer-attachment-preview-status error' : 'composer-attachment-preview-status'}>
          {statusCopy}
        </span>
        {imageAttachment && attachmentDraft.status === 'ready' && onToggleSendOriginal ? (
          <button
            type="button"
            className={`composer-attachment-premium-toggle${premiumUnlocked ? '' : ' locked'}${attachmentDraft.sendOriginal ? ' active' : ''}`}
            onClick={() => {
              if (!premiumUnlocked) {
                onOpenPremiumUpsell?.()
                return
              }

              onToggleSendOriginal()
            }}
            aria-label="Отправить без сжатия"
            title={premiumUnlocked ? 'Отправить без сжатия' : 'Доступно в премиуме'}
          >
            <span className="premium-crown composer-attachment-premium-crown" aria-hidden="true">
              <img src="/icons/crown64.png" alt="" />
            </span>
            {attachmentDraft.sendOriginal ? 'Без сжатия включено' : 'Отправить без сжатия'}
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
