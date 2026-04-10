import React, {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import type { ChannelMessageSource, Message } from '../app/types'
import {
  formatChannelAvatarLabel,
  formatAttachmentImageDimensions,
  formatAttachmentSize,
  isImageMimeType,
  isVideoMimeType,
  parseMessageTextSegments,
  stripMessageFormattingMarkup,
} from '../app/utils'

type BubbleMessageContentProps = {
  attachmentLayout?: 'default' | 'thread-source-thumbnail' | 'thread-source-card'
  inlineMeta?: ReactNode
  message: Pick<
    Message,
    'attachment' | 'attachmentRemovedNotice' | 'replyTo' | 'sourceContact' | 'sourceGroup' | 'text'
  >
  imageOverlay?: ReactNode
  linkedChannel?: ChannelMessageSource | null
  onOpenAttachment?: (attachment: NonNullable<Message['attachment']>) => void
  onOpenExternalLink?: (url: string) => void
  onOpenLinkedChannel?: () => void
  onOpenPremiumUpsell?: () => void
  onOpenSourceContact?: () => void
  onOpenSourceGroup?: () => void
  replyChatTitle?: string
  showReplyInline?: boolean
}

type BubbleImageOverlayMetaProps = {
  deliveryIndicatorSrc?: string | null
  time: string
}

type BubbleTextInlineMetaProps = {
  deliveryIndicatorSrc?: string | null
  time: string
}

type EmojiOnlyMessageContentProps = {
  deliveryIndicatorSrc?: string | null
  emoji: string
  time: string
}

type AttachmentRemovedNoticeBlockProps = {
  notice: NonNullable<Message['attachmentRemovedNotice']>
  onOpenPremiumUpsell?: () => void
}

export function shouldUseLightDeliveryIndicatorTint(deliveryIndicatorSrc: string | null | undefined) {
  return (
    deliveryIndicatorSrc === '/icons/check-mark-50.png' ||
    deliveryIndicatorSrc === '/icons/double-tick-50.png'
  )
}

function buildVideoPreviewUrl(mediaUrl: string) {
  const normalizedMediaUrl = mediaUrl.trim()
  if (!normalizedMediaUrl) {
    return normalizedMediaUrl
  }

  try {
    if (/^https?:\/\//u.test(normalizedMediaUrl)) {
      const previewUrl = new URL('/api/media/preview', normalizedMediaUrl)
      previewUrl.searchParams.set('mediaUrl', normalizedMediaUrl)
      return previewUrl.toString()
    }

    const previewParams = new URLSearchParams()
    previewParams.set('mediaUrl', normalizedMediaUrl)
    return `/api/media/preview?${previewParams.toString()}`
  } catch {
    return normalizedMediaUrl.includes('#') ? normalizedMediaUrl : `${normalizedMediaUrl}#t=0.001`
  }
}

function AttachmentRemovedNoticeBlock({
  notice,
  onOpenPremiumUpsell,
}: AttachmentRemovedNoticeBlockProps) {
  const showPremiumUpsell = notice.reason === 'storage-quota' && notice.perspective === 'self'

  if (!showPremiumUpsell) {
    return <p className="bubble-attachment-removed-note">{notice.text}</p>
  }

  const premiumUpsellCtaText = 'Оформите подписку.'
  const premiumLeadText = notice.text.endsWith(premiumUpsellCtaText)
    ? notice.text.slice(0, -premiumUpsellCtaText.length).trimEnd()
    : notice.text

  if (!onOpenPremiumUpsell) {
    return (
      <p className="bubble-attachment-removed-note bubble-attachment-removed-note-premium">
        <span>{notice.text}</span>
        <span className="bubble-attachment-removed-note-crown" aria-hidden="true">
          <img src="/icons/crown64.png" alt="" />
        </span>
      </p>
    )
  }

  return (
    <p className="bubble-attachment-removed-note bubble-attachment-removed-note-premium">
      {premiumLeadText ? <span>{premiumLeadText}</span> : null}
      <span
        className="bubble-attachment-removed-note-link"
        role="link"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onOpenPremiumUpsell()
        }}
        onMouseDown={(event) => {
          event.stopPropagation()
        }}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
      >
        {premiumUpsellCtaText}
      </span>
      <span className="bubble-attachment-removed-note-crown" aria-hidden="true">
        <img src="/icons/crown64.png" alt="" />
      </span>
    </p>
  )
}

