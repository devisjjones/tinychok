import type {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  RefObject,
} from 'react'
import { useLayoutEffect, useRef } from 'react'
import type { ChannelMessageSource, Chat, Message, ReplyTarget } from '../app/types'
import {
  formatMessagePreview,
  formatRoomPresence,
  shouldShowDeliveryCaption,
} from '../app/utils'
import { BubbleMessageContent, ForwardedChannelHeader } from '../components/BubbleMessageContent'

type DirectChatRoomProps = {
  activeChat: Chat
  activeMessageId: number | null
  attachmentInputRef: RefObject<HTMLInputElement | null>
  attachmentName: string
  chatActionsOpen: boolean
  draft: string
  getMessageDeliveryIssue: (messageId: number) => 'pending' | 'failed' | null
  messageFeedRef: RefObject<HTMLDivElement | null>
  pinnedMessage: Message | null
  quietMode: boolean
  replyTarget: ReplyTarget | null
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  onBack: () => void
  onBlockChat: () => void
  onCloseChatActions: () => void
  onCreateGroup: () => void
  onDraftChange: (value: string) => void
  onMessageSelect: (event: MouseEvent<HTMLButtonElement>, message: Message) => void
  onOpenLinkedChannel: (sourceChannel: ChannelMessageSource) => void
  onOpenSourceChannel: (message: Message) => void
  onOpenAttachmentPicker: () => void
  onOpenPremiumGift: () => void
  onReplyCancel: () => void
  onRequestDeleteContact: () => void
  onRequestDeleteHistory: () => void
  onRequestReportContact: () => void
  onToggleChatMuted: () => void
  resolveLinkedChannelFromMessage: (message: Message) => ChannelMessageSource | null
  onSubmit: () => void | Promise<void>
  onToggleChatActions: () => void
  onToggleFavoriteChat: () => void
  onUnpinMessage: () => void
}

export function DirectChatRoom({
  activeChat,
  activeMessageId,
  attachmentInputRef,
  attachmentName,
  chatActionsOpen,
  draft,
  getMessageDeliveryIssue,
  messageFeedRef,
  pinnedMessage,
  quietMode,
  replyTarget,
  onAttachmentChange,
  onBack,
  onBlockChat,
  onCloseChatActions,
  onCreateGroup,
  onDraftChange,
  onMessageSelect,
  onOpenLinkedChannel,
  onOpenSourceChannel,
  onOpenAttachmentPicker,
  onOpenPremiumGift,
  onReplyCancel,
  onRequestDeleteContact,
  onRequestDeleteHistory,
  onRequestReportContact,
  onToggleChatMuted,
  resolveLinkedChannelFromMessage,
  onSubmit,
  onToggleChatActions,
  onToggleFavoriteChat,
  onUnpinMessage,
}: DirectChatRoomProps) {
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null)
  const hasComposerPayload = draft.trim().length > 0 || Boolean(attachmentName)

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
          <span className="room-mobile-back-icon" aria-hidden="true">
            &larr;
          </span>
        </button>
        <div className="room-id">
          <span className="avatar large" style={{ backgroundColor: activeChat.accent }}>
            {activeChat.title.slice(0, 1)}
          </span>
          <div>
            <div className="room-title">
              <div className="room-title-name">
                <h3>{activeChat.title}</h3>
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
            ...
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
        {activeChat.messages.map((message) => {
          const linkedChannel = message.sourceChannel ? null : resolveLinkedChannelFromMessage(message)
          const messageDeliveryIssue =
            message.author === 'me' ? getMessageDeliveryIssue(message.id) : null
          const messagePending = messageDeliveryIssue === 'pending'
          const messageFailed = messageDeliveryIssue === 'failed'
          const showDeliveryCaption = messageDeliveryIssue !== null && shouldShowDeliveryCaption(message)
          const showDeliveryIndicator = message.author === 'me'
          const messageReadByRecipient = message.author === 'me' && Boolean(message.readAt)
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

          return (
            <button
              key={message.id}
              type="button"
              className={bubbleClassNames.join(' ')}
              onClick={(event) => onMessageSelect(event, message)}
            >
              {message.sourceChannel ? (
                <>
                  <ForwardedChannelHeader
                    sourceChannel={message.sourceChannel}
                    onClick={() => onOpenSourceChannel(message)}
                  />
                  <span className="bubble-meta">Переслано</span>
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
                linkedChannel={linkedChannel}
                message={message}
                onOpenLinkedChannel={
                  linkedChannel ? () => onOpenLinkedChannel(linkedChannel) : undefined
                }
                replyChatTitle={activeChat.title}
              />
              <time>{message.time}</time>
              {showDeliveryCaption ? (
                <span className="bubble-delivery-caption">Сообщение не отправлено</span>
              ) : null}
              {showDeliveryIndicator ? (
                <img
                  className="bubble-delivery-indicator"
                  src={
                    messageFailed
                      ? '/icons/warning-48.png'
                      : messagePending
                        ? '/icons/hourglass-48.png'
                        : '/icons/double-tick-50.png'
                  }
                  alt=""
                  aria-hidden="true"
                />
              ) : null}
            </button>
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

      <form
        className="composer"
        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          await Promise.resolve(onSubmit())
          window.requestAnimationFrame(() => {
            draftInputRef.current?.focus()
          })
        }}
      >
        <div className="composer-input">
          {replyTarget ? (
            <div className="composer-reply">
              <div>
                <span className="settings-label">Ответ</span>
                <p>{replyTarget.text}</p>
              </div>
              <button type="button" className="soft-button composer-reply-cancel" onClick={onReplyCancel}>
                Отмена
              </button>
            </div>
          ) : null}
          <div className="composer-entry">
            <div className="composer-field">
              <input
                ref={attachmentInputRef}
                type="file"
                className="composer-attachment-input"
                onChange={onAttachmentChange}
              />
              <textarea
                ref={draftInputRef}
                rows={1}
                placeholder="Напиши сообщение в тайник..."
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
              />
              <div className="composer-tools">
                <button
                  type="button"
                  className={attachmentName ? 'soft-button composer-tool active' : 'soft-button composer-tool'}
                  onClick={onOpenAttachmentPicker}
                  aria-label="Добавить файл"
                  title={attachmentName || 'Добавить файл'}
                >
                  <img src="/icons/attach100.png" alt="" />
                </button>
              </div>
            </div>
            {hasComposerPayload ? (
              <button
                type="submit"
                className="send-button composer-send"
                aria-label="Отправить"
                title="Отправить"
              >
                <span className="composer-send-icon" aria-hidden="true">
                  &rarr;
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </section>
  )
}
