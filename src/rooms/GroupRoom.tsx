import type { FormEvent, MouseEvent, ReactNode, RefObject } from 'react'
import type { GroupPreview, Message } from '../app/types'

type GroupRoomProps = {
  actions: ReactNode
  activeMessageId: number | null
  draft: string
  group: GroupPreview
  messageFeedRef: RefObject<HTMLDivElement | null>
  onBack: () => void
  onComposerFocus: () => void
  onDraftChange: (value: string) => void
  onMessageSelect: (event: MouseEvent<HTMLButtonElement>, message: Message) => void
  onSubmit: () => void
}

export function GroupRoom({
  actions,
  activeMessageId,
  draft,
  group,
  messageFeedRef,
  onBack,
  onComposerFocus,
  onDraftChange,
  onMessageSelect,
  onSubmit,
}: GroupRoomProps) {
  return (
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
        {group.messages.map((message) => (
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
            <span className="bubble-meta">
              {message.author === 'me' ? 'Вы' : message.displayAuthor ?? 'Участник группы'}
            </span>
            <p>{message.text}</p>
            <time>{message.time}</time>
          </button>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <div className="composer-input">
          <textarea
            rows={3}
            placeholder="Напиши сообщение в группу..."
            value={draft}
            onFocus={onComposerFocus}
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <button type="submit" className="send-button composer-send">
            Отправить
          </button>
        </div>
      </form>

      {actions}
    </section>
  )
}
