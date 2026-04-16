import type {
  ChangeEvent,
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react'
import React, { useLayoutEffect, useState } from 'react'
import type { ComposerAttachmentDraft } from '../app/composerAttachments'
import { insertComposerTextAtCursor, resizeComposerTextarea } from '../app/utils'
import type { EditTarget, GroupParticipant, ReplyTarget, UserGifLibraryItem } from '../app/types'
import {
  filterComposerMentionCandidates,
  findComposerMentionMatch,
  replaceComposerMentionMatch,
} from '../shared/composerMentions'
import { preserveComposerFocusOnPrimaryAction } from '../shared/utils'
import { ComposerAttachmentPicker } from './ComposerAttachmentPicker'
import { ComposerAttachmentPreview } from './ComposerAttachmentPreview'
import { EmojiPicker } from './EmojiPicker'

void React

type RoomComposerProps = {
  attachmentDraft?: ComposerAttachmentDraft
  attachmentInputRef: RefObject<HTMLInputElement | null>
  attachmentName: string
  attachmentModes?: Array<'file' | 'photo'>
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
  onDraftFocus?: () => void
  onEditCancel?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onOpenAttachmentPicker: (mode: 'file' | 'photo') => void
  onOpenPremiumUpsell?: () => void
  onReplyCancel?: () => void
  onOpenVideoNoteRecorder?: () => void
  onSearchGifs?: (query: string) => Promise<UserGifLibraryItem[]>
  onSelectGif?: (gif: UserGifLibraryItem) => void
  onSubmit: () => void | Promise<void>
  onToggleSendOriginal?: () => void
  onUploadGif?: (file: File) => Promise<void>
  mentionCandidates?: GroupParticipant[]
  placeholder: string
  premiumUnlocked?: boolean
  editTarget?: EditTarget | null
  replyTarget?: ReplyTarget | null
  showEmojiPicker?: boolean
  storageCleanupWarning?: ReactNode
  submitAriaLabel?: string
  submitDisabled?: boolean
  submitTitle?: string
  videoNoteDisabled?: boolean
  videoNoteTitle?: string
  topContent?: ReactNode
  bottomContent?: ReactNode
  draftDisabled?: boolean
}

export function RoomComposer({
  attachmentDraft,
  attachmentInputRef,
  attachmentName,
  attachmentModes = ['photo', 'file'],
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
  onDraftFocus,
  onEditCancel,
  onKeyDown,
  onOpenAttachmentPicker,
  onOpenPremiumUpsell,
  onReplyCancel,
  onOpenVideoNoteRecorder,
  onSearchGifs,
  onSelectGif,
  onSubmit,
  onToggleSendOriginal,
  onUploadGif,
  mentionCandidates = [],
  placeholder,
  premiumUnlocked = false,
  editTarget = null,
  replyTarget = null,
  showEmojiPicker = true,
  storageCleanupWarning = null,
  submitAriaLabel = 'Отправить',
  submitDisabled = false,
  submitTitle = 'Отправить',
  videoNoteDisabled = false,
  videoNoteTitle = 'Записать видеосообщение',
  topContent = null,
  bottomContent = null,
  draftDisabled = false,
}: RoomComposerProps) {
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [mentionCursorPosition, setMentionCursorPosition] = useState<number | null>(null)
  const [mentionNavigationState, setMentionNavigationState] = useState<{
    index: number
    tokenKey: string | null
  }>({
    index: 0,
    tokenKey: null,
  })
  const hasComposerPayload = draft.trim().length > 0 || Boolean(attachmentDraft)
  const canOpenVideoNoteRecorder = Boolean(onOpenVideoNoteRecorder)
  const composerBanner = editTarget
    ? {
        cancelAriaLabel: 'Отменить редактирование',
        cancelTitle: 'Отменить редактирование',
        label: 'Редактирование',
        onCancel: onEditCancel,
        text: editTarget.text,
      }
    : replyTarget
      ? {
          cancelAriaLabel: 'Отменить ответ',
          cancelTitle: 'Отменить ответ',
          label: 'Ответ',
          onCancel: onReplyCancel,
          text: replyTarget.text,
        }
      : null
  const activeMentionMatch =
    mentionCursorPosition === null || mentionCandidates.length === 0 || draftDisabled
      ? null
      : findComposerMentionMatch(draft, mentionCursorPosition)
  const mentionMenuCandidates = activeMentionMatch
    ? filterComposerMentionCandidates(mentionCandidates, activeMentionMatch.query)
    : []
  const activeMentionTokenKey = activeMentionMatch
    ? `${activeMentionMatch.rangeStart}:${activeMentionMatch.rangeEnd}:${activeMentionMatch.query}`
    : null
  const activeMentionIndex =
    mentionNavigationState.tokenKey === activeMentionTokenKey && mentionMenuCandidates.length > 0
      ? Math.min(mentionNavigationState.index, mentionMenuCandidates.length - 1)
      : 0

  useLayoutEffect(() => {
    const textarea = draftInputRef.current
    if (!textarea) return

    const syncTextareaSize = () => {
      const { expanded } = resizeComposerTextarea(textarea)
      setComposerExpanded(expanded)
    }

    syncTextareaSize()
    if (typeof window === 'undefined') return

    window.addEventListener('resize', syncTextareaSize)
    return () => {
      window.removeEventListener('resize', syncTextareaSize)
    }
  }, [draft, draftInputRef])

  function preserveDraftFocusOnPrimaryAction(
    event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>,
  ) {
    preserveComposerFocusOnPrimaryAction(draftInputRef.current, event)
  }

  function syncMentionCursorPosition(textarea: HTMLTextAreaElement) {
    setMentionCursorPosition(textarea.selectionStart ?? draft.length)
  }

  function applyMentionCandidate(candidate: GroupParticipant) {
    if (!activeMentionMatch) return

    const { nextCursorPosition, nextValue } = replaceComposerMentionMatch(
      draft,
      activeMentionMatch,
      candidate.nickname ?? '',
    )
    onDraftChange(nextValue)
    setMentionCursorPosition(nextCursorPosition)

    if (typeof window === 'undefined') {
      return
    }

    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus()
      draftInputRef.current?.setSelectionRange(nextCursorPosition, nextCursorPosition)
    })
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionMenuCandidates.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMentionNavigationState({
          index: (activeMentionIndex + 1) % mentionMenuCandidates.length,
          tokenKey: activeMentionTokenKey,
        })
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionNavigationState({
          index: (activeMentionIndex - 1 + mentionMenuCandidates.length) % mentionMenuCandidates.length,
          tokenKey: activeMentionTokenKey,
        })
        return
      }

      if ((event.key === 'Enter' || event.key === 'Tab') && mentionMenuCandidates[activeMentionIndex]) {
        event.preventDefault()
        applyMentionCandidate(mentionMenuCandidates[activeMentionIndex]!)
        return
      }
    }

    onKeyDown?.(event)
  }

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
        {composerBanner ? (
          <div className="composer-reply">
            <div>
              <span className="settings-label">{composerBanner.label}</span>
              <p>{composerBanner.text}</p>
            </div>
            <button
              type="button"
              className="soft-button composer-reply-cancel"
              onClick={composerBanner.onCancel}
              aria-label={composerBanner.cancelAriaLabel}
              title={composerBanner.cancelTitle}
            >
              <img src="/icons/cancel.png" alt="" aria-hidden="true" className="composer-reply-cancel-icon" />
            </button>
          </div>
        ) : null}
        <div className="composer-entry">
          <div
            className={`composer-field${attachmentDraft ? ' composer-field-has-attachment' : ''}${composerExpanded ? ' composer-field-expanded' : ''}`}
          >
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
              rows={1}
              value={draft}
              disabled={draftDisabled}
              onChange={(event) => {
                onDraftChange(event.target.value)
                syncMentionCursorPosition(event.currentTarget)
              }}
              onFocus={(event) => {
                onDraftFocus?.()
                syncMentionCursorPosition(event.currentTarget)
              }}
              onBlur={() => setMentionCursorPosition(null)}
              onPaste={onComposerPaste}
              onKeyDown={handleDraftKeyDown}
              onClick={(event) => syncMentionCursorPosition(event.currentTarget)}
              onSelect={(event) => syncMentionCursorPosition(event.currentTarget)}
            />
            {mentionMenuCandidates.length > 0 ? (
              <div className="composer-mention-popover" role="listbox" aria-label="Упоминания участников">
                {mentionMenuCandidates.map((candidate, index) => {
                  const isActive = index === activeMentionIndex
                  const avatarFallback = candidate.title.trim().slice(0, 1).toUpperCase() || '@'

                  return (
                    <button
                      key={candidate.identifier ?? candidate.nickname ?? candidate.title}
                      type="button"
                      className={`composer-mention-option${isActive ? ' active' : ''}`}
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(event) => event.preventDefault()}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => applyMentionCandidate(candidate)}
                    >
                      <span
                        className="avatar composer-mention-avatar"
                        style={{ backgroundColor: candidate.accent }}
                        aria-hidden="true"
                      >
                        {candidate.avatarImage ? (
                          <img src={candidate.avatarImage} alt="" className="composer-mention-avatar-image" />
                        ) : (
                          avatarFallback
                        )}
                      </span>
                      <span className="composer-mention-meta">
                        <span className="composer-mention-title-row">
                          <span className="composer-mention-title">{candidate.title}</span>
                          {candidate.premium ? (
                            <span className="premium-crown composer-mention-crown" aria-label="Премиум">
                              <img src="/icons/crown64.png" alt="" />
                            </span>
                          ) : null}
                        </span>
                        <span className="composer-mention-nickname">@{candidate.nickname}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null}
            <div className="composer-tools">
              {showEmojiPicker ? (
                <EmojiPicker
                  canSelectGif={!gifSelectionBlockedReason}
                  disabled={draftDisabled}
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
              ) : null}
              <ComposerAttachmentPicker
                attachmentName={attachmentName}
                attachmentModes={attachmentModes}
                disabled={Boolean(editTarget) || draftDisabled}
                onSelectMode={onOpenAttachmentPicker}
                premiumUnlocked={premiumUnlocked}
              />
              {hasComposerPayload ? (
                <button
                  type="submit"
                  className="send-button composer-send"
                  disabled={submitDisabled}
                  onMouseDown={preserveDraftFocusOnPrimaryAction}
                  onPointerDown={preserveDraftFocusOnPrimaryAction}
                  aria-label={submitAriaLabel}
                  title={submitTitle}
                >
                  <span className="composer-send-icon" aria-hidden="true">
                    <img src="/icons/sent.png" alt="" />
                  </span>
                </button>
              ) : canOpenVideoNoteRecorder ? (
                <button
                  type="button"
                  className="send-button composer-send composer-send-video-note"
                  onClick={() => {
                    if (videoNoteDisabled || !onOpenVideoNoteRecorder) return
                    onOpenVideoNoteRecorder()
                  }}
                  disabled={videoNoteDisabled}
                  aria-label="Записать видеосообщение"
                  title={videoNoteTitle}
                >
                  <span className="composer-send-icon" aria-hidden="true">
                    <img src="/icons/round.svg" alt="" />
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
