import type { KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react'
import { Fragment, useEffect, useRef } from 'react'
import {
  formatConversationDayLabel,
  getConversationDayKey,
  insertComposerTextAtCursor,
  scrollFeedChildIntoView,
  shouldSubmitComposerWithEnter,
} from '../app/utils'
import type { ReplyTarget, SubscriptionChannel } from '../app/types'
import { BubbleMessageContent } from '../components/BubbleMessageContent'
import { AttachedReplyBubble } from '../components/AttachedReplyBubble'
import { ConversationDayDivider } from '../components/ConversationDayDivider'
import { EmojiPicker } from '../components/EmojiPicker'
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
  onOpenThread: (postId: number) => void
  onPostSelect: (event: MouseEvent<HTMLButtonElement>, postId: number) => void
  onReplyReferenceJump?: (postId: number) => void
  publisher?: {
    draft: string
    error?: string
    isBusy?: boolean
    onReplyCancel: () => void
    onDraftChange: (value: string) => void
    replyTarget: ReplyTarget | null
    onSubmit: () => void
  }
  subscriptionAction?: {
    label: string
    onClick: () => void
  }
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
  onOpenThread,
  onPostSelect,
  onReplyReferenceJump,
  publisher,
  subscriberCountLabel,
  subscriptionAction,
}: SubscriptionChannelRoomProps) {
  const publisherInputRef = useRef<HTMLTextAreaElement | null>(null)

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
    if (!publisher?.replyTarget) return

    window.requestAnimationFrame(() => {
      publisherInputRef.current?.focus()
    })
  }, [publisher?.replyTarget])

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
              channel.title.slice(0, 1)
            )}
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

            return (
              <Fragment key={post.id}>
                {index === 0 || previousPostDayKey !== postDayKey ? (
                  <ConversationDayDivider label={formatConversationDayLabel(post.createdAt)} />
                ) : null}
                <ThreadedBubble
                  variant="channel"
                  threadCount={post.threadComments?.length ?? 0}
                  onOpenThread={() => onOpenThread(post.id)}
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
                        <button
                          type="button"
                          data-channel-post-id={post.id}
                          className={
                            activePostId === post.id
                              ? `bubble bubble-button channel-post selected${replyReference ? ' has-attached-reply' : ''}`
                              : `bubble bubble-button channel-post${replyReference ? ' has-attached-reply' : ''}`
                          }
                          onClick={(event) => onPostSelect(event, post.id)}
                        >
                          <BubbleMessageContent message={post} showReplyInline={false} />
                          <time>{post.time}</time>
                        </button>
                      }
                    />
                  }
                />
              </Fragment>
            )
          })}
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
              {publisher.replyTarget ? (
                <div className="composer-reply">
                  <div>
                    <span className="settings-label">Ответ</span>
                    <p>{publisher.replyTarget.text}</p>
                  </div>
                  <button
                    type="button"
                    className="soft-button composer-reply-cancel"
                    onClick={publisher.onReplyCancel}
                    aria-label="Отменить ответ"
                    title="Отменить ответ"
                  >
                    <img src="/icons/cancel.png" alt="" aria-hidden="true" className="composer-reply-cancel-icon" />
                  </button>
                </div>
              ) : null}
              <div className="composer-entry">
                <div className="composer-field">
                  <textarea
                    ref={publisherInputRef}
                    rows={1}
                    placeholder="Напишите сообщение в канал..."
                    value={publisher.draft}
                    onChange={(event) => publisher.onDraftChange(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                  />
                  <div className="composer-tools">
                    <EmojiPicker
                      onSelect={(emoji) =>
                        insertComposerTextAtCursor(
                          publisherInputRef.current,
                          publisher.draft,
                          emoji,
                          publisher.onDraftChange,
                        )
                      }
                    />
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
