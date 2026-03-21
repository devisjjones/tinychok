import type { ChangeEvent, FormEvent, MouseEvent, ReactNode, RefObject } from 'react'
import type { GroupPreview, Message } from '../app/types'
import { shouldShowDeliveryCaption } from '../app/utils'
import { BubbleMessageContent } from '../components/BubbleMessageContent'

type GroupRoomProps = {
  actions: ReactNode
  activeMessageId: number | null
  attachmentInputRef: RefObject<HTMLInputElement | null>
  attachmentName: string
  draft: string
  getMessageDeliveryIssue: (messageId: number) => 'pending' | 'failed' | null
  group: GroupPreview
  messageFeedRef: RefObject<HTMLDivElement | null>
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  onBack: () => void
  onComposerFocus: () => void
  onDraftChange: (value: string) => void
  onMessageSelect: (event: MouseEvent<HTMLButtonElement>, message: Message) => void
  onOpenAttachmentPicker: () => void
  onSubmit: () => void
}

export function GroupRoom({
  actions,
  activeMessageId,
  attachmentInputRef,
  attachmentName,
  draft,
  getMessageDeliveryIssue,
  group,
  messageFeedRef,
  onAttachmentChange,
  onBack,
  onComposerFocus,
  onDraftChange,
  onMessageSelect,
  onOpenAttachmentPicker,
  onSubmit,
}: GroupRoomProps) {
  return (
    <>
      <section className="chat-room">
        <header className="room-header">
          <button type="button" className="soft-button room-mobile-back" onClick={onBack}>
            Назад
          </button>
          <div className="room-id">
            <span className="avatar large" style={{ backgroundColor: group.accent }}>
              {group.title.slice(0, 1)}
            </span>
            <div>
              <div className="room-title">
                <div className="room-title-name">
                  <h3>{group.title}</h3>
                  <span className="chat-star">
                    <img src="/icons/group100.png" alt="Группа" />
                  </span>
                </div>
              </div>
              <p>{`${group.handle} · ${group.members} участников`}</p>
            </div>
          </div>
        </header>

        <div className="message-feed" ref={messageFeedRef}>
          {group.messages.map((message) => {
            const messageDeliveryIssue =
              message.author === 'me' ? getMessageDeliveryIssue(message.id) : null
            const messagePending = messageDeliveryIssue === 'pending'
            const messageFailed = messageDeliveryIssue === 'failed'
            const showDeliveryCaption = messageDeliveryIssue !== null && shouldShowDeliveryCaption(message)
            const showDeliveryIndicator = message.author === 'me'
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

            return (
              <button
                key={message.id}
                type="button"
                className={bubbleClassNames.join(' ')}
                onClick={(event) => onMessageSelect(event, message)}
              >
                <span className="bubble-meta">
                  {message.author === 'me' ? 'Вы' : message.displayAuthor ?? 'Участник группы'}
                </span>
                <BubbleMessageContent message={message} />
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
                          ? '/icons/hourglass-24.gif'
                          : '/icons/double-tick-50.png'
                    }
                    alt=""
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            )
          })}
        </div>

        <form
          className="composer"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <div className="composer-input">
            <input
              ref={attachmentInputRef}
              type="file"
              className="composer-attachment-input"
              onChange={onAttachmentChange}
            />
            <textarea
              rows={3}
              placeholder="Напиши сообщение в группу..."
              value={draft}
              onFocus={onComposerFocus}
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
      {actions}
    </>
  )
}
