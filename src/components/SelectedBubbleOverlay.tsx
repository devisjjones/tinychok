import type { ActionAnchor, ChannelPost, Message } from '../app/types'
import { shouldShowDeliveryCaption } from '../app/utils'
import { BubbleMessageContent } from './BubbleMessageContent'

type SelectedBubbleOverlayProps =
  | {
      anchor: ActionAnchor
      kind: 'direct'
      deliveryIssue?: 'pending' | 'failed'
      message: Message
      mine: boolean
      replyChatTitle?: string
    }
  | {
      anchor: ActionAnchor
      deliveryIssue?: 'pending' | 'failed'
      kind: 'group'
      message: Message
      mine: boolean
    }
  | {
      anchor: ActionAnchor
      kind: 'channel'
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
        <span className="bubble-meta">{props.draft ? 'Draft-пост' : 'Пост канала'}</span>
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
        props.message.forwarded ? <span className="bubble-meta">Переслано</span> : null
      ) : (
        <span className="bubble-meta">
          {props.message.author === 'me' ? 'Вы' : props.message.displayAuthor ?? 'Участник группы'}
        </span>
      )}
      <BubbleMessageContent
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
                ? '/icons/hourglass-24.gif'
                : '/icons/double-tick-50.png'
          }
          alt=""
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}
