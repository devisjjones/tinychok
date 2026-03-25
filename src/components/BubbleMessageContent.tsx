import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { ChannelMessageSource, Message } from '../app/types'
import {
  formatAttachmentImageDimensions,
  formatAttachmentSize,
  formatMessageAuthor,
  isImageMimeType,
} from '../app/utils'

type BubbleMessageContentProps = {
  message: Pick<Message, 'attachment' | 'replyTo' | 'sourceGroup' | 'text'>
  imageOverlay?: ReactNode
  linkedChannel?: ChannelMessageSource | null
  onOpenAttachment?: (attachment: NonNullable<Message['attachment']>) => void
  onOpenLinkedChannel?: () => void
  replyChatTitle?: string
  showReplyInline?: boolean
}

type BubbleImageOverlayMetaProps = {
  deliveryIndicatorSrc?: string | null
  time: string
}

type ForwardedChannelHeaderProps = {
  sourceChannel: NonNullable<Message['sourceChannel']>
  onClick?: () => void
}

export function ForwardedChannelHeader({
  sourceChannel,
  onClick,
}: ForwardedChannelHeaderProps) {
  return (
    <>
      {sourceChannel.leadText ? (
        <p className="bubble-forwarded-source-lead">{sourceChannel.leadText}</p>
      ) : null}
      {onClick ? (
        <button
          type="button"
          className="bubble-forwarded-source bubble-forwarded-source-button"
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
            event.stopPropagation()
            onClick()
          }}
        >
          <span
            className="avatar bubble-forwarded-source-avatar"
            style={{ backgroundColor: sourceChannel.accent ?? '#8c5738' }}
          >
            {sourceChannel.title.slice(0, 1)}
          </span>
          <span className="bubble-forwarded-source-copy">
            <span className="bubble-forwarded-source-title">{sourceChannel.title}</span>
            <span className="chat-star bubble-forwarded-source-icon" aria-hidden="true">
              <img src="/icons/news100.svg" alt="" />
            </span>
          </span>
        </button>
      ) : (
        <div className="bubble-forwarded-source">
          <span
            className="avatar bubble-forwarded-source-avatar"
            style={{ backgroundColor: sourceChannel.accent ?? '#8c5738' }}
          >
            {sourceChannel.title.slice(0, 1)}
          </span>
          <span className="bubble-forwarded-source-copy">
            <span className="bubble-forwarded-source-title">{sourceChannel.title}</span>
            <span className="chat-star bubble-forwarded-source-icon" aria-hidden="true">
              <img src="/icons/news100.svg" alt="" />
            </span>
          </span>
        </div>
      )}
    </>
  )
}

export function BubbleImageOverlayMeta({
  deliveryIndicatorSrc,
  time,
}: BubbleImageOverlayMetaProps) {
  return (
    <span className="bubble-attachment-image-overlay">
      <span className="bubble-attachment-image-time">{time}</span>
      {deliveryIndicatorSrc ? (
        <img
          className="bubble-attachment-image-indicator"
          src={deliveryIndicatorSrc}
          alt=""
          aria-hidden="true"
        />
      ) : null}
    </span>
  )
}

export function BubbleMessageContent({
  imageOverlay,
  linkedChannel,
  message,
  onOpenAttachment,
  onOpenLinkedChannel,
  replyChatTitle,
  showReplyInline = true,
}: BubbleMessageContentProps) {
  const hasBodyBelowAttachment = Boolean(linkedChannel || message.sourceGroup || message.text.trim())
  const attachmentNode = message.attachment ? (
    isImageMimeType(message.attachment.mimeType) ? (
      <div
        className={`bubble-attachment bubble-attachment-photo bubble-attachment-button${
          hasBodyBelowAttachment ? ' has-body-below' : ' image-only'
        }`}
        onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
          event.stopPropagation()
          onOpenAttachment?.(message.attachment!)
        }}
      >
        <img
          src={message.attachment.mediaUrl}
          alt={message.attachment.fileName}
          className="bubble-attachment-image"
        />
        {imageOverlay}
      </div>
    ) : (
      <div
        className="bubble-attachment bubble-attachment-link"
        onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
          event.stopPropagation()
          onOpenAttachment?.(message.attachment!)
        }}
      >
        <span className="bubble-attachment-badge">Файл</span>
        <div className="bubble-attachment-copy">
          <strong>{message.attachment.fileName}</strong>
          <span>
            {formatAttachmentSize(message.attachment.size)}
            {message.attachment.width && message.attachment.height
              ? `, ${formatAttachmentImageDimensions(message.attachment.width, message.attachment.height)}`
              : ''}
          </span>
        </div>
      </div>
    )
  ) : null

  return (
    <>
      {showReplyInline && message.replyTo ? (
        <div className="bubble-reply">
          <span>
            {replyChatTitle
              ? formatMessageAuthor(message.replyTo.author, replyChatTitle)
              : message.replyTo.author === 'me'
                ? 'Вы'
                : 'Собеседник'}
          </span>
          <p>{message.replyTo.text}</p>
        </div>
      ) : null}
      {attachmentNode}
      {linkedChannel ? (
        <ForwardedChannelHeader sourceChannel={linkedChannel} onClick={onOpenLinkedChannel} />
      ) : message.sourceGroup ? (
        <div className="bubble-forwarded-source bubble-forwarded-source-group">
          <span
            className="avatar bubble-forwarded-source-avatar"
            style={{ backgroundColor: message.sourceGroup.accent ?? '#8c5738' }}
          >
            {message.sourceGroup.avatarImage ? (
              <img src={message.sourceGroup.avatarImage} alt="" className="channel-avatar-image" />
            ) : (
              message.sourceGroup.title.slice(0, 1)
            )}
          </span>
          <span className="bubble-forwarded-source-copy">
            <span className="bubble-forwarded-source-title">{message.sourceGroup.title}</span>
            <span className="chat-star bubble-forwarded-source-icon" aria-hidden="true">
              <img src="/icons/group100.png" alt="" />
            </span>
          </span>
        </div>
      ) : message.text.trim() ? (
        <p>{message.text}</p>
      ) : null}
    </>
  )
}

type ReplyReferenceBlockProps = {
  mine?: boolean
  onClick?: () => void
  replyChatTitle?: string
  replyTo: NonNullable<Message['replyTo']>
}

export function ReplyReferenceBlock({
  mine = false,
  onClick,
  replyChatTitle,
  replyTo,
}: ReplyReferenceBlockProps) {
  const authorLabel = replyChatTitle
    ? formatMessageAuthor(replyTo.author, replyChatTitle)
    : replyTo.author === 'me'
      ? 'Вы'
      : 'Собеседник'

  const className = mine
    ? 'bubble-reply-reference bubble-reply-reference-button mine'
    : 'bubble-reply-reference bubble-reply-reference-button'

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={replyTo.text}>
        <span className="bubble-reply-reference-label">{authorLabel}</span>
        <span className="bubble-reply-reference-copy">{replyTo.text}</span>
      </button>
    )
  }

  return (
    <div className={mine ? 'bubble-reply-reference mine' : 'bubble-reply-reference'} title={replyTo.text}>
      <span className="bubble-reply-reference-label">{authorLabel}</span>
      <span className="bubble-reply-reference-copy">{replyTo.text}</span>
    </div>
  )
}