type ForwardedChannelHeaderProps = {
  sourceChannel: NonNullable<Message['sourceChannel']>
  onClick?: () => void
}

export function ForwardedChannelHeader({
  sourceChannel,
  onClick,
}: ForwardedChannelHeaderProps) {
  const sourceClassName = sourceChannel.leadText
    ? 'bubble-forwarded-source bubble-forwarded-source-button bubble-forwarded-source-invite'
    : 'bubble-forwarded-source bubble-forwarded-source-button'
  const passiveSourceClassName = sourceChannel.leadText
    ? 'bubble-forwarded-source bubble-forwarded-source-invite'
    : 'bubble-forwarded-source'

  return (
    <>
      {sourceChannel.leadText ? (
        <p className="bubble-forwarded-source-lead">{sourceChannel.leadText}</p>
      ) : null}
      {onClick ? (
        <button
          type="button"
          className={sourceClassName}
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
            event.stopPropagation()
            onClick()
          }}
        >
          <span
            className="avatar bubble-forwarded-source-avatar"
            style={{ backgroundColor: sourceChannel.accent ?? '#8c5738' }}
          >
            {formatChannelAvatarLabel(sourceChannel.title)}
          </span>
          <span className="bubble-forwarded-source-copy">
            <span className="bubble-forwarded-source-copy-text">
              <span className="bubble-forwarded-source-title">{sourceChannel.title}</span>
              {sourceChannel.statusText ? (
                <span className="bubble-forwarded-source-status">{sourceChannel.statusText}</span>
              ) : null}
            </span>
            <span className="chat-star bubble-forwarded-source-icon" aria-hidden="true">
              <img src="/icons/news100.svg" alt="" />
            </span>
          </span>
        </button>
      ) : (
        <div className={passiveSourceClassName}>
          <span
            className="avatar bubble-forwarded-source-avatar"
            style={{ backgroundColor: sourceChannel.accent ?? '#8c5738' }}
          >
            {formatChannelAvatarLabel(sourceChannel.title)}
          </span>
          <span className="bubble-forwarded-source-copy">
            <span className="bubble-forwarded-source-copy-text">
              <span className="bubble-forwarded-source-title">{sourceChannel.title}</span>
              {sourceChannel.statusText ? (
                <span className="bubble-forwarded-source-status">{sourceChannel.statusText}</span>
              ) : null}
            </span>
            <span className="chat-star bubble-forwarded-source-icon" aria-hidden="true">
              <img src="/icons/news100.svg" alt="" />
            </span>
          </span>
        </div>
      )}
    </>
  )
}

type ForwardedGroupHeaderProps = {
  sourceGroup: NonNullable<Message['sourceGroup']>
  onClick?: () => void
}

export function ForwardedGroupHeader({
  sourceGroup,
  onClick,
}: ForwardedGroupHeaderProps) {
  const leadText = sourceGroup.leadText?.trim() || 'Пользователь приглашает вас в группу'
  const deletedHint = sourceGroup.archivedAt ? 'Группа удалена' : ''
  const sourceClassName = 'bubble-forwarded-source bubble-forwarded-source-button bubble-forwarded-source-invite'
  const passiveSourceClassName = 'bubble-forwarded-source bubble-forwarded-source-invite'

  const avatarNode = (
    <span
      className="avatar bubble-forwarded-source-avatar"
      style={{ backgroundColor: sourceGroup.accent ?? '#8c5738' }}
    >
      {sourceGroup.avatarImage ? (
        <img src={sourceGroup.avatarImage} alt="" className="channel-avatar-image" />
      ) : (
        formatChannelAvatarLabel(sourceGroup.title)
      )}
    </span>
  )

  const copyNode = (
    <span className="bubble-forwarded-source-copy">
      <span className="bubble-forwarded-source-copy-text">
        <span className="bubble-forwarded-source-title">{sourceGroup.title}</span>
        {deletedHint ? (
          <span className="bubble-forwarded-source-status bubble-forwarded-source-warning">{deletedHint}</span>
        ) : null}
      </span>
      <span className="chat-star bubble-forwarded-source-icon" aria-hidden="true">
        <img src="/icons/group100.png" alt="" />
      </span>
    </span>
  )

  return (
    <>
      <p className="bubble-forwarded-source-lead">{leadText}</p>
      {onClick ? (
        <button
          type="button"
          className={sourceClassName}
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
            event.stopPropagation()
            onClick()
          }}
        >
          {avatarNode}
          {copyNode}
        </button>
      ) : (
        <div className={passiveSourceClassName}>
          {avatarNode}
          {copyNode}
        </div>
      )}
    </>
  )
}

