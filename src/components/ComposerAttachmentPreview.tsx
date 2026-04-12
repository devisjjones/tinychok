import React, { useEffect, useMemo, useState, type ReactNode } from 'react'

import { composerAttachmentRenameMaxLength } from '../app/constants'
import {
  getComposerAttachmentFileNameParts,
  type ComposerAttachmentDraft,
} from '../app/composerAttachments'
import { formatAttachmentImageDimensions, formatAttachmentSize, isVideoMimeType } from '../app/utils'

// Keep the classic JSX runtime symbol available for server-side contract tests executed via `tsx`.
void React

type ComposerAttachmentPreviewProps = {
  attachmentDraft: ComposerAttachmentDraft
  onClear: () => void
  onOpenPreview?: () => void
  onRenameFileBaseName?: (nextBaseName: string) => void
  onOpenPremiumUpsell?: () => void
  onToggleSendOriginal?: () => void
  premiumUnlocked?: boolean
  storageCleanupWarning?: ReactNode
}

export function ComposerAttachmentPreview({
  attachmentDraft,
  onClear,
  onOpenPreview,
  onRenameFileBaseName,
  onOpenPremiumUpsell,
  onToggleSendOriginal,
  premiumUnlocked = false,
  storageCleanupWarning = null,
}: ComposerAttachmentPreviewProps) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [videoPreviewFailed, setVideoPreviewFailed] = useState(false)
  const imageAttachment = attachmentDraft.kind === 'image'
  const videoNoteAttachment = attachmentDraft.kind === 'video-note'
  const videoAttachment = !imageAttachment && isVideoMimeType(attachmentDraft.mimeType)
  const fileNameParts = useMemo(
    () => getComposerAttachmentFileNameParts(attachmentDraft.fileName),
    [attachmentDraft.fileName],
  )
  const [renameBaseName, setRenameBaseName] = useState(
    fileNameParts.baseName.slice(0, composerAttachmentRenameMaxLength),
  )
  const dimensionsLabel = imageAttachment
    ? formatAttachmentImageDimensions(attachmentDraft.width, attachmentDraft.height)
    : null
  let statusCopy: string

  useEffect(() => {
    if (renameOpen) return
    setRenameBaseName(fileNameParts.baseName.slice(0, composerAttachmentRenameMaxLength))
  }, [fileNameParts.baseName, renameOpen])

  useEffect(() => {
    setVideoPreviewFailed(false)
  }, [attachmentDraft.previewUrl])

  if (attachmentDraft.status === 'preparing') {
    statusCopy = videoNoteAttachment ? 'Подготавливаем видеосообщение...' : 'Подготавливаем фото...'
  } else if (attachmentDraft.status === 'error') {
    statusCopy = attachmentDraft.error ?? 'Не удалось подготовить вложение.'
  } else if (videoNoteAttachment) {
    statusCopy = `Видео ${formatAttachmentSize(attachmentDraft.size)}`
  } else if (!imageAttachment) {
    statusCopy = `${videoAttachment ? 'Видео' : 'Файл'} ${formatAttachmentSize(attachmentDraft.size)}`
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

  const canRename =
    !videoNoteAttachment && Boolean(onRenameFileBaseName) && attachmentDraft.status !== 'preparing'
  const canSaveRename = renameBaseName.trim().length > 0

  function handleOpenRename() {
    setRenameBaseName(fileNameParts.baseName.slice(0, composerAttachmentRenameMaxLength))
    setRenameOpen(true)
  }

  function handleSaveRename() {
    const nextBaseName = renameBaseName.trim()
    if (!nextBaseName || !onRenameFileBaseName) return
    onRenameFileBaseName(nextBaseName)
    setRenameOpen(false)
  }

  return (
    <div className="composer-attachment-preview">
      {videoNoteAttachment ? (
        <button
          type="button"
          className="composer-attachment-preview-video-note-button"
          onClick={() => onOpenPreview?.()}
          aria-label="Открыть превью видеосообщения"
          title="Открыть превью видеосообщения"
        >
          {!videoPreviewFailed ? (
            <video
              src={attachmentDraft.previewUrl}
              className="composer-attachment-preview-video-note"
              muted
              playsInline
              preload="metadata"
              onError={() => setVideoPreviewFailed(true)}
            />
          ) : (
            <span className="composer-attachment-preview-video-note-fallback" aria-hidden="true">
              Видео
            </span>
          )}
          <span className="composer-attachment-preview-video-note-play" aria-hidden="true">
            <span className="composer-attachment-preview-video-note-play-icon" />
          </span>
        </button>
      ) : imageAttachment ? (
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
      ) : videoAttachment && onOpenPreview ? (
        <button
          type="button"
          className="composer-attachment-preview-file-button"
          onClick={() => onOpenPreview()}
          aria-label="Открыть превью видео"
          title="Открыть превью видео"
        >
          <span className="composer-attachment-preview-file-badge video">Видео</span>
        </button>
      ) : (
        <div className={`composer-attachment-preview-file-badge${videoAttachment ? ' video' : ''}`}>
          {videoAttachment ? 'Видео' : 'Файл'}
        </div>
      )}
      <div className="composer-attachment-preview-copy">
        <div className="composer-attachment-preview-title-row">
          <span className="composer-attachment-preview-title-inline">
            <strong title={videoNoteAttachment ? 'Видеосообщение' : attachmentDraft.fileName}>
              {videoNoteAttachment ? 'Видеосообщение' : attachmentDraft.fileName}
            </strong>
            {canRename ? (
              <button
                type="button"
                className="composer-attachment-rename-trigger"
                onClick={handleOpenRename}
                aria-label="Изменить название файла"
                title="Изменить название файла"
              >
                <img src="/icons/edit100.png" alt="" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </div>
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
        {storageCleanupWarning ? (
          <span className="composer-attachment-storage-warning">{storageCleanupWarning}</span>
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
      {renameOpen ? (
        <>
          <button
            type="button"
            className="composer-attachment-rename-backdrop"
            aria-label="Закрыть изменение названия файла"
            onClick={() => setRenameOpen(false)}
          />
          <div
            className="composer-attachment-rename-popover"
            role="dialog"
            aria-modal="true"
            aria-label="Изменить название файла"
            onClick={(event) => event.stopPropagation()}
          >
            <strong className="composer-attachment-rename-heading">Файл</strong>
            <div className="composer-attachment-rename-fieldset">
              <span className="composer-attachment-rename-label">Текущее название</span>
              <span className="composer-attachment-rename-current" title={attachmentDraft.fileName}>
                {attachmentDraft.fileName}
              </span>
            </div>
            <div className="composer-attachment-rename-fieldset">
              <label className="composer-attachment-rename-label" htmlFor="composer-attachment-rename-input">
                Новое название
              </label>
              <div className="composer-attachment-rename-input-row">
                <input
                  id="composer-attachment-rename-input"
                  type="text"
                  className="composer-attachment-rename-input"
                  value={renameBaseName}
                  onChange={(event) => setRenameBaseName(event.target.value.slice(0, composerAttachmentRenameMaxLength))}
                  maxLength={composerAttachmentRenameMaxLength}
                  autoFocus
                />
                {fileNameParts.extension ? (
                  <span className="composer-attachment-rename-extension">{fileNameParts.extension}</span>
                ) : null}
              </div>
            </div>
            <div className="composer-attachment-rename-actions">
              <button
                type="button"
                className="send-button composer-attachment-rename-save"
                disabled={!canSaveRename}
                onClick={handleSaveRename}
              >
                Сохранить
              </button>
              <button
                type="button"
                className="soft-button composer-attachment-rename-back"
                onClick={() => setRenameOpen(false)}
              >
                Назад
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
