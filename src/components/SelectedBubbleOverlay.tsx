import type { ActionAnchor, ChannelPost, GroupParticipant, Message, ThreadComment } from '../app/types'
import {
  isImageMimeType,
  isStandaloneEmojiMessageText,
  isVideoMimeType,
  shouldShowDeliveryCaption,
  stripMessageFormattingMarkup,
} from '../app/utils'
import {
  BubbleImageOverlayMeta,
  BubbleMessageContent,
  BubbleTextInlineMeta,
  EmojiOnlyMessageContent,
  ForwardedChannelHeader,
  shouldUseLightDeliveryIndicatorTint,
} from './BubbleMessageContent'

type SelectedBubbleOverlayProps =
  | {
      anchor: ActionAnchor
      onOpenAttachment?: (attachment: NonNullable<Message['attachment']>) => void
      onOpenExternalLink?: (url: string) => void
      onOpenPremiumUpsell?: () => void
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
      onOpenAttachment?: (attachment: NonNullable<Message['attachment']>) => void
      onOpenExternalLink?: (url: string) => void
      onOpenPremiumUpsell?: () => void
      participant?: GroupParticipant | null
    }
  | {
      anchor: ActionAnchor
      kind: 'channel'
      channelTitle: string
      onOpenAttachment?: (attachment: NonNullable<Message['attachment']>) => void
      onOpenExternalLink?: (url: string) => void
      onOpenPremiumUpsell?: () => void
      post: ChannelPost
      draft: boolean
    }
  | {
      anchor: ActionAnchor
      kind: 'thread-comment'
      comment: ThreadComment
      mine: boolean
      onOpenAttachment?: (attachment: NonNullable<Message['attachment']>) => void
      onOpenExternalLink?: (url: string) => void
      onOpenPremiumUpsell?: () => void
      participant?: GroupParticipant | null
    }

function getOverlayPosition(anchor: ActionAnchor) {
  const viewportInset = 16
  const safeBottom = (() => {
    const composerSelectors = ['.composer', '.composer-disabled', '.settings-support-composer', '.channel-room-footer']
    const candidateTops = composerSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.height > 0 && rect.width > 0 && rect.top < window.innerHeight && rect.bottom > 0)
        .map((rect) => Math.max(viewportInset, rect.top - 8)),
    )

    return candidateTops.length > 0
      ? Math.min(window.innerHeight - viewportInset, ...candidateTops)
      : window.innerHeight - viewportInset
  })()
  const overlayHeight = Math.max(0, anchor.bottom - anchor.top)
  const maxHeight = Math.max(0, safeBottom - viewportInset)
  const boundedHeight = Math.min(overlayHeight, maxHeight)
  const top = Math.min(
    Math.max(viewportInset, anchor.top),
    Math.max(viewportInset, safeBottom - boundedHeight),
  )

  return {
    left: `${anchor.left}px`,
    maxHeight: `${maxHeight}px`,
    top: `${top}px`,
    width: `${anchor.width}px`,
  }
}

function resolveDirectDeliveryIndicatorSrc(
  deliveryIssue: 'pending' | 'failed' | undefined,
  readAt: string | undefined,
) {
  if (deliveryIssue === 'failed') {
    return '/icons/warning-48.png'
  }

  if (deliveryIssue === 'pending') {
    return '/icons/hourglass-48.png'
  }

  return readAt ? '/icons/double-tick-50.png' : '/icons/check-mark-50.png'
}

