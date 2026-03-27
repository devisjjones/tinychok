import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  RefObject,
} from 'react'
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import type { ComposerAttachmentDraft } from '../app/composerAttachments'
import type { ChannelMessageSource, Chat, Message, ReplyTarget, UserGifLibraryItem } from '../app/types'
import {
  formatConversationDayLabel,
  formatMessagePreview,
  formatRoomPresence,
  getConversationDayKey,
  insertComposerTextAtCursor,
  isImageMimeType,
  scrollFeedChildIntoView,
  shouldSubmitComposerWithEnter,
  shouldShowDeliveryCaption,
} from '../app/utils'
import {
  BubbleMessageContent,
  BubbleImageOverlayMeta,
  ForwardedChannelHeader,
} from '../components/BubbleMessageContent'
import { AttachedReplyBubble } from '../components/AttachedReplyBubble'
import { ComposerAttachmentPreview } from '../components/ComposerAttachmentPreview'
import { ComposerAttachmentPicker } from '../components/ComposerAttachmentPicker'
import { ConversationDayDivider } from '../components/ConversationDayDivider'
import { EmojiPicker } from '../components/EmojiPicker'

type DirectChatRoomProps = {
  activeChat: Chat
  activeMessageId: number | null
  attachmentDraft?: ComposerAttachmentDraft
  attachmentInputRef: RefObject<HTMLInputElement | null>
  attachmentName: string
  chatActionsOpen: boolean
  draft: string
  getMessageDeliveryIssue: (messageId: number) => 'pending' | 'failed' | null
  messageFeedRef: RefObject<HTMLDivElement | null>
  onAttachmentClear: () => void
  onAttachmentPreviewOpen?: () => void
  pinnedMessage: Message | null
  quietMode: boolean
  replyTarget: ReplyTarget | null
  visibleMessages: Message[]
  composerDisabledNotice?: string | null
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  onBack: () => void
  onBlockChat: () => void
  onCloseChatActions: () => void
  onCreateGroup: () => void
  onDraftChange: (value: string) => void
  onMessageSelect: (event: MouseEvent<HTMLButtonElement>, message: Message) => void
  onOpenAttachment: (attachment: NonNullable<Message['attachment']>) => void
  onOpenLinkedChannel: (sourceChannel: ChannelMessageSource) => void
  onOpenSourceChannel: (message: Message) => void
  onOpenAttachmentPicker: (mode: 'file' | 'photo') => void
  onOpenPremiumGift: () => void
  onOpenPremiumUpsell?: () => void
  onReplyCancel: () => void
  onDeleteGif?: (gif: UserGifLibraryItem) => Promise<void>
  onSearchGifs?: (query: string) => Promise<UserGifLibraryItem[]>
  onRequestDeleteContact: () => void
  onRequestDeleteHistory: () => void
  onRequestReportContact: () => void
  onSelectGif?: (gif: UserGifLibraryItem) => void
  onUploadGif?: (file: File) => Promise<void>
  onReplyReferenceJump?: (messageId: number) => void
  onToggleSendOriginal?: () => void
  onToggleChatMuted: () => void
  premiumUnlocked?: boolean
  gifLibrary?: UserGifLibraryItem[]
  gifSelectionBlockedReason?: string | null
  resolveLinkedChannelFromMessage: (message: Message) => ChannelMessageSource | null
  onSubmit: () => void | Promise<void>
  onToggleChatActions: () => void
  onToggleFavoriteChat: () => void
  onUnpinMessage: () => void
}