type ForwardedContactHeaderProps = {
  sourceContact: NonNullable<Message['sourceContact']>
  onClick?: () => void
}

export function ForwardedContactHeader({
  sourceContact,
  onClick,
}: ForwardedContactHeaderProps) {
  const sourceClassName = 'bubble-forwarded-source bubble-forwarded-source-button bubble-forwarded-source-invite'
  const passiveSourceClassName = 'bubble-forwarded-source bubble-forwarded-source-invite'
  const avatarFallback = sourceContact.title.trim().slice(0, 1).toUpperCase() || '@'

  const avatarNode = (
    <span
      className="avatar bubble-forwarded-source-avatar"
      style={{ backgroundColor: sourceContact.accent ?? '#8c5738' }}
    >
      {sourceContact.avatarImage ? (
        <img src={sourceContact.avatarImage} alt="" className="channel-avatar-image" />
      ) : (
        avatarFallback
      )}
    </span>
  )

  const copyNode = (
    <span className="bubble-forwarded-source-copy">
      <span className="bubble-forwarded-source-copy-text">
        <span className="bubble-forwarded-source-title">{sourceContact.title}</span>
        {sourceContact.status ? (
          <span className="bubble-forwarded-source-status">{sourceContact.status}</span>
        ) : null}
      </span>
      <span className="chat-star bubble-forwarded-source-icon" aria-hidden="true">
        <img src="/icons/contacts100.svg" alt="" />
      </span>
    </span>
  )

  return onClick ? (
    <button
      type="button"
      className={sourceClassName}
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {avatarNode}
      {copyNode}
    </button>
  ) : (
    <div className={passiveSourceClassName}>
      {avatarNode}
      {copyNode}
    </div>
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
          className={
            shouldUseLightDeliveryIndicatorTint(deliveryIndicatorSrc)
              ? 'bubble-attachment-image-indicator bubble-attachment-image-indicator-light'
              : 'bubble-attachment-image-indicator'
          }
          src={deliveryIndicatorSrc}
          alt=""
          aria-hidden="true"
        />
      ) : null}
    </span>
  )
}

export function BubbleTextInlineMeta({
  deliveryIndicatorSrc,
  time,
}: BubbleTextInlineMetaProps) {
  return (
    <span className="bubble-text-inline-meta">
      <time>{time}</time>
      {deliveryIndicatorSrc ? (
        <img
          className={
            shouldUseLightDeliveryIndicatorTint(deliveryIndicatorSrc)
              ? 'bubble-text-inline-meta-indicator bubble-text-inline-meta-indicator-light'
              : 'bubble-text-inline-meta-indicator'
          }
          src={deliveryIndicatorSrc}
          alt=""
          aria-hidden="true"
        />
      ) : null}
    </span>
  )
}

export function EmojiOnlyMessageContent({
  deliveryIndicatorSrc,
  emoji,
  time,
}: EmojiOnlyMessageContentProps) {
  return (
    <>
      <span className="emoji-only-message-glyph">{emoji}</span>
      <span className="emoji-only-message-meta">
        <time>{time}</time>
        {deliveryIndicatorSrc ? (
          <img
            className="emoji-only-message-indicator"
            src={deliveryIndicatorSrc}
            alt=""
            aria-hidden="true"
          />
        ) : null}
      </span>
    </>
  )
}