function renderGroupOverlayAuthor(
  mine: boolean,
  displayAuthor: string | undefined,
  participant?: GroupParticipant | null,
) {
  if (mine) {
    return null
  }

  if (participant) {
    return (
      <div className="bubble-sender">
        <span className="bubble-sender-avatar-stack">
          <span className="avatar bubble-sender-avatar" style={{ backgroundColor: participant.accent }}>
            {participant.title.slice(0, 1)}
          </span>
          {participant.online ? <span className="bubble-sender-presence-dot" aria-label="В сети" /> : null}
        </span>
        <span className="bubble-sender-name">{participant.title}</span>
        {participant.premium ? (
          <span className="premium-crown bubble-sender-crown" aria-label="Премиум">
            <img src="/icons/crown64.png" alt="" />
          </span>
        ) : null}
      </div>
    )
  }

  return <span className="bubble-meta">{displayAuthor ?? 'Участник группы'}</span>
}

export function SelectedBubbleOverlay(props: SelectedBubbleOverlayProps) {
  if (props.kind === 'channel') {
    const hasImageAttachment = Boolean(
      props.post.attachment &&
      (isImageMimeType(props.post.attachment.mimeType) || isVideoMimeType(props.post.attachment.mimeType)),
    )
    const isImageOnlyBubble = hasImageAttachment && props.post.text.trim().length === 0
    const shouldUseInlineTextMeta = !hasImageAttachment && props.post.text.trim().length > 0

    return (
      <div
        className={`bubble bubble-overlay bubble-button selected channel-post${isImageOnlyBubble ? ' media-only-bubble' : ''}`}
        style={getOverlayPosition(props.anchor)}
        aria-hidden="true"
      >
        <BubbleMessageContent
          imageOverlay={hasImageAttachment ? <BubbleImageOverlayMeta time={props.post.time} /> : undefined}
          inlineMeta={
            shouldUseInlineTextMeta ? <BubbleTextInlineMeta time={props.post.time} /> : undefined
          }
          message={{
            attachment: props.post.attachment,
            replyTo: undefined,
            sourceContact: props.post.sourceContact,
            text: props.post.text,
          }}
          onOpenAttachment={props.onOpenAttachment}
          onOpenExternalLink={props.onOpenExternalLink}
          onOpenPremiumUpsell={props.onOpenPremiumUpsell}
          showReplyInline={false}
        />
        {!hasImageAttachment && !shouldUseInlineTextMeta ? <time>{props.post.time}</time> : null}
      </div>
    )
  }

  if (props.kind === 'thread-comment') {
    const hasImageAttachment = Boolean(
      props.comment.attachment &&
      (isImageMimeType(props.comment.attachment.mimeType) || isVideoMimeType(props.comment.attachment.mimeType)),
    )
    const isImageOnlyBubble = hasImageAttachment && props.comment.text.trim().length === 0
    const shouldUseInlineTextMeta = !hasImageAttachment && props.comment.text.trim().length > 0
    const authorNode = renderGroupOverlayAuthor(props.mine, props.comment.displayAuthor, props.participant)
    const shouldRenderExternalAuthor = Boolean(authorNode) && !isImageOnlyBubble
    const compactOverlayClassName = ' bubble-overlay-compact'
    const bubbleNode = (
      <div
        className={`bubble bubble-overlay bubble-button selected${compactOverlayClassName}${props.mine ? ' mine' : ''}${isImageOnlyBubble ? ' media-only-bubble' : ''}`}
        style={shouldRenderExternalAuthor ? undefined : getOverlayPosition(props.anchor)}
        aria-hidden="true"
      >
        {isImageOnlyBubble ? (
          authorNode ? <div className="bubble-media-header">{authorNode}</div> : null
        ) : null}
        <BubbleMessageContent
          imageOverlay={
            hasImageAttachment ? (
              <BubbleImageOverlayMeta time={props.comment.time} />
            ) : undefined
          }
          inlineMeta={
            shouldUseInlineTextMeta ? <BubbleTextInlineMeta time={props.comment.time} /> : undefined
          }
          message={{
            attachment: props.comment.attachment,
            replyTo: props.comment.replyTo,
            sourceContact: props.comment.sourceContact,
            sourceGroup: undefined,
            text: props.comment.text,
          }}
          onOpenAttachment={props.onOpenAttachment}
          onOpenExternalLink={props.onOpenExternalLink}
          onOpenPremiumUpsell={props.onOpenPremiumUpsell}
          showReplyInline={false}
        />
        {!hasImageAttachment && !shouldUseInlineTextMeta ? <time>{props.comment.time}</time> : null}
      </div>
    )

    return shouldRenderExternalAuthor ? (
      <div
        className="bubble-author-layout bubble-overlay-author-layout"
        style={getOverlayPosition(props.anchor)}
        aria-hidden="true"
      >
        <div className="bubble-author-strip">{authorNode}</div>
        {bubbleNode}
      </div>
    ) : (
      bubbleNode
    )
  }

  const bubbleClassNames = ['bubble', 'bubble-overlay', 'bubble-button', 'selected']
  const hasDeliveryIssue = Boolean(props.deliveryIssue)
  const hasImageAttachment = Boolean(
    props.message.attachment &&
    (isImageMimeType(props.message.attachment.mimeType) || isVideoMimeType(props.message.attachment.mimeType)),
  )
  const isImageOnlyBubble =
    hasImageAttachment &&
    !props.linkedChannel &&
    !props.message.sourceChannel &&
    !props.message.sourceContact &&
    !props.message.sourceGroup &&
    props.message.text.trim().length === 0
  const isGroupCaptionedImageBubble =
    props.kind === 'group' &&
    hasImageAttachment &&
    props.message.text.trim().length > 0 &&
    !props.linkedChannel &&
    !props.message.sourceChannel &&
    !props.message.sourceContact &&
    !props.message.sourceGroup
  const isStandaloneEmojiOnlyMessage =
    (props.kind === 'direct' || props.kind === 'group') &&
    !hasImageAttachment &&
    !props.linkedChannel &&
    !props.message.sourceChannel &&
    !props.message.sourceContact &&
    !props.message.sourceGroup &&
    !props.message.forwarded &&
    !props.message.attachmentRemovedNotice &&
    (props.kind !== 'group' || (props.message.threadComments?.length ?? 0) === 0) &&
    isStandaloneEmojiMessageText(props.message.text)
  const standaloneEmojiGlyph = isStandaloneEmojiOnlyMessage
    ? stripMessageFormattingMarkup(props.message.text).trim()
    : ''
  const groupOverlayAuthorNode =
    props.kind === 'group'
      ? renderGroupOverlayAuthor(props.message.author === 'me', props.message.displayAuthor, props.participant)
      : null
  const hasGroupCaptionedMediaHeader = isGroupCaptionedImageBubble && Boolean(groupOverlayAuthorNode)
  const shouldRenderExternalGroupAuthor =
    props.kind === 'group' &&
    props.message.author !== 'me' &&
    !hasImageAttachment &&
    !isGroupCaptionedImageBubble
  const showDeliveryCaption = hasDeliveryIssue && shouldShowDeliveryCaption(props.message)
  const shouldUseInlineTextMeta =
    !hasImageAttachment &&
    !isStandaloneEmojiOnlyMessage &&
    !showDeliveryCaption &&
    props.message.text.trim().length > 0

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

  if (isImageOnlyBubble) {
    bubbleClassNames.push('media-only-bubble')
  }

  if (isStandaloneEmojiOnlyMessage) {
    bubbleClassNames.push('emoji-only-message')
  }

  if (isGroupCaptionedImageBubble) {
    bubbleClassNames.push('group-captioned-media-bubble')
  }

  if (hasGroupCaptionedMediaHeader) {
    bubbleClassNames.push('group-captioned-media-bubble-with-header')
  }

  if (props.kind === 'group') {
    bubbleClassNames.push('bubble-overlay-compact')
  }

  const bubbleNode = (
    <div
      className={bubbleClassNames.join(' ')}
      style={shouldRenderExternalGroupAuthor ? undefined : getOverlayPosition(props.anchor)}
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
        isImageOnlyBubble ? (
          groupOverlayAuthorNode ? <div className="bubble-media-header">{groupOverlayAuthorNode}</div> : null
        ) : isGroupCaptionedImageBubble ? (
          groupOverlayAuthorNode ? (
            <div className="bubble-media-header bubble-media-header-captioned">{groupOverlayAuthorNode}</div>
          ) : null
        ) : null
      )}
      {props.message.sourceChannel ? (
        <>
          <ForwardedChannelHeader sourceChannel={props.message.sourceChannel} />
          {!props.message.sourceChannel.leadText ? (
            <span className="bubble-meta">Переслано</span>
          ) : null}
        </>
      ) : null}
      {isStandaloneEmojiOnlyMessage ? (
        <EmojiOnlyMessageContent
          deliveryIndicatorSrc={
            props.mine
              ? resolveDirectDeliveryIndicatorSrc(
                  props.deliveryIssue,
                  props.kind === 'direct' ? props.message.readAt : undefined,
                )
              : null
          }
          emoji={standaloneEmojiGlyph}
          time={props.message.time}
        />
      ) : (
        <>
          <BubbleMessageContent
            imageOverlay={
              hasImageAttachment ? (
                <BubbleImageOverlayMeta
                  deliveryIndicatorSrc={
                    props.mine
                      ? resolveDirectDeliveryIndicatorSrc(
                          props.deliveryIssue,
                          props.kind === 'direct' ? props.message.readAt : undefined,
                        )
                      : null
                  }
                  time={props.message.time}
                />
              ) : undefined
            }
            inlineMeta={
              shouldUseInlineTextMeta ? (
                <BubbleTextInlineMeta
                  deliveryIndicatorSrc={
                    props.mine
                      ? resolveDirectDeliveryIndicatorSrc(
                          props.deliveryIssue,
                          props.kind === 'direct' ? props.message.readAt : undefined,
                        )
                      : null
                  }
                  time={props.message.time}
                />
              ) : undefined
            }
            linkedChannel={props.linkedChannel}
            message={props.message}
            onOpenAttachment={props.onOpenAttachment}
            onOpenExternalLink={props.onOpenExternalLink}
            onOpenPremiumUpsell={props.onOpenPremiumUpsell}
            onOpenSourceGroup={undefined}
            replyChatTitle={props.kind === 'direct' ? props.replyChatTitle : undefined}
            showReplyInline={false}
          />
          {!hasImageAttachment && !shouldUseInlineTextMeta ? <time>{props.message.time}</time> : null}
          {!hasImageAttachment && showDeliveryCaption ? (
            <span className="bubble-delivery-caption">Сообщение не отправлено</span>
          ) : null}
          {!hasImageAttachment && !shouldUseInlineTextMeta && props.mine ? (
            <img
              className={
                shouldUseLightDeliveryIndicatorTint(
                  resolveDirectDeliveryIndicatorSrc(
                    props.deliveryIssue,
                    props.kind === 'direct' ? props.message.readAt : undefined,
                  ),
                )
                  ? 'bubble-delivery-indicator bubble-delivery-indicator-light'
                  : 'bubble-delivery-indicator'
              }
              src={resolveDirectDeliveryIndicatorSrc(
                props.deliveryIssue,
                props.kind === 'direct' ? props.message.readAt : undefined,
              )}
              alt=""
              aria-hidden="true"
            />
          ) : null}
        </>
      )}
    </div>
  )

  return shouldRenderExternalGroupAuthor ? (
    <div
      className="bubble-author-layout bubble-overlay-author-layout"
      style={getOverlayPosition(props.anchor)}
      aria-hidden="true"
    >
      <div className="bubble-author-strip">
        {renderGroupOverlayAuthor(false, props.message.displayAuthor, props.participant)}
      </div>
      {bubbleNode}
    </div>
  ) : (
    bubbleNode
  )
}
