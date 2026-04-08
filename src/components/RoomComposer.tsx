import type {
  ChangeEvent,
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from 'react'
import type { ComposerAttachmentDraft } from '../app/composerAttachments'
import { insertComposerTextAtCursor } from '../app/utils'
import type { ReplyTarget, UserGifLibraryItem } from '../app/types'
import { ComposerAttachmentPicker } from './ComposerAttachmentPicker'
import { ComposerAttachmentPreview } from './ComposerAttachmentPreview'
import { EmojiPicker } from './EmojiPicker'

type RoomComposerProps = {
  attachmentDraft?: ComposerAttachmentDraft
  attachmentInputRef: RefObject<HTMLInputElement | null>
  attachmentName: string
  className?: string
  draft: string
  draftInputRef: RefObject<HTMLTextAreaElement | null>
  gifLibrary?: UserGifLibraryItem[]
  gifSelectionBlockedReason?: string | null
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  onAttachmentClear: () => void
  onAttachmentPreviewOpen?: () => void
  onRenameAttachmentFileBaseName?: (nextBaseName: string) => void
  onComposerPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void | Promise<void>
  onDeleteGif?: (gif: UserGifLibraryItem) => Promise<void>
  onDraftChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onOpenAttachmentPicker: (mode: 'file' | 'photo') => void
  onOpenPremiumUpsell?: () => void
  onReplyCancel?: () => void
  onSearchGifs?: (query: string) => Promise<UserGifLibraryItem[]>
  onSelectGif?: (gif: UserGifLibraryItem) => void
  onSubmit: () => void | Promise<void>
  onToggleSendOriginal?: () => void
  onUploadGif?: (file: File) => Promise<void>
  placeholder: string
  premiumUnlocked?: boolean
  replyTarget?: ReplyTarget | null
  storageCleanupWarning?: ReactNode
  submitAriaLabel?: string
  submitDisabled?: boolean
  submitTitle?: string
  topContent?: ReactNode
  bottomContent?: ReactNode
}

export function RoomComposer({
  attachmentDraft,
  attachmentInputRef,
  attachmentName,
  className = '',
  draft,
  draftInputRef,
  gifLibrary = [],
  gifSelectionBlockedReason = null,
  onAttachmentChange,
  onAttachmentClear,
  onAttachmentPreviewOpen,
  onRenameAttachmentFileBaseName,
  onComposerPaste,
  onDeleteGif,
  onDraftChange,
  onKeyDown,
  onOpenAttachmentPicker,
  onOpenPremiumUpsell,
  onReplyCancel,
  onSearchGifs,
  onSelectGif,
  onSubmit,
  onToggleSendOriginal,
  onUploadGif,
  placeholder,
  premiumUnlocked = false,
  replyTarget = null,
  storageCleanupWarning = null,
  submitAriaLabel = 'Отправить',
  submitDisabled = false,
  submitTitle = 'Отправить',
  topContent = null,
  bottomContent = null,
}: RoomComposerProps) {
  const hasComposerPayload = draft.trim().length > 0 || Boolean(attachmentDraft)

  return (
    <form
      className={className ? `composer ${className}` : 'composer'}
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        await Promise.resolve(onSubmit())
      }}
    >
      {topContent}
      <div className="composer-input">
        {replyTarget ? (
          <div className="composer-reply">
            <div>
              <span className="settings-label">Ответ</span>
              <p>{replyTarget.text}</p>
            </div>
            <button
              type="button"
              className="soft-button composer-reply-cancel"
              onClick={onReplyCancel}
              aria-label="Отменить ответ"
              title="Отменить ответ"
            >
              <img src="/icons/cancel.png" alt="" aria-hidden="true" className="composer-reply-cancel-icon" />
            </button>
          </div>
        ) : null}
        <div className="composer-entry">
          <div className="composer-field">
            {attachmentDraft ? (
              <ComposerAttachmentPreview
                attachmentDraft={attachmentDraft}
                onClear={onAttachmentClear}
                onOpenPreview={onAttachmentPreviewOpen}
                onRenameFileBaseName={onRenameAttachmentFileBaseName}
                onOpenPremiumUpsell={onOpenPremiumUpsell}
                onToggleSendOriginal={onToggleSendOriginal}
                premiumUnlocked={premiumUnlocked}
                storageCleanupWarning={storageCleanupWarning}
              />
            ) : null}
            <input
              ref={attachmentInputRef}
              type="file"
              className="composer-attachment-input"
              onChange={onAttachmentChange}
            />
            <textarea
              ref={draftInputRef}
              placeholder={placeholder}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onPaste={onComposerPaste}
              onKeyDown={onKeyDown}
            />
            <div className="composer-tools">
              <EmojiPicker
                canSelectGif={!gifSelectionBlockedReason}
                gifLibrary={gifLibrary}
                gifSelectionBlockedReason={gifSelectionBlockedReason}
                onDeleteGif={onDeleteGif}
                onOpenPremiumUpsell={onOpenPremiumUpsell}
                onSearchGifs={onSearchGifs}
                onSelect={(emoji) =>
                  insertComposerTextAtCursor(draftInputRef.current, draft, emoji, onDraftChange)
                }
                onSelectGif={onSelectGif}
                onUploadGif={onUploadGif}
                premiumUnlocked={premiumUnlocked}
              />
              <ComposerAttachmentPicker
                attachmentName={attachmentName}
                onSelectMode={onOpenAttachmentPicker}
                premiumUnlocked={premiumUnlocked}
              />
              {hasComposerPayload ? (
                <button
                  type="submit"
                  className="send-button composer-send"
                  disabled={submitDisabled}
                  aria-label={submitAriaLabel}
                  title={submitTitle}
                >
                  <span className="composer-send-icon" aria-hidden="true">
                    <img src="/icons/sent.png" alt="" />
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {bottomContent}
    </form>
  )
}
