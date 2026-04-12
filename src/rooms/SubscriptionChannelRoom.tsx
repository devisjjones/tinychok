import type { ChangeEvent, ClipboardEvent, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react'
import { Fragment, useEffect, useRef } from 'react'
import type { ComposerAttachmentDraft } from '../app/composerAttachments'
import {
  formatChannelAvatarLabel,
  formatConversationDayLabel,
  formatMessageTimeLabel,
  getConversationDayKey,
  isImageMimeType,
  isVideoNoteAttachment,
  isVideoMimeType,
  scrollFeedChildIntoView,
  shouldAutoFocusTextInputOnSceneOpen,
  shouldSubmitComposerWithEnter,
} from '../app/utils'
import type { EditTarget, Message, ReplyTarget, SubscriptionChannel, UserGifLibraryItem } from '../app/types'
import {
  BubbleImageOverlayMeta,
  BubbleMessageContent,
  BubbleTextInlineMeta,
} from '../components/BubbleMessageContent'
import { AttachedReplyBubble } from '../components/AttachedReplyBubble'
import { ConversationDayDivider } from '../components/ConversationDayDivider'
import { MediaOnlyBubbleRow } from '../components/MediaOnlyBubbleRow'
import { RoomComposer } from '../components/RoomComposer'
import { ThreadedBubble } from '../components/ThreadedBubble'

type SubscriptionChannelRoomProps = {
  actions: ReactNode
  activePostId: number | null
  channel: SubscriptionChannel
  messageFeedRef: RefObject<HTMLDivElement | null>
  onBack: () => void
  visiblePosts: SubscriptionChannel['posts']
  onOpenChannelActions?: (event: MouseEvent<HTMLButtonElement>) => void
  onOpenSubscribers?: () => void
  onOpenAttachment: (attachment: NonNullable<Message['attachment']>) => void
  onOpenExternalLink?: (url: string) => void
  onOpenSourceContact?: (sourceContact: NonNullable<Message['sourceContact']>) => void
  onOpenThread?: (postId: number) => void
  onPostSelect: (anchorElement: HTMLElement, postId: number) => void
  onReplyReferenceJump?: (postId: number) => void
  publisher?: {
    attachmentDraft?: ComposerAttachmentDraft
    attachmentInputRef?: RefObject<HTMLInputElement | null>
    attachmentName?: string
    draft: string
    error?: string
    isBusy?: boolean
    onAttachmentChange?: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
    onComposerPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void | Promise<void>
    onAttachmentClear?: () => void
    onAttachmentPreviewOpen?: () => void
    onRenameAttachmentFileBaseName?: (nextBaseName: string) => void
    onOpenAttachmentPicker?: (mode: 'file' | 'photo') => void
    onOpenVideoNoteRecorder?: () => void
    onOpenPremiumUpsell?: () => void
    onEditCancel?: () => void
    onReplyCancel: () => void
    onDeleteGif?: (gif: UserGifLibraryItem) => Promise<void>
    onSearchGifs?: (query: string) => Promise<UserGifLibraryItem[]>
    onDraftChange: (value: string) => void
    onSelectGif?: (gif: UserGifLibraryItem) => void
    onToggleSendOriginal?: () => void
    onUploadGif?: (file: File) => Promise<void>
    premiumUnlocked?: boolean
    gifLibrary?: UserGifLibraryItem[]
    gifSelectionBlockedReason?: string | null
    editTarget?: EditTarget | null
    replyTarget: ReplyTarget | null
    storageCleanupWarning?: ReactNode
    onSubmit: () => void
  }
  subscriptionAction?: {
    busy?: boolean
    error?: string
    label: string
    onClick: () => void
  }
  showOwnerEditIcon?: boolean
  subscriberCountLabel: string
}

export function SubscriptionChannelRoom({
  actions,
  activePostId,
  channel,
  messageFeedRef,
  onBack,
  visiblePosts,
  onOpenChannelActions,
  onOpenSubscribers,
  onOpenAttachment,
  onOpenExternalLink,
  onOpenSourceContact,
  onOpenThread,
  onPostSelect,
  onReplyReferenceJump,
  publisher,
  showOwnerEditIcon,
  subscriberCountLabel,
  subscriptionAction,
}: SubscriptionChannelRoomProps) {
  const publisherInputRef = useRef<HTMLTextAreaElement | null>(null)
  const publisherAttachmentDraft = publisher?.attachmentDraft
  const publisherAttachmentInputRef = publisher?.attachmentInputRef
  const publisherAttachmentName = publisher?.attachmentName ?? ''
  const publisherDraft = publisher?.draft ?? ''
  const publisherError = publisher?.error ?? ''
  const publisherBusy = Boolean(publisher?.isBusy)
  const publisherOnAttachmentChange = publisher?.onAttachmentChange
  const publisherOnAttachmentClear = publisher?.onAttachmentClear
  const publisherOnComposerPaste = publisher?.onComposerPaste
  const publisherOnAttachmentPreviewOpen = publisher?.onAttachmentPreviewOpen
  const publisherOnRenameAttachmentFileBaseName = publisher?.onRenameAttachmentFileBaseName
  const publisherOnOpenAttachmentPicker = publisher?.onOpenAttachmentPicker
  const publisherOnOpenVideoNoteRecorder = publisher?.onOpenVideoNoteRecorder
  const publisherOnOpenPremiumUpsell = publisher?.onOpenPremiumUpsell
  const publisherOnEditCancel = publisher?.onEditCancel
  const publisherOnReplyCancel = publisher?.onReplyCancel
  const publisherOnDeleteGif = publisher?.onDeleteGif
  const publisherOnSearchGifs = publisher?.onSearchGifs
  const publisherOnDraftChange = publisher?.onDraftChange
  const publisherOnSelectGif = publisher?.onSelectGif
  const publisherOnToggleSendOriginal = publisher?.onToggleSendOriginal
  const publisherOnUploadGif = publisher?.onUploadGif
  const publisherPremiumUnlocked = Boolean(publisher?.premiumUnlocked)
  const publisherGifLibrary = publisher?.gifLibrary ?? []
  const publisherGifSelectionBlockedReason = publisher?.gifSelectionBlockedReason ?? null
  const publisherEditTarget = publisher?.editTarget ?? null
  const publisherReplyTarget = publisher?.replyTarget ?? null
  const publisherStorageCleanupWarning = publisher?.storageCleanupWarning ?? null
  const publisherOnSubmit = publisher?.onSubmit
  const publisherCanSubmit = publisherAttachmentDraft
    ? publisherAttachmentDraft.status === 'ready' && !publisherBusy
    : publisherDraft.trim().length > 0 && !publisherBusy
  const publisherPlaceholder = publisherAttachmentDraft
    ? publisherAttachmentDraft.kind === 'video-note'
      ? 'Видеосообщение отправится без подписи.'
      : isImageMimeType(publisherAttachmentDraft.mimeType)
      ? 'Добавьте подпись к фотографии...'
      : isVideoMimeType(publisherAttachmentDraft.mimeType)
        ? 'Добавьте подпись к видео...'
        : 'Добавьте подпись к файлу...'
    : 'Напишите сообщение в канал...'
  const publisherDraftDisabled = publisherAttachmentDraft?.kind === 'video-note'
  const publisherVideoNoteDisabled = Boolean(publisherAttachmentDraft) || publisherDraft.trim().length > 0
  const publisherVideoNoteTitle = publisherVideoNoteDisabled
    ? 'Уберите текст или текущее вложение, чтобы записать видеосообщение'
    : 'Записать видеосообщение'

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!publisher || (!publisherDraft.trim() && !publisherAttachmentDraft) || !publisherCanSubmit) return
    if (
      !shouldSubmitComposerWithEnter({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      return
    }

    event.preventDefault()
    publisherOnSubmit?.()
  }

  function jumpToPost(postId: number) {
    if (onReplyReferenceJump) {
      onReplyReferenceJump(postId)
      return
    }

    void window.requestAnimationFrame(() => {
      scrollFeedChildIntoView(messageFeedRef.current, `[data-channel-post-id="${postId}"]`)
    })
  }

  useEffect(() => {
    if (!publisherReplyTarget && !publisherEditTarget) return

    window.requestAnimationFrame(() => {
      publisherInputRef.current?.focus()
    })
  }, [publisherEditTarget, publisherReplyTarget])

  useEffect(() => {
    if (!publisher) return
    if (!shouldAutoFocusTextInputOnSceneOpen()) return

    window.requestAnimationFrame(() => {
      publisherInputRef.current?.focus()
    })
  }, [channel.id, publisher])

  return (
    <>
      <section className="chat-room channel-room">
        <header className="room-header">
          <button
            type="button"
            className="soft-button room-mobile-back"
            onClick={onBack}
            aria-label="Назад"
            title="Назад"
          >
            <img src="/icons/back.png" alt="" aria-hidden="true" className="room-mobile-back-icon" />
        </button>
        <div className="room-id">
          <span className="avatar large" style={{ backgroundColor: channel.accent }}>
            {channel.avatarImage ? (
              <img src={channel.avatarImage} alt="" className="channel-avatar-image" />
            ) : (
              formatChannelAvatarLabel(channel.title)
            )}
          </span>
            <div>
                <div className="room-title">
                <div className="room-title-name">
                  <h3>{channel.title}</h3>
                  <span className="chat-star">
                    <img src="/icons/news100.svg" alt="Канал" />
                  </span>
                  {showOwnerEditIcon ? (
                    <span className="room-owner-edit-badge" aria-label="Вы владелец канала" title="Вы владелец канала">
                      <img src="/icons/edit100.png" alt="" aria-hidden="true" />
                    </span>
                  ) : null}
                  {channel.archivedAt ? <span className="room-archive-badge">Архив</span> : null}
                  {channel.muted ? (
                    <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                      <img src="/icons/bell-100.png" alt="" />
                    </span>
                  ) : null}
                </div>
              </div>
              {channel.statusText ? <p className="room-channel-status">{channel.statusText}</p> : null}
              {channel.archivedAt ? (
                <p className="room-archive-note">
                  {channel.archiveReason === 'owner-deleted'
                    ? 'Канал удалён владельцем и доступен только как пустой архивный экран.'
                    : 'Канал находится в архиве и доступен только для чтения.'}
                </p>
              ) : null}
              {onOpenSubscribers ? (
                <button type="button" className="room-members-link" onClick={onOpenSubscribers}>
                  {subscriberCountLabel}
                </button>
              ) : (
                <p>{subscriberCountLabel}</p>
              )}
            </div>
          </div>
          {onOpenChannelActions ? (
            <button
              type="button"
              className="soft-button icon-button room-group-actions-toggle"
              onClick={onOpenChannelActions}
              aria-label="Действия канала"
              title="Действия канала"
            >
              <img src="/icons/menu.png" alt="" aria-hidden="true" className="room-menu-icon" />
            </button>
          ) : null}
        </header>

        <div className="message-feed" ref={messageFeedRef}>
          {visiblePosts.map((post, index) => {
            const previousPost = index > 0 ? visiblePosts[index - 1] : null
            const postDayKey = getConversationDayKey(post.createdAt)
            const previousPostDayKey = previousPost ? getConversationDayKey(previousPost.createdAt) : null
          const replyReference = post.replyTo
          const hasImageAttachment = Boolean(
            post.attachment &&
            (isImageMimeType(post.attachment.mimeType) || isVideoMimeType(post.attachment.mimeType)),
          )
          const isImageOnlyBubble = hasImageAttachment && post.text.trim().length === 0
          const isVideoNoteOnlyBubble =
            isImageOnlyBubble &&
            Boolean(post.attachment && isVideoNoteAttachment(post.attachment))
          const shouldUseInlineTextMeta =
            !hasImageAttachment && (post.text.trim().length > 0 || Boolean(post.attachment))
          // Keep every room surface on the same createdAt-first time contract.
          const renderedPostTime = formatMessageTimeLabel(post.createdAt, post.time)

          return (
              <Fragment key={post.id}>
                {index === 0 || previousPostDayKey !== postDayKey ? (
                  <ConversationDayDivider label={formatConversationDayLabel(post.createdAt)} />
                ) : null}
                {post.system ? (
                  <div className="channel-system-post" data-channel-post-id={post.id}>
                    <span className="channel-system-post-label">{post.text}</span>
                    <time>{renderedPostTime}</time>
                  </div>
                ) : (
                  <ThreadedBubble
                    variant="channel"
                    threadCount={post.threadComments?.length ?? 0}
                    onOpenThread={onOpenThread ? () => onOpenThread(post.id) : undefined}
                    bubble={
                      <AttachedReplyBubble
                        className="channel"
                        onReplyClick={
                          replyReference && Number.isInteger(replyReference.id) && replyReference.id > 0
                            ? () => jumpToPost(replyReference.id)
                            : undefined
                        }
                        replyTo={replyReference}
                        bubble={
                          isImageOnlyBubble ? (
                            <MediaOnlyBubbleRow
                              actionLabel="Открыть действия публикации"
                              bubbleAttributes={{ 'data-channel-post-id': post.id }}
                              bubbleClassName={
                                activePostId === post.id
                                  ? `bubble bubble-button channel-post selected${replyReference ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}${isVideoNoteOnlyBubble ? ' video-note-only-bubble' : ''}`
                                  : `bubble bubble-button channel-post${replyReference ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}${isVideoNoteOnlyBubble ? ' video-note-only-bubble' : ''}`
                              }
                              lane="channel"
                              onOpenActions={(anchorElement) => onPostSelect(anchorElement, post.id)}
                            >
                              <BubbleMessageContent
                                imageOverlay={
                                  hasImageAttachment ? <BubbleImageOverlayMeta time={renderedPostTime} /> : undefined
                                }
                                inlineMeta={
                                  shouldUseInlineTextMeta ? (
                                    <BubbleTextInlineMeta
                                      edited={Boolean(post.editedAt)}
                                      time={renderedPostTime}
                                    />
                                  ) : undefined
                                }
                                message={post}
                                onOpenAttachment={onOpenAttachment}
                                onOpenExternalLink={onOpenExternalLink}
                                onOpenPremiumUpsell={publisherOnOpenPremiumUpsell}
                                onOpenSourceContact={
                                  post.sourceContact
                                    ? () =>
                                        onOpenSourceContact?.(
                                          post.sourceContact as NonNullable<Message['sourceContact']>,
                                        )
                                    : undefined
                                }
                                showReplyInline={false}
                              />
                            </MediaOnlyBubbleRow>
                          ) : (
                            <button
                              type="button"
                              data-channel-post-id={post.id}
                              className={
                                activePostId === post.id
                                  ? `bubble bubble-button channel-post selected${replyReference ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}${isVideoNoteOnlyBubble ? ' video-note-only-bubble' : ''}`
                                  : `bubble bubble-button channel-post${replyReference ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}${isVideoNoteOnlyBubble ? ' video-note-only-bubble' : ''}`
                              }
                              onClick={(event) => onPostSelect(event.currentTarget, post.id)}
                            >
                              <BubbleMessageContent
                                imageOverlay={
                                  hasImageAttachment ? <BubbleImageOverlayMeta time={renderedPostTime} /> : undefined
                                }
                                inlineMeta={
                                  shouldUseInlineTextMeta ? (
                                    <BubbleTextInlineMeta
                                      edited={Boolean(post.editedAt)}
                                      time={renderedPostTime}
                                    />
                                  ) : undefined
                                }
                                message={post}
                                onOpenAttachment={onOpenAttachment}
                                onOpenExternalLink={onOpenExternalLink}
                                onOpenPremiumUpsell={publisherOnOpenPremiumUpsell}
                                onOpenSourceContact={
                                  post.sourceContact
                                    ? () =>
                                        onOpenSourceContact?.(
                                          post.sourceContact as NonNullable<Message['sourceContact']>,
                                        )
                                    : undefined
                                }
                                showReplyInline={false}
                              />
                              {!hasImageAttachment && !shouldUseInlineTextMeta ? <time>{renderedPostTime}</time> : null}
                            </button>
                          )
                        }
                      />
                    }
                  />
                )}
              </Fragment>
            )
          })}
        </div>
        {publisher ? (
          <RoomComposer
            attachmentDraft={publisherAttachmentDraft}
            attachmentInputRef={publisherAttachmentInputRef ?? { current: null }}
            attachmentName={publisherAttachmentName}
            draft={publisherDraft}
            draftDisabled={publisherDraftDisabled}
            draftInputRef={publisherInputRef}
            gifLibrary={publisherGifLibrary}
            gifSelectionBlockedReason={publisherGifSelectionBlockedReason}
            onAttachmentChange={(event) => publisherOnAttachmentChange?.(event)}
            onAttachmentClear={publisherOnAttachmentClear ?? (() => undefined)}
            onAttachmentPreviewOpen={publisherOnAttachmentPreviewOpen}
            onRenameAttachmentFileBaseName={publisherOnRenameAttachmentFileBaseName}
            onComposerPaste={(event) => publisherOnComposerPaste?.(event)}
            onDeleteGif={publisherOnDeleteGif}
            onDraftChange={(value) => publisherOnDraftChange?.(value)}
            onEditCancel={publisherOnEditCancel}
            onKeyDown={handleComposerKeyDown}
            onOpenAttachmentPicker={(mode) => publisherOnOpenAttachmentPicker?.(mode)}
            onOpenPremiumUpsell={publisherOnOpenPremiumUpsell}
            onOpenVideoNoteRecorder={publisherOnOpenVideoNoteRecorder}
            onReplyCancel={publisherOnReplyCancel}
            onSearchGifs={publisherOnSearchGifs}
            onSelectGif={publisherOnSelectGif}
            onSubmit={() => publisherOnSubmit?.()}
            onToggleSendOriginal={publisherOnToggleSendOriginal}
            onUploadGif={publisherOnUploadGif}
            placeholder={publisherPlaceholder}
            premiumUnlocked={publisherPremiumUnlocked}
            editTarget={publisherEditTarget}
            replyTarget={publisherReplyTarget}
            storageCleanupWarning={publisherStorageCleanupWarning}
            submitAriaLabel="Отправить"
            submitDisabled={!publisherCanSubmit}
            submitTitle="Отправить"
            videoNoteDisabled={publisherVideoNoteDisabled}
            videoNoteTitle={publisherVideoNoteTitle}
            bottomContent={publisherError ? <p className="auth-error">{publisherError}</p> : null}
          />
        ) : subscriptionAction ? (
          <div className="channel-room-footer">
            <button
              type="button"
              className="send-button channel-subscribe-button"
              disabled={subscriptionAction.busy}
              onClick={subscriptionAction.onClick}
            >
              {subscriptionAction.label}
            </button>
            {subscriptionAction.error ? <p className="auth-error">{subscriptionAction.error}</p> : null}
          </div>
        ) : null}
      </section>
      {actions}
    </>
  )
}
