import type { ActionAnchor, ChannelPost, GroupParticipant, Message, ThreadComment } from '../app/types'
import { shouldShowDeliveryCaption } from '../app/utils'
import { BubbleMessageContent, ForwardedChannelHeader } from './BubbleMessageContent'

type SelectedBubbleOverlayProps =
  | {
      anchor: ActionAnchor
      kind: 'direct'
      deliveryIssue?: 'pending' | 'failed'
      linkedChannel?: NonNullable<Message['sourceChannel']> | null
      message: Message
      mine: boolean
      replyChatTitle?: string
    }
  | {
      anchor: ActionAnchor
      deliveryIssue?: 'pending' | 'failed'
      kind: 'group'
      linkedChannel?: NonNullable<Message['sourceChannel']> | null
      message: Message
      mine: boolean
      participant?: GroupParticipant | null
    }
  | {
      anchor: ActionAnchor
      kind: 'channel'
      channelTitle: string
      post: ChannelPost
      draft: boolean
    }
  | {
      anchor: ActionAnchor
      kind: 'thread-comment'
      comment: ThreadComment
      mine: boolean
      participant?: GroupParticipant | null
    }

function getOverlayPosition(anchor: ActionAnchor) {
  const viewportInset = 16
  const overlayHeight = Math.max(0, anchor.bottom - anchor.top)
  const maxHeight = Math.max(120, window.innerHeight - viewportInset * 2)
  const boundedHeight = Math.min(overlayHeight, maxHeight)
  const top = Math.min(
    Math.max(viewportInset, anchor.top),
    Math.max(viewportInset, window.innerHeight - viewportInset - boundedHeight),
  )

  return {
    left: `${anchor.left}px`,
    maxHeight: `${maxHeight}px`,
    top: `${top}px`,
    width: `${anchor.width}px`,
  }
}

export function SelectedBubbleOverlay(props: SelectedBubbleOverlayProps) {
  if (props.kind === 'channel') {
    return (
      <div
        className="bubble bubble-overlay bubble-button selected channel-post"
        style={getOverlayPosition(props.anchor)}
        aria-hidden="true"
      >
        <BubbleMessageContent
          message={{ attachment: props.post.attachment, replyTo: undefined, text: props.post.text }}
          showReplyInline={false}
        />
        <time>{props.post.time}</time>
      </div>
    )
  }

  if (props.kind === 'thread-comment') {
    return (
      <div
        className={`bubble bubble-overlay bubble-button selected${props.mine ? ' mine' : ''}`}
        style={getOverlayPosition(props.anchor)}
        aria-hidden="true"
      >
        {props.mine ? (
          <span className="bubble-meta">Вы</span>
        ) : props.participant ? (
          <div className="bubble-sender">
            <span className="bubble-sender-avatar-stack">
              <span
                className="avatar bubble-sender-avatar"
                style={{ backgroundColor: props.participant.accent }}
              >
                {props.participant.title.slice(0, 1)}
              </span>
              {props.participant.online ? (
                <span className="bubble-sender-presence-dot" aria-label="В сети" />
              ) : null}
            </span>
            <span className="bubble-sender-name">{props.participant.title}</span>
            {props.participant.premium ? (
              <span className="premium-crown bubble-sender-crown" aria-label="Премиум">
                <img src="/icons/crown64.png" alt="" />
              </span>
            ) : null}
          </div>
        ) : (
          <span className="bubble-meta">{props.comment.displayAuthor ?? 'Участник'}</span>
        )}
        <BubbleMessageContent
          message={{
            attachment: undefined,
            replyTo: props.comment.replyTo,
            sourceGroup: undefined,
            text: props.comment.text,
          }}
          showReplyInline={false}
        />
        <time>{props.comment.time}</time>
      </div>
    )
  }

  const bubbleClassNames = ['bubble', 'bubble-overlay', 'bubble-button', 'selected']
  const hasDeliveryIssue = Boolean(props.deliveryIssue)
  const showDeliveryCaption = hasDeliveryIssue && shouldShowDeliveryCaption(props.message)

  if (props.mine) {
    bubbleClassNames.push('mine', 'has-delivery-indicator')
  }

  if (hasDeliveryIssue) {
    bubbleClassNames.push('has-delivery-issue')
  }

  if (showDeliveryCaption) {
    bubbleClassNames.push('has-delivery-caption')
  }

  if (props.deliveryIssue === 'failed') {
    bubbleClassNames.push('delivery-failed')
  }

  if (props.kind === 'direct' && props.mine && props.message.readAt) {
    bubbleClassNames.push('read-by-recipient')
  }

  return (
    <div
      className={bubbleClassNames.join(' ')}
      style={getOverlayPosition(props.anchor)}
      aria-hidden="true"
    >
      {props.kind === 'direct' ? (
        props.message.forwarded && !props.message.sourceChannel ? (
          <span className="bubble-meta">
            {props.message.forwardedAuthorName
              ? `Переслано ${props.message.forwardedAuthorName}`
              : 'Переслано'}
          </span>
        ) : null
      ) : (
        props.message.author === 'me' ? (
          <span className="bubble-meta">Вы</span>
        ) : props.participant ? (
          <div className="bubble-sender">
            <span className="bubble-sender-avatar-stack">
              <span
                className="avatar bubble-sender-avatar"
                style={{ backgroundColor: props.participant.accent }}
              >
                {props.participant.title.slice(0, 1)}
              </span>
              {props.participant.online ? (
                <span className="bubble-sender-presence-dot" aria-label="В сети" />
              ) : null}
            </span>
            <span className="bubble-sender-name">{props.participant.title}</span>
            {props.participant.premium ? (
              <span className="premium-crown bubble-sender-crown" aria-label="Премиум">
                <img src="/icons/crown64.png" alt="" />
              </span>
            ) : null}
          </div>
        ) : (
          <span className="bubble-meta">{props.message.displayAuthor ?? 'Участник группы'}</span>
        )
      )}
      {props.message.sourceChannel ? (
        <>
          <ForwardedChannelHeader sourceChannel={props.message.sourceChannel} />
          <span className="bubble-meta">Переслано</span>
        </>
      ) : props.message.sourceGroup ? (
        <span className="bubble-meta">Приглашение в группу</span>
      ) : null}
      <BubbleMessageContent
        linkedChannel={props.linkedChannel}
        message={props.message}
        replyChatTitle={props.kind === 'direct' ? props.replyChatTitle : undefined}
        showReplyInline={false}
      />
      <time>{props.message.time}</time>
      {showDeliveryCaption ? (
        <span className="bubble-delivery-caption">Сообщение не отправлено</span>
      ) : null}
      {props.mine ? (
        <img
          className="bubble-delivery-indicator"
          src={
            props.deliveryIssue === 'failed'
              ? '/icons/warning-48.png'
              : props.deliveryIssue === 'pending'
                ? '/icons/hourglass-48.png'
                : '/icons/double-tick-50.png'
          }
          alt=""
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}