type BubbleRichTextProps = {
  inlineMeta?: ReactNode
  text: string
  onOpenExternalLink?: (url: string) => void
}

function BubbleRichText({
  inlineMeta,
  text,
  onOpenExternalLink,
}: BubbleRichTextProps) {
  const lines = text.split('\n')

  function applyFormatting(
    node: ReactNode,
    style: { bold: boolean, italic: boolean, strike: boolean, underline: boolean },
    key: string,
  ) {
    let result = node

    if (style.bold) {
      result = <strong key={`${key}-bold`}>{result}</strong>
    }

    if (style.italic) {
      result = <em key={`${key}-italic`}>{result}</em>
    }

    if (style.underline) {
      result = (
        <span key={`${key}-underline`} className="bubble-text-format-underline">
          {result}
        </span>
      )
    }

    if (style.strike) {
      result = (
        <span key={`${key}-strike`} className="bubble-text-format-strike">
          {result}
        </span>
      )
    }

    return result
  }

  const content = (
    <>
      {lines.map((line, lineIndex) => (
        <React.Fragment key={`line-${lineIndex}`}>
          {lineIndex > 0 ? <br /> : null}
          {parseMessageTextSegments(line).map((segment, segmentIndex) => {
            const segmentKey = `${segment.kind}-${lineIndex}-${segmentIndex}`
            if (segment.kind === 'text') {
              return applyFormatting(segment.value, segment.style, segmentKey)
            }

            return applyFormatting(
              <span
                key={segmentKey}
                className="bubble-text-link"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onOpenExternalLink?.(segment.href)
                }}
                onMouseDown={(event) => {
                  event.stopPropagation()
                }}
                title={segment.href}
              >
                {segment.value}
              </span>,
              segment.style,
              segmentKey,
            )
          })}
        </React.Fragment>
      ))}
    </>
  )

  if (!inlineMeta) {
    return <p>{content}</p>
  }

  return (
    <p className="bubble-text-paragraph-with-inline-meta">
      <span className="bubble-text-content">{content}</span>
      {inlineMeta}
    </p>
  )
}

