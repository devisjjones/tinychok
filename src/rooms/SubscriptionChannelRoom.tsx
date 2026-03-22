import type { KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react'
import { shouldSubmitComposerWithEnter } from '../app/utils'
import type { SubscriptionChannel } from '../app/types'
import { BubbleMessageContent } from '../components/BubbleMessageContent'
import { ThreadedBubble } from '../components/ThreadedBubble'

type SubscriptionChannelRoomProps = {
  actions: ReactNode
  activePostId: number | null
  channel: SubscriptionChannel
  messageFeedRef: RefObject<HTMLDivElement | null>
  onBack: () => void
  onOpenChannelActions?: (event: MouseEvent<HTMLButtonElement>) => void
  onOpenThread: (postId: number) => void
  onPostSelect: (event: MouseEvent<HTMLButtonElement>, postId: number) => void
  publisher?: {
    draft: string
    error?: string
    isBusy?: boolean
    onDraftChange: (value: string) => void
    onSubmit: () => void
  }
  subscriptionAction?: {
    label: string
    onClick: () => void
  }
}

export function SubscriptionChannelRoom({
  actions,
  activePostId,
  channel,
  messageFeedRef,
  onBack,
  onOpenChannelActions,
  onOpenThread,
  onPostSelect,
  publisher,
  subscriptionAction,
}: SubscriptionChannelRoomProps) {
  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!publisher || !publisher.draft.trim() || publisher.isBusy) return
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
    publisher.onSubmit()
  }

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
            <span className="room-mobile-back-icon" aria-hidden="true">
              &larr;
            </span>
          </button>
          <div className="room-id">
            <span className="avatar large" style={{ backgroundColor: channel.accent }}>
              {channel.title.slice(0, 1)}
            </span>
            <div>
              <div className="room-title">
                <div className="room-title-name">
                  <h3>{channel.title}</h3>
                  {channel.muted ? (
                    <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                      <img src="/icons/bell-100.png" alt="" />
                    </span>
                  ) : null}
                  <span className="chat-star">
                    <img src="/icons/news100.svg" alt="Канал" />
                  </span>
                </div>
              </div>
              <p>{`${channel.handle} · ${channel.draft ? 'Черновики канала' : 'Публикации канала'}`}</p>
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
              <span className="room-group-actions-dots" aria-hidden="true">
                ...
              </span>
            </button>
          ) : null}
        </header>

        <div className="message-feed" ref={messageFeedRef}>
          {channel.posts.map((post) => (
            <ThreadedBubble
              key={post.id}
              variant="channel"
              threadCount={post.threadComments?.length ?? 0}
              onOpenThread={() => onOpenThread(post.id)}
              bubble={
                <button
                  type="button"
                  className={
                    activePostId === post.id
                      ? 'bubble bubble-button channel-post selected'
                      : 'bubble bubble-button channel-post'
                  }
                  onClick={(event) => onPostSelect(event, post.id)}
                >
                  <BubbleMessageContent message={post} />
                  <time>{post.time}</time>
                </button>
              }
            />
          ))}
        </div>
        {publisher ? (
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault()
              publisher.onSubmit()
            }}
          >
            <div className="composer-input">
              <div className="composer-entry">
                <div className="composer-field">
                  <textarea
                    rows={1}
                    placeholder="Напишите сообщение в канал..."
                    value={publisher.draft}
                    onChange={(event) => publisher.onDraftChange(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                  />
                  <div className="composer-tools">
                    {publisher.draft.trim() ? (
                      <button type="submit" className="send-button composer-send" disabled={publisher.isBusy}>
                        <span className="composer-send-icon" aria-hidden="true">
                          <img src="/icons/sent.png" alt="" />
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            {publisher.error ? <p className="auth-error">{publisher.error}</p> : null}
          </form>
        ) : subscriptionAction ? (
          <div className="channel-room-footer">
            <button
              type="button"
              className="send-button channel-subscribe-button"
              onClick={subscriptionAction.onClick}
            >
              {subscriptionAction.label}
            </button>
          </div>
        ) : null}
      </section>
      {actions}
    </>
  )
}
