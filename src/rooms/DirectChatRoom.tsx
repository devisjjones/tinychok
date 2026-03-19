import type {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  RefObject,
} from 'react'
import type { Chat, Message, ReplyTarget } from '../app/types'
import { formatMessageAuthor, formatRoomPresence } from '../app/utils'

type DirectChatRoomProps = {
  activeChat: Chat
  activeMessageId: number | null
  attachmentInputRef: RefObject<HTMLInputElement | null>
  attachmentName: string
  chatActionsOpen: boolean
  draft: string
  messageFeedRef: RefObject<HTMLDivElement | null>
  pinnedMessage: Message | null
  quietMode: boolean
  replyTarget: ReplyTarget | null
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void
  onBack: () => void
  onBlockChat: () => void
  onCloseChatActions: () => void
  onDraftChange: (value: string) => void
  onMessageSelect: (event: MouseEvent<HTMLButtonElement>, message: Message) => void
  onOpenAttachmentPicker: () => void
  onOpenPremiumGift: () => void
  onReplyCancel: () => void
  onRequestDeleteContact: () => void
  onRequestDeleteHistory: () => void
  onSubmit: () => void
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
  messageFeedRef,
  pinnedMessage,
  quietMode,
  replyTarget,
  onAttachmentChange,
  onBack,
  onBlockChat,
  onCloseChatActions,
  onDraftChange,
  onMessageSelect,
  onOpenAttachmentPicker,
  onOpenPremiumGift,
  onReplyCancel,
  onRequestDeleteContact,
  onRequestDeleteHistory,
  onSubmit,
  onToggleChatActions,
  onToggleFavoriteChat,
  onUnpinMessage,
}: DirectChatRoomProps) {
  return (
    <section className={pinnedMessage ? 'chat-room has-pinned-message' : 'chat-room'}>
      <header className="room-header">
        <button type="button" className="soft-button room-mobile-back" onClick={onBack}>
          Назад
        </button>
        <div className="room-id">
          <span className="avatar large" style={{ backgroundColor: activeChat.accent }}>
            {activeChat.title.slice(0, 1)}
          </span>
          <div>
            <div className="room-title">
              <div className="room-title-name">
                <h3>{activeChat.title}</h3>
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
            <p>{pinnedMessage.text}</p>
          </div>
          <button type="button" className="soft-button pinned-message-close" onClick={onUnpinMessage}>
            Снять
          </button>
        </div>
      ) : null}

      <div className="message-feed" ref={messageFeedRef}>
        {activeChat.messages.map((message) => (
          <button
            key={message.id}
            type="button"
            className={
              message.author === 'me'
                ? activeMessageId === message.id
                  ? 'bubble bubble-button mine selected'
                  : 'bubble bubble-button mine'
                : activeMessageId === message.id
                  ? 'bubble bubble-button selected'
                  : 'bubble bubble-button'
            }
            onClick={(event) => onMessageSelect(event, message)}
          >
            {message.forwarded ? <span className="bubble-meta">Переслано</span> : null}
            {message.replyTo ? (
              <div className="bubble-reply">
                <span>{formatMessageAuthor(message.replyTo.author, activeChat.title)}</span>
                <p>{message.replyTo.text}</p>
              </div>
            ) : null}
            <p>{message.text}</p>
            <time>{message.time}</time>
          </button>
        ))}

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
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          onSubmit()
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
          <input
            ref={attachmentInputRef}
            type="file"
            className="composer-attachment-input"
            onChange={onAttachmentChange}
          />
          <textarea
            rows={3}
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
          <button type="submit" className="send-button composer-send">
            Отправить
          </button>
        </div>
      </form>
    </section>
  )
}