export function BubbleMessageContent({
  attachmentLayout = 'default',
  imageOverlay,
  inlineMeta,
  linkedChannel,
  message,
  onOpenAttachment,
  onOpenExternalLink,
  onOpenLinkedChannel,
  onOpenPremiumUpsell,
  onOpenSourceContact,
  onOpenSourceGroup,
  showReplyInline = true,
}: BubbleMessageContentProps) {
  const trimmedText = message.text.trim()
  const isVideoAttachment = Boolean(
    message.attachment && isVideoMimeType(message.attachment.mimeType),
  )
  const isImageAttachment = Boolean(
    message.attachment && isImageMimeType(message.attachment.mimeType),
  )
  const hasVisualAttachment = isImageAttachment || isVideoAttachment
  const shouldRenderContactBodyText =
    Boolean(trimmedText) &&
    Boolean(message.sourceContact) &&
    trimmedText !== message.sourceContact?.handle?.trim()
  const hasBodyBelowAttachment = Boolean(
    linkedChannel || message.sourceContact || message.sourceGroup || trimmedText || message.attachmentRemovedNotice,
  )
  const shouldRenderAttachmentInlineMeta =
    Boolean(inlineMeta) &&
    Boolean(message.attachment) &&
    !hasVisualAttachment &&
    trimmedText.length === 0
  const attachmentStatusCopy = message.attachment
    ? `${formatAttachmentSize(message.attachment.size)}${
        message.attachment.width && message.attachment.height
          ? `, ${formatAttachmentImageDimensions(message.attachment.width, message.attachment.height)}`
          : ''
      }`
    : ''
  const attachmentNode = message.attachment ? (
    hasVisualAttachment ? (
      <div
        className={`bubble-attachment bubble-attachment-photo bubble-attachment-button${
          hasBodyBelowAttachment ? ' has-body-below' : ' image-only'
        }${
          attachmentLayout === 'thread-source-thumbnail'
            ? ' bubble-attachment-photo-thread-source-thumbnail'
            : attachmentLayout === 'thread-source-card'
              ? ' bubble-attachment-photo-thread-source-card'
              : ''
        }`}
        onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
          event.stopPropagation()
          onOpenAttachment?.(message.attachment!)
        }}
      >
        {isVideoAttachment ? (
          <>
            <img
              src={buildVideoPreviewUrl(message.attachment.mediaUrl)}
              className={`bubble-attachment-image bubble-attachment-video-preview${
                attachmentLayout === 'thread-source-thumbnail' ? ' bubble-attachment-image-thread-source-thumbnail' : ''
              }${
                attachmentLayout === 'thread-source-card' ? ' bubble-attachment-image-thread-source-card' : ''
              }`}
              alt=""
            />
            <span className="bubble-attachment-play-button" aria-hidden="true">
              <span className="bubble-attachment-play-icon" />
            </span>
          </>
        ) : (
          <img
            src={message.attachment.mediaUrl}
            alt={message.attachment.fileName}
            className={`bubble-attachment-image${
              attachmentLayout === 'thread-source-thumbnail' ? ' bubble-attachment-image-thread-source-thumbnail' : ''
            }${
              attachmentLayout === 'thread-source-card' ? ' bubble-attachment-image-thread-source-card' : ''
            }`}
          />
        )}
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
          {shouldRenderAttachmentInlineMeta ? (
            <div className="bubble-attachment-copy-row">
              <span className="bubble-attachment-copy-status">{attachmentStatusCopy}</span>
              <span className="bubble-attachment-inline-meta">{inlineMeta}</span>
            </div>
          ) : (
            <span>{attachmentStatusCopy}</span>
          )}
        </div>
      </div>
    )
  ) : null

  return (
    <>
      {showReplyInline && message.replyTo ? (
        <div className="bubble-reply">
          <p>{stripMessageFormattingMarkup(message.replyTo.text)}</p>
        </div>
      ) : null}
      {attachmentNode}
      {linkedChannel ? (
        <ForwardedChannelHeader sourceChannel={linkedChannel} onClick={onOpenLinkedChannel} />
      ) : message.sourceGroup ? (
        <ForwardedGroupHeader sourceGroup={message.sourceGroup} onClick={onOpenSourceGroup} />
      ) : message.sourceContact ? (
        <>
          <ForwardedContactHeader sourceContact={message.sourceContact} onClick={onOpenSourceContact} />
          {shouldRenderContactBodyText ? (
            <BubbleRichText
              inlineMeta={inlineMeta}
              text={message.text}
              onOpenExternalLink={onOpenExternalLink}
            />
          ) : null}
        </>
      ) : trimmedText ? (
        <BubbleRichText
          inlineMeta={inlineMeta}
          text={message.text}
          onOpenExternalLink={onOpenExternalLink}
        />
      ) : null}
      {message.attachmentRemovedNotice ? (
        <AttachmentRemovedNoticeBlock
          notice={message.attachmentRemovedNotice}
          onOpenPremiumUpsell={onOpenPremiumUpsell}
        />
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
  replyTo,
}: ReplyReferenceBlockProps) {
  const className = mine
    ? 'bubble-reply-reference bubble-reply-reference-button mine'
    : 'bubble-reply-reference bubble-reply-reference-button'

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        title={stripMessageFormattingMarkup(replyTo.text)}
      >
        <span className="bubble-reply-reference-copy">{stripMessageFormattingMarkup(replyTo.text)}</span>
      </button>
    )
  }

  return (
    <div
      className={mine ? 'bubble-reply-reference mine' : 'bubble-reply-reference'}
      title={stripMessageFormattingMarkup(replyTo.text)}
    >
      <span className="bubble-reply-reference-copy">{stripMessageFormattingMarkup(replyTo.text)}</span>
    </div>
  )
}