export function DirectChatRoom({
  activeChat,
  activeMessageId,
  attachmentDraft,
  attachmentInputRef,
  attachmentName,
  chatActionsOpen,
  draft,
  getMessageDeliveryIssue,
  messageFeedRef,
  onAttachmentClear,
  onAttachmentPreviewOpen,
  pinnedMessage,
  quietMode,
  replyTarget,
  visibleMessages,
  composerDisabledNotice = null,
  onAttachmentChange,
  onBack,
  onBlockChat,
  onCloseChatActions,
  onCreateGroup,
  onDraftChange,
  onMessageSelect,
  onOpenAttachment,
  onOpenLinkedChannel,
  onOpenSourceChannel,
  onOpenAttachmentPicker,
  onOpenPremiumGift,
  onOpenPremiumUpsell,
  onReplyCancel,
  onDeleteGif,
  onSearchGifs,
  onSelectGif,
  onUploadGif,
  onReplyReferenceJump,
  onRequestDeleteContact,
  onRequestDeleteHistory,
  onRequestReportContact,
  onToggleSendOriginal,
  onToggleChatMuted,
  gifLibrary = [],
  gifSelectionBlockedReason = null,
  premiumUnlocked = false,
  resolveLinkedChannelFromMessage,
  onSubmit,
  onToggleChatActions,
  onToggleFavoriteChat,
  onUnpinMessage,
}: DirectChatRoomProps) {
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null)
  const effectiveVisibleMessages = activeChat.archivedAccount ? [] : visibleMessages
  const effectiveComposerDisabledNotice =
    composerDisabledNotice ?? (activeChat.archivedAccount ? 'Аккаунт удалён. Переписка недоступна.' : null)
  const hasComposerPayload = draft.trim().length > 0 || Boolean(attachmentDraft)
  const canSubmitComposer = attachmentDraft ? attachmentDraft.status === 'ready' : draft.trim().length > 0
  const composerPlaceholder = attachmentDraft
    ? isImageMimeType(attachmentDraft.mimeType)
      ? 'Добавьте подпись к фотографии...'
      : 'Добавьте подпись к файлу...'
    : 'Напиши сообщение в тайник...'

  async function submitComposer() {
    await Promise.resolve(onSubmit())
    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus()
    })
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!canSubmitComposer) return
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
    void submitComposer()
  }

  useLayoutEffect(() => {
    const textarea = draftInputRef.current
    if (!textarea) return

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const maxHeight = Math.max(120, Math.floor(viewportHeight * 0.5))

    textarea.style.height = '0px'
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight)
    textarea.style.height = `${Math.max(56, nextHeight)}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [draft])

  useEffect(() => {
    if (!replyTarget) return

    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus()
    })
  }, [replyTarget])

  function jumpToMessage(messageId: number) {
    if (onReplyReferenceJump) {
      onReplyReferenceJump(messageId)
      return
    }

    void window.requestAnimationFrame(() => {
      scrollFeedChildIntoView(messageFeedRef.current, `[data-direct-message-id="${messageId}"]`)
    })
  }

  return (
    <section className={pinnedMessage ? 'chat-room has-pinned-message' : 'chat-room'}>
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
          <span className="avatar large" style={{ backgroundColor: activeChat.accent }}>
            {activeChat.archivedAccount ? (
              <img src="/icons/ghost.png" alt="" aria-hidden="true" className="avatar-ghost-icon" />
            ) : (
              activeChat.title.slice(0, 1)
            )}
          </span>
          <div>
            <div className="room-title">
              <div className="room-title-name">
                <h3>{activeChat.title}</h3>
                {activeChat.archivedAccount ? <span className="room-archive-badge">Архив</span> : null}
                {activeChat.blockedByAdmin ? (
                  <span className="blocked-contact-badge" aria-label="Пользователь заблокирован администрацией">
                    <img src="/icons/blocked.png" alt="" aria-hidden="true" />
                  </span>
                ) : null}
                {activeChat.muted ? (
                  <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                    <img src="/icons/bell-100.png" alt="" />
                  </span>
                ) : null}
                {activeChat.premium ? (
                  <span className="premium-crown room-crown" aria-label="Премиум">
                    <img src="/icons/crown64.png" alt="" />
                  </span>
                ) : null}
                {activeChat.online ? <span className="room-online-label">В сети</span> : null}
              </div>
            </div>
            <p>{formatRoomPresence(activeChat)}</p>
          </div>
        </div>
        <div className="room-actions">
          <button
            type="button"
            className={activeChat.pinned ? 'soft-button active room-star' : 'soft-button room-star'}
            onClick={onToggleFavoriteChat}
            aria-label="Избранное"
          >
            <img src="/icons/star100.png" alt="" />
          </button>
          <button
            type="button"
            className="soft-button room-menu-button"
            onClick={onToggleChatActions}
            aria-label="Меню контакта"
          >
            <img src="/icons/menu.png" alt="" aria-hidden="true" className="room-menu-icon" />
          </button>
          {chatActionsOpen ? (
            <>
              <button
                type="button"
                className="room-menu-scrim"
                aria-label="Закрыть меню"
                onClick={onCloseChatActions}
              />
              <div className="room-menu">
                <button
                  type="button"
                  className="room-menu-item"
                  onClick={onToggleChatMuted}
                >
                  {activeChat.muted ? 'Включить уведомления' : 'Заглушить'}
                </button>
                <button type="button" className="room-menu-item" onClick={onCreateGroup}>
                  Создать группу
                </button>
                <button
                  type="button"
                  className="room-menu-item room-menu-item-premium"
                  onClick={onOpenPremiumGift}
                >
                  <span>Подарить</span>
                  <img src="/icons/crown100.png" alt="" />
                </button>
                <button type="button" className="room-menu-item danger" onClick={onBlockChat}>
                  Заблокировать
                </button>
                <button
                  type="button"
                  className="room-menu-item danger"
                  onClick={onRequestReportContact}
                >
                  Пожаловаться
                </button>
                <button
                  type="button"
                  className="room-menu-item danger"
                  onClick={onRequestDeleteContact}
                >
                  Удалить контакт
                </button>
                <button
                  type="button"
                  className="room-menu-item danger"
                  onClick={onRequestDeleteHistory}
                >
                  Удалить переписку
                </button>
              </div>
            </>
          ) : null}
        </div>
      </header>

      {pinnedMessage ? (
        <div className="pinned-message">
          <div className="pinned-message-content">
            <img className="pinned-message-icon" src="/icons/pin100.png" alt="" aria-hidden="true" />
            <p>{formatMessagePreview(pinnedMessage)}</p>
          </div>
          <button type="button" className="soft-button pinned-message-close" onClick={onUnpinMessage}>
            Снять
          </button>
        </div>
      ) : null}

      <div className="message-feed" ref={messageFeedRef}>
        {effectiveVisibleMessages.map((message, index) => {
          const previousMessage = index > 0 ? effectiveVisibleMessages[index - 1] : null
          const messageDayKey = getConversationDayKey(message.createdAt)
          const previousMessageDayKey = previousMessage ? getConversationDayKey(previousMessage.createdAt) : null
          const linkedChannel = message.sourceChannel ? null : resolveLinkedChannelFromMessage(message)
          const messageDeliveryIssue =
            message.author === 'me' ? getMessageDeliveryIssue(message.id) : null
          const hasImageAttachment = Boolean(
            message.attachment && isImageMimeType(message.attachment.mimeType),
          )
          const messagePending = messageDeliveryIssue === 'pending'
          const messageFailed = messageDeliveryIssue === 'failed'
          const showDeliveryCaption = messageDeliveryIssue !== null && shouldShowDeliveryCaption(message)
          const showDeliveryIndicator = message.author === 'me'
          const messageReadByRecipient = message.author === 'me' && Boolean(message.readAt)
          const deliveryIndicatorSrc = messageFailed
            ? '/icons/warning-48.png'
            : messagePending
              ? '/icons/hourglass-48.png'
              : messageReadByRecipient
                ? '/icons/double-tick-50.png'
                : '/icons/check-mark-50.png'
          const isImageOnlyBubble =
            hasImageAttachment &&
            !linkedChannel &&
            !message.sourceChannel &&
            !message.sourceGroup &&
            message.text.trim().length === 0
          const bubbleClassNames = ['bubble', 'bubble-button']

          if (message.author === 'me') {
            bubbleClassNames.push('mine')
          }

          if (activeMessageId === message.id) {
            bubbleClassNames.push('selected')
          }

          if (showDeliveryIndicator) {
            bubbleClassNames.push('has-delivery-indicator')
          }

          if (messageDeliveryIssue) {
            bubbleClassNames.push('has-delivery-issue')
          }

          if (showDeliveryCaption) {
            bubbleClassNames.push('has-delivery-caption')
          }

          if (messageFailed) {
            bubbleClassNames.push('delivery-failed')
          }

          if (messageReadByRecipient) {
            bubbleClassNames.push('read-by-recipient')
          }

          if (message.replyTo) {
            bubbleClassNames.push('has-attached-reply')
          }

          if (isImageOnlyBubble) {
            bubbleClassNames.push('media-only-bubble')
          }

          const replyReference = message.replyTo

          return (
            <Fragment key={message.id}>
              {index === 0 || previousMessageDayKey !== messageDayKey ? (
                <ConversationDayDivider label={formatConversationDayLabel(message.createdAt)} />
              ) : null}
              <AttachedReplyBubble
                mine={message.author === 'me'}
                onReplyClick={
                  replyReference && Number.isInteger(replyReference.id) && replyReference.id > 0
                    ? () => jumpToMessage(replyReference.id)
                    : undefined
                }
                replyChatTitle={activeChat.title}
                replyTo={replyReference}
                bubble={
                  <button
                    type="button"
                    data-direct-message-id={message.id}
                    className={bubbleClassNames.join(' ')}
                    onClick={(event) => onMessageSelect(event, message)}
                  >
                    {message.sourceChannel ? (
                      <>
                        <ForwardedChannelHeader
                          sourceChannel={message.sourceChannel}
                          onClick={() => onOpenSourceChannel(message)}
                        />
                        {!message.sourceChannel.leadText ? (
                          <span className="bubble-meta">Переслано</span>
                        ) : null}
                      </>
                    ) : null}
                    {message.forwarded && !message.sourceChannel ? (
                      <span className="bubble-meta">
                        {message.forwardedAuthorName
                          ? `Переслано ${message.forwardedAuthorName}`
                          : 'Переслано'}
                      </span>
                    ) : null}
                    <BubbleMessageContent
                      imageOverlay={
                        hasImageAttachment ? (
                          <BubbleImageOverlayMeta
                            deliveryIndicatorSrc={
                              showDeliveryIndicator ? deliveryIndicatorSrc : null
                            }
                            time={message.time}
                          />
                        ) : undefined
                      }
                      linkedChannel={linkedChannel}
                      message={message}
                      onOpenAttachment={onOpenAttachment}
                      onOpenLinkedChannel={
                        linkedChannel ? () => onOpenLinkedChannel(linkedChannel) : undefined
                      }
                      replyChatTitle={activeChat.title}
                      showReplyInline={false}
                    />
                    {!hasImageAttachment ? <time>{message.time}</time> : null}
                    {!hasImageAttachment && showDeliveryCaption ? (
                      <span className="bubble-delivery-caption">Сообщение не отправлено</span>
                    ) : null}
                    {!hasImageAttachment && showDeliveryIndicator ? (
                      <img
                        className="bubble-delivery-indicator"
                        src={deliveryIndicatorSrc}
                        alt=""
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                }
              />
            </Fragment>
          )
        })}

        {activeChat.typing && !quietMode ? (
          <div className="typing">
            <span />
            <span />
            <span />
            <p>{activeChat.title} печатает…</p>
          </div>
        ) : null}
      </div>

      {effectiveComposerDisabledNotice ? (
        <div className="composer composer-disabled">
          <p className="composer-disabled-note">{effectiveComposerDisabledNotice}</p>
        </div>
      ) : (
        <form
          className="composer"
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            await submitComposer()
          }}
        >
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
                    onOpenPremiumUpsell={onOpenPremiumUpsell}
                    onToggleSendOriginal={onToggleSendOriginal}
                    premiumUnlocked={premiumUnlocked}
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
                  rows={1}
                  placeholder={composerPlaceholder}
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
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
                  />
                  {hasComposerPayload ? (
                    <button
                      type="submit"
                      className="send-button composer-send"
                      disabled={!canSubmitComposer}
                      aria-label="Отправить"
                      title="Отправить"
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
        </form>
      )}
    </section>
  )
}
