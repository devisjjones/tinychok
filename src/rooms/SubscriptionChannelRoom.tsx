import type { MouseEvent, ReactNode, RefObject } from 'react'
import type { SubscriptionChannel } from '../app/types'
import { BubbleMessageContent } from '../components/BubbleMessageContent'

type SubscriptionChannelRoomProps = {
  actions: ReactNode
  activePostId: number | null
  channel: SubscriptionChannel
  messageFeedRef: RefObject<HTMLDivElement | null>
  onBack: () => void
  onPostSelect: (event: MouseEvent<HTMLButtonElement>, postId: number) => void
}

export function SubscriptionChannelRoom({
  actions,
  activePostId,
  channel,
  messageFeedRef,
  onBack,
  onPostSelect,
}: SubscriptionChannelRoomProps) {
  return (
    <>
      <section className="chat-room channel-room">
        <header className="room-header">
          <button type="button" className="soft-button room-mobile-back" onClick={onBack}>
            Назад
          </button>
          <div className="room-id">
            <span className="avatar large" style={{ backgroundColor: channel.accent }}>
              {channel.title.slice(0, 1)}
            </span>
            <div>
              <div className="room-title">
                <div className="room-title-name">
                  <h3>{channel.title}</h3>
                  <span className="chat-star">
                    <img src="/icons/news100.svg" alt="Канал" />
                  </span>
                </div>
              </div>
              <p>{`${channel.handle} · ${channel.draft ? 'Черновики канала' : 'Публикации канала'}`}</p>
            </div>
          </div>
        </header>

        <div className="message-feed" ref={messageFeedRef}>
          {channel.posts.map((post) => (
            <button
              key={post.id}
              type="button"
              className={
                activePostId === post.id
                  ? 'bubble bubble-button channel-post selected'
                  : 'bubble bubble-button channel-post'
              }
              onClick={(event) => onPostSelect(event, post.id)}
            >
              <span className="bubble-meta">{channel.draft ? 'Draft-пост' : 'Пост канала'}</span>
              <BubbleMessageContent message={post} />
              <time>{post.time}</time>
            </button>
          ))}
        </div>
      </section>
      {actions}
    </>
  )
}
