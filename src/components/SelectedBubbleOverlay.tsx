import type { ActionAnchor, ChannelPost, GroupParticipant, Message } from '../app/types'
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

function getOverlayPosition(anchor: ActionAnchor) {
  return {
    left: `${anchor.left}px`,
    top: `${anchor.top}px`,
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
        />
        <time>{props.post.time}</time>
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
