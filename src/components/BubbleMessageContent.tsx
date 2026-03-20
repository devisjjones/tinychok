import type { Message } from '../app/types'
import { formatAttachmentSize, formatMessageAuthor, isImageMimeType } from '../app/utils'

type BubbleMessageContentProps = {
  message: Pick<Message, 'attachment' | 'replyTo' | 'text'>
  replyChatTitle?: string
}

export function BubbleMessageContent({
  message,
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
      {message.text.trim() ? <p>{message.text}</p> : null}
    </>
  )
}
