import type { MouseEvent as ReactMouseEvent } from 'react'
import type { ChannelMessageSource, Message } from '../app/types'
import { formatAttachmentSize, formatMessageAuthor, isImageMimeType } from '../app/utils'

type BubbleMessageContentProps = {
  message: Pick<Message, 'attachment' | 'replyTo' | 'sourceGroup' | 'text'>
  linkedChannel?: ChannelMessageSource | null
  onOpenLinkedChannel?: () => void
  replyChatTitle?: string
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

export function BubbleMessageContent({
  linkedChannel,
  message,
  onOpenLinkedChannel,
  replyChatTitle,
}: BubbleMessageContentProps) {
  return (
    <>
      {message.replyTo ? (
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
      {message.attachment ? (
        <div className="bubble-attachment">
          {isImageMimeType(message.attachment.mimeType) ? (
            <img
              src={message.attachment.mediaUrl}
              alt={message.attachment.fileName}
              className="bubble-attachment-image"
            />
          ) : (
            <span className="bubble-attachment-badge">Файл</span>
          )}
          <div className="bubble-attachment-copy">
            <strong>{message.attachment.fileName}</strong>
            <span>{formatAttachmentSize(message.attachment.size)}</span>
          </div>
        </div>
      ) : null}
      {linkedChannel ? (
        <ForwardedChannelHeader sourceChannel={linkedChannel} onClick={onOpenLinkedChannel} />
      ) : message.sourceGroup ? (
        <div className="bubble-forwarded-source bubble-forwarded-source-group">
          <span
            className="avatar bubble-forwarded-source-avatar"
            style={{ backgroundColor: message.sourceGroup.accent ?? '#8c5738' }}
          >
            {message.sourceGroup.title.slice(0, 1)}
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
