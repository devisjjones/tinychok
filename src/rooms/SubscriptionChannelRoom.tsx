import type { ChangeEvent, ClipboardEvent, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ComposerAttachmentDraft } from '../app/composerAttachments'
import {
  formatChannelAvatarLabel,
  formatConversationDayLabel,
  getConversationDayKey,
  insertComposerTextAtCursor,
  isImageMimeType,
  isVideoMimeType,
  resizeComposerTextarea,
  scrollFeedChildIntoView,
  shouldAutoFocusTextInputOnSceneOpen,
  shouldSubmitComposerWithEnter,
} from '../app/utils'
import type { Message, ReplyTarget, SubscriptionChannel, UserGifLibraryItem } from '../app/types'
import {
  BubbleImageOverlayMeta,
  BubbleMessageContent,
  BubbleTextInlineMeta,
} from '../components/BubbleMessageContent'
import { AttachedReplyBubble } from '../components/AttachedReplyBubble'
import { ComposerAttachmentPicker } from '../components/ComposerAttachmentPicker'
import { ComposerAttachmentPreview } from '../components/ComposerAttachmentPreview'
import { ConversationDayDivider } from '../components/ConversationDayDivider'
import { EmojiPicker } from '../components/EmojiPicker'
import { MediaOnlyBubbleRow } from '../components/MediaOnlyBubbleRow'
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
    onOpenPremiumUpsell?: () => void
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
  const [publisherComposerExpanded, setPublisherComposerExpanded] = useState(false)
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
  const publisherOnOpenPremiumUpsell = publisher?.onOpenPremiumUpsell
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
  const publisherReplyTarget = publisher?.replyTarget ?? null
  const publisherStorageCleanupWarning = publisher?.storageCleanupWarning ?? null
  const publisherOnSubmit = publisher?.onSubmit
  const publisherCanSubmit = publisherAttachmentDraft
    ? publisherAttachmentDraft.status === 'ready' && !publisherBusy
    : publisherDraft.trim().length > 0 && !publisherBusy
  const publisherPlaceholder = publisherAttachmentDraft
    ? isImageMimeType(publisherAttachmentDraft.mimeType)
      ? 'Добавьте подпись к фотографии...'
      : isVideoMimeType(publisherAttachmentDraft.mimeType)
        ? 'Добавьте подпись к видео...'
        : 'Добавьте подпись к файлу...'
    : 'Напишите сообщение в канал...'

  useLayoutEffect(() => {
    const textarea = publisherInputRef.current
    if (!textarea) return

    const syncTextareaSize = () => {
      const { expanded } = resizeComposerTextarea(textarea)
      setPublisherComposerExpanded(expanded)
    }

    syncTextareaSize()
    if (typeof window === 'undefined') return

    window.addEventListener('resize', syncTextareaSize)
    return () => {
      window.removeEventListener('resize', syncTextareaSize)
    }
  }, [publisherAttachmentDraft, publisherDraft])

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
    if (!publisherReplyTarget) return

    window.requestAnimationFrame(() => {
      publisherInputRef.current?.focus()
    })
  }, [publisherReplyTarget])

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
          const shouldUseInlineTextMeta = !hasImageAttachment && post.text.trim().length > 0

          return (
              <Fragment key={post.id}>
                {index === 0 || previousPostDayKey !== postDayKey ? (
                  <ConversationDayDivider label={formatConversationDayLabel(post.createdAt)} />
                ) : null}
                {post.system ? (
                  <div className="channel-system-post" data-channel-post-id={post.id}>
                    <span className="channel-system-post-label">{post.text}</span>
                    <time>{post.time}</time>
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
                                  ? `bubble bubble-button channel-post selected${replyReference ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}`
                                  : `bubble bubble-button channel-post${replyReference ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}`
                              }
                              lane="channel"
                              onOpenActions={(anchorElement) => onPostSelect(anchorElement, post.id)}
                            >
                              <BubbleMessageContent
                                imageOverlay={
                                  hasImageAttachment ? <BubbleImageOverlayMeta time={post.time} /> : undefined
                                }
                                inlineMeta={
                                  shouldUseInlineTextMeta ? (
                                    <BubbleTextInlineMeta time={post.time} />
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
                                  ? `bubble bubble-button channel-post selected${replyReference ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}`
                                  : `bubble bubble-button channel-post${replyReference ? ' has-attached-reply' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}`
                              }
                              onClick={(event) => onPostSelect(event.currentTarget, post.id)}
                            >
                              <BubbleMessageContent
                                imageOverlay={
                                  hasImageAttachment ? <BubbleImageOverlayMeta time={post.time} /> : undefined
                                }
                                inlineMeta={
                                  shouldUseInlineTextMeta ? (
                                    <BubbleTextInlineMeta time={post.time} />
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
                              {!hasImageAttachment && !shouldUseInlineTextMeta ? <time>{post.time}</time> : null}
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
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault()
              publisherOnSubmit?.()
            }}
          >
            <div className="composer-input">
              {publisherReplyTarget ? (
                <div className="composer-reply">
                  <div>
                    <span className="settings-label">Ответ</span>
                    <p>{publisherReplyTarget.text}</p>
                  </div>
                  <button
                    type="button"
                    className="soft-button composer-reply-cancel"
                    onClick={publisherOnReplyCancel}
                    aria-label="Отменить ответ"
                    title="Отменить ответ"
                  >
                    <img src="/icons/cancel.png" alt="" aria-hidden="true" className="composer-reply-cancel-icon" />
                  </button>
                </div>
              ) : null}
              <div className="composer-entry">
                <div
                  className={`composer-field${publisherAttachmentDraft ? ' composer-field-has-attachment' : ''}${publisherComposerExpanded ? ' composer-field-expanded' : ''}`}
                >
                  {publisherAttachmentDraft && publisherOnAttachmentClear ? (
                    <ComposerAttachmentPreview
                      attachmentDraft={publisherAttachmentDraft}
                      onClear={publisherOnAttachmentClear}
                      onOpenPreview={publisherOnAttachmentPreviewOpen}
                      onRenameFileBaseName={publisherOnRenameAttachmentFileBaseName}
                      onOpenPremiumUpsell={publisherOnOpenPremiumUpsell}
                      onToggleSendOriginal={publisherOnToggleSendOriginal}
                      premiumUnlocked={publisherPremiumUnlocked}
                      storageCleanupWarning={publisherStorageCleanupWarning}
                    />
                  ) : null}
                  {publisherAttachmentInputRef && publisherOnAttachmentChange ? (
                    <input
                      ref={publisherAttachmentInputRef}
                      type="file"
                      className="composer-attachment-input"
                      onChange={publisherOnAttachmentChange}
                    />
                  ) : null}
                  <textarea
                    ref={publisherInputRef}
                    placeholder={publisherPlaceholder}
                    rows={1}
                    value={publisherDraft}
                    onChange={(event) => publisherOnDraftChange?.(event.target.value)}
                    onPaste={(event) => publisherOnComposerPaste?.(event)}
                    onKeyDown={handleComposerKeyDown}
                  />
                  <div className="composer-tools">
                    <EmojiPicker
                      canSelectGif={!publisherGifSelectionBlockedReason}
                      gifLibrary={publisherGifLibrary}
                      gifSelectionBlockedReason={publisherGifSelectionBlockedReason}
                      onDeleteGif={publisherOnDeleteGif}
                      onOpenPremiumUpsell={publisherOnOpenPremiumUpsell}
                      onSearchGifs={publisherOnSearchGifs}
                      onSelect={(emoji) =>
                        insertComposerTextAtCursor(
                          publisherInputRef.current,
                          publisherDraft,
                          emoji,
                          (value) => publisherOnDraftChange?.(value),
                        )
                      }
                      onSelectGif={publisherOnSelectGif}
                      onUploadGif={publisherOnUploadGif}
                      premiumUnlocked={publisherPremiumUnlocked}
                    />
                    {publisherOnOpenAttachmentPicker ? (
                      <ComposerAttachmentPicker
                        attachmentName={publisherAttachmentName}
                        onSelectMode={publisherOnOpenAttachmentPicker}
                        premiumUnlocked={publisherPremiumUnlocked}
                      />
                    ) : null}
                    {publisherDraft.trim() || publisherAttachmentDraft ? (
                      <button type="submit" className="send-button composer-send" disabled={!publisherCanSubmit}>
                        <span className="composer-send-icon" aria-hidden="true">
                          <img src="/icons/sent.png" alt="" />
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            {publisherError ? <p className="auth-error">{publisherError}</p> : null}
          </form>
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
