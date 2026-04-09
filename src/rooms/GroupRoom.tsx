import type { ChangeEvent, ClipboardEvent, FormEvent, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react'
import { Fragment, useEffect, useRef } from 'react'
import type { ComposerAttachmentDraft } from '../app/composerAttachments'
import type {
  ChannelMessageSource,
  GroupParticipant,
  GroupPreview,
  Message,
  ReplyTarget,
  UserGifLibraryItem,
} from '../app/types'
import {
  formatChannelAvatarLabel,
  formatConversationDayLabel,
  getConversationDayKey,
  insertComposerTextAtCursor,
  isImageMimeType,
  isVideoMimeType,
  scrollFeedChildIntoView,
  shouldShowDeliveryCaption,
  shouldSubmitComposerWithEnter,
} from '../app/utils'
import {
  BubbleMessageContent,
  BubbleImageOverlayMeta,
  ForwardedChannelHeader,
  shouldUseLightDeliveryIndicatorTint,
} from '../components/BubbleMessageContent'
import { AttachedReplyBubble } from '../components/AttachedReplyBubble'
import { ComposerAttachmentPreview } from '../components/ComposerAttachmentPreview'
import { ComposerAttachmentPicker } from '../components/ComposerAttachmentPicker'
import { ConversationDayDivider } from '../components/ConversationDayDivider'
import { EmojiPicker } from '../components/EmojiPicker'
import { MediaOnlyBubbleRow } from '../components/MediaOnlyBubbleRow'
import { ThreadedBubble } from '../components/ThreadedBubble'

function renderGroupSystemMessageContent(message: Message) {
  const event = message.groupSystemEvent
  if (!event) {
    return <span className="group-system-message-label">{message.text}</span>
  }

  if (event.kind === 'member-joined') {
    return (
      <span className="group-system-message-copy">
        <span>К группе присоединился </span>
        <span className="group-system-message-actor">
          <span>{event.actor.title}</span>
          {event.actor.premium ? (
            <span className="premium-crown group-system-message-crown" aria-label="Премиум">
              <img src="/icons/crown64.png" alt="" />
            </span>
          ) : null}
        </span>
      </span>
    )
  }

  if (event.kind === 'member-left') {
    return (
      <span className="group-system-message-copy">
        <span className="group-system-message-actor">
          <span>{event.actor.title}</span>
          {event.actor.premium ? (
            <span className="premium-crown group-system-message-crown" aria-label="Премиум">
              <img src="/icons/crown64.png" alt="" />
            </span>
          ) : null}
        </span>
        <span> покинул группу</span>
      </span>
    )
  }

  return (
    <span className="group-system-message-copy">
      <span>У группы новый организатор: </span>
      <span className="group-system-message-actor">
        <span>{event.actor.title}</span>
        {event.actor.premium ? (
          <span className="premium-crown group-system-message-crown" aria-label="Премиум">
            <img src="/icons/crown64.png" alt="" />
          </span>
        ) : null}
      </span>
    </span>
  )
}

type GroupRoomProps = {
  actions: ReactNode
  activeMessageId: number | null
  attachmentDraft?: ComposerAttachmentDraft
  attachmentInputRef: RefObject<HTMLInputElement | null>
  attachmentName: string
  draft: string
  getMessageDeliveryIssue: (messageId: number) => 'pending' | 'failed' | null
  group: GroupPreview
  messageFeedRef: RefObject<HTMLDivElement | null>
  visibleMessages: Message[]
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  onComposerPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void | Promise<void>
  onAttachmentClear: () => void
  onAttachmentPreviewOpen?: () => void
  onRenameAttachmentFileBaseName?: (nextBaseName: string) => void
  onOpenGroupActions: (event: MouseEvent<HTMLButtonElement>) => void
  onBack: () => void
  onComposerFocus: () => void
  onDraftChange: (value: string) => void
  onMessageSelect: (anchorElement: HTMLElement, message: Message) => void
  onOpenAttachment: (attachment: NonNullable<Message['attachment']>) => void
  onOpenExternalLink?: (url: string) => void
  onOpenThread: (messageId: number) => void
  onOpenLinkedChannel: (sourceChannel: ChannelMessageSource) => void
  onOpenSourceContact: (sourceContact: NonNullable<Message['sourceContact']>) => void
  onOpenParticipants: () => void
  onOpenSourceChannel: (message: Message) => void
  onOpenAttachmentPicker: (mode: 'file' | 'photo') => void
  onOpenPremiumUpsell?: () => void
  onReplyCancel: () => void
  onDeleteGif?: (gif: UserGifLibraryItem) => Promise<void>
  onSearchGifs?: (query: string) => Promise<UserGifLibraryItem[]>
  onSelectGif?: (gif: UserGifLibraryItem) => void
  showOwnerEditIcon?: boolean
  onUploadGif?: (file: File) => Promise<void>
  onReplyReferenceJump?: (messageId: number) => void
  onToggleSendOriginal?: () => void
  premiumUnlocked?: boolean
  gifLibrary?: UserGifLibraryItem[]
  gifSelectionBlockedReason?: string | null
  replyTarget: ReplyTarget | null
  resolveLinkedChannelFromMessage: (message: Message) => ChannelMessageSource | null
  composerDisabledNotice?: string | null
  onSubmit: () => void | Promise<void>
  storageCleanupWarning?: ReactNode
}

export function GroupRoom({
  actions,
  activeMessageId,
  attachmentDraft,
  attachmentInputRef,
  attachmentName,
  draft,
  getMessageDeliveryIssue,
  group,
  messageFeedRef,
  visibleMessages,
  onAttachmentChange,
  onComposerPaste,
  onAttachmentClear,
  onAttachmentPreviewOpen,
  onRenameAttachmentFileBaseName,
  onOpenGroupActions,
  onBack,
  onComposerFocus,
  onDraftChange,
  onMessageSelect,
  onOpenAttachment,
  onOpenExternalLink,
  onOpenThread,
  onOpenLinkedChannel,
  onOpenSourceContact,
  onOpenParticipants,
  onOpenSourceChannel,
  onOpenAttachmentPicker,
  onOpenPremiumUpsell,
  onReplyCancel,
  onDeleteGif,
  onSearchGifs,
  onSelectGif,
  showOwnerEditIcon,
  onUploadGif,
  onReplyReferenceJump,
  onToggleSendOriginal,
  gifLibrary = [],
  gifSelectionBlockedReason = null,
  premiumUnlocked = false,
  replyTarget,
  resolveLinkedChannelFromMessage,
  composerDisabledNotice,
  onSubmit,
  storageCleanupWarning = null,
}: GroupRoomProps) {
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null)
  const hasComposerPayload = draft.trim().length > 0 || Boolean(attachmentDraft)
  const canSubmitComposer = attachmentDraft ? attachmentDraft.status === 'ready' : draft.trim().length > 0
  const composerPlaceholder = attachmentDraft
    ? isImageMimeType(attachmentDraft.mimeType)
      ? 'Добавьте подпись к фотографии...'
      : isVideoMimeType(attachmentDraft.mimeType)
        ? 'Добавьте подпись к видео...'
        : 'Добавьте подпись к файлу...'
    : 'Напиши сообщение в группу...'

  async function submitComposer() {
    await Promise.resolve(onSubmit())
    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus()
    })
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!canSubmitComposer) return
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
    void submitComposer()
  }

  function resolveGroupParticipant(message: Message): GroupParticipant | null {
    if (message.author === 'me') return null

    if (message.groupParticipantId !== undefined) {
      const matchedParticipant = group.participants.find(
        (participant) => participant.id === message.groupParticipantId,
      )
      if (matchedParticipant) return matchedParticipant
    }

    if (!message.displayAuthor) return null
    return (
      group.participants.find((participant) => participant.title === message.displayAuthor) ?? null
    )
  }

  function renderGroupMediaAuthor(message: Message, participant: GroupParticipant | null) {
    if (message.author === 'me') {
      return null
    }

    if (participant) {
      return (
        <div className="bubble-sender">
          <span className="bubble-sender-avatar-stack">
            <span className="avatar bubble-sender-avatar" style={{ backgroundColor: participant.accent }}>
              {participant.title.slice(0, 1)}
            </span>
            {participant.online ? (
              <span className="bubble-sender-presence-dot" aria-label="В сети" />
            ) : null}
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

    return <span className="bubble-meta">{message.displayAuthor ?? 'Участник группы'}</span>
  }

  useEffect(() => {
    if (!replyTarget) return

    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus()
    })
  }, [replyTarget])

  useEffect(() => {
    if (composerDisabledNotice) return

    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus()
    })
  }, [composerDisabledNotice, group.id])

  function jumpToMessage(messageId: number) {
    if (onReplyReferenceJump) {
      onReplyReferenceJump(messageId)
      return
    }

    void window.requestAnimationFrame(() => {
      scrollFeedChildIntoView(messageFeedRef.current, `[data-group-message-id="${messageId}"]`)
    })
  }

  return (
    <>
      <section className="chat-room">
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
            <span className="avatar large" style={{ backgroundColor: group.accent }}>
              {group.avatarImage ? (
                <img src={group.avatarImage} alt="" className="channel-avatar-image" />
              ) : (
                formatChannelAvatarLabel(group.title)
              )}
            </span>
            <div>
                <div className="room-title">
                <div className="room-title-name">
                  <h3>{group.title}</h3>
                  <span className="chat-star">
                    <img src="/icons/group100.png" alt="Группа" />
                  </span>
                  {showOwnerEditIcon ? (
                    <span className="room-owner-edit-badge" aria-label="Вы владелец группы" title="Вы владелец группы">
                      <img src="/icons/edit100.png" alt="" aria-hidden="true" />
                    </span>
                  ) : null}
                  {group.archivedAt ? <span className="room-archive-badge">Архив</span> : null}
                  {group.muted ? (
                    <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                        <img src="/icons/bell-100.png" alt="" />
                      </span>
                    ) : null}
                  </div>
                </div>
              <button
                type="button"
                className="room-members-link"
                onClick={onOpenParticipants}
              >
                {`${group.members} участников`}
              </button>
              {group.archivedAt ? (
                <p className="room-archive-note">Группа находится в архиве и доступна только для чтения.</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="soft-button icon-button room-group-actions-toggle"
            onClick={onOpenGroupActions}
            aria-label="Действия группы"
            title="Действия группы"
          >
            <img src="/icons/menu.png" alt="" aria-hidden="true" className="room-menu-icon" />
          </button>
        </header>

        <div className="message-feed group-room-feed" ref={messageFeedRef}>
          {visibleMessages.map((message, index) => {
            const previousMessage = index > 0 ? visibleMessages[index - 1] : null
            const messageDayKey = getConversationDayKey(message.createdAt)
            const previousMessageDayKey = previousMessage ? getConversationDayKey(previousMessage.createdAt) : null
            const groupParticipant = resolveGroupParticipant(message)
          const linkedChannel = message.sourceChannel ? null : resolveLinkedChannelFromMessage(message)
          const messageDeliveryIssue =
            message.author === 'me' ? getMessageDeliveryIssue(message.id) : null
          const hasImageAttachment = Boolean(
            message.attachment &&
            (isImageMimeType(message.attachment.mimeType) || isVideoMimeType(message.attachment.mimeType)),
          )
          const messagePending = messageDeliveryIssue === 'pending'
          const messageFailed = messageDeliveryIssue === 'failed'
          const showDeliveryCaption = messageDeliveryIssue !== null && shouldShowDeliveryCaption(message)
            const showDeliveryIndicator = message.author === 'me'
            const isImageOnlyBubble =
              hasImageAttachment &&
              !linkedChannel &&
              !message.sourceChannel &&
              message.text.trim().length === 0
            const isGroupCaptionedImageBubble =
              hasImageAttachment &&
              message.text.trim().length > 0 &&
              !linkedChannel &&
              !message.sourceChannel &&
              !message.sourceContact &&
              !message.sourceGroup
            const groupMediaAuthor = renderGroupMediaAuthor(message, groupParticipant)
            const hasGroupCaptionedMediaHeader = isGroupCaptionedImageBubble && Boolean(groupMediaAuthor)
            const shouldRenderExternalGroupAuthor =
              Boolean(groupMediaAuthor) && !isImageOnlyBubble && !isGroupCaptionedImageBubble
            const bubbleClassNames = ['bubble', 'bubble-button']

            if (message.author === 'me') {
              bubbleClassNames.push('mine')
            }

            if (activeMessageId === message.id) {
              bubbleClassNames.push('selected')
            }

            if (showDeliveryIndicator) {
              bubbleClassNames.push('has-delivery-indicator')
            }

            if (messageDeliveryIssue) {
              bubbleClassNames.push('has-delivery-issue')
            }

            if (showDeliveryCaption) {
              bubbleClassNames.push('has-delivery-caption')
            }

            if (messageFailed) {
              bubbleClassNames.push('delivery-failed')
            }

            if (message.replyTo) {
              bubbleClassNames.push('has-attached-reply')
            }

            if (isImageOnlyBubble) {
              bubbleClassNames.push('media-only-bubble')
            }

            if (isGroupCaptionedImageBubble) {
              bubbleClassNames.push('group-captioned-media-bubble')
            }

            if (hasGroupCaptionedMediaHeader) {
              bubbleClassNames.push('group-captioned-media-bubble-with-header')
            }

            const replyReference = message.replyTo

          return (
              <Fragment key={message.id}>
                {index === 0 || previousMessageDayKey !== messageDayKey ? (
                  <ConversationDayDivider label={formatConversationDayLabel(message.createdAt)} />
                ) : null}
                {message.system ? (
                  <div className="group-system-message" data-group-message-id={message.id}>
                    {renderGroupSystemMessageContent(message)}
                    <time>{message.time}</time>
                  </div>
                ) : (
                  <ThreadedBubble
                    isMine={message.author === 'me'}
                    threadCount={message.threadComments?.length ?? 0}
                    onOpenThread={() => onOpenThread(message.id)}
                    bubble={
                    <AttachedReplyBubble
                      mine={message.author === 'me'}
                      onReplyClick={
                        replyReference && Number.isInteger(replyReference.id) && replyReference.id > 0
                          ? () => jumpToMessage(replyReference.id)
                          : undefined
                      }
                      replyTo={replyReference}
                      bubble={
                        isImageOnlyBubble ? (
                          <MediaOnlyBubbleRow
                            actionLabel="Открыть действия сообщения"
                            bubbleAttributes={{ 'data-group-message-id': message.id }}
                            bubbleClassName={bubbleClassNames.join(' ')}
                            mine={message.author === 'me'}
                            onOpenActions={(anchorElement) => onMessageSelect(anchorElement, message)}
                          >
                            {groupMediaAuthor ? (
                              <button
                                type="button"
                                className="bubble-media-header bubble-media-header-button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onMessageSelect(event.currentTarget, message)
                                }}
                              >
                                {groupMediaAuthor}
                              </button>
                            ) : null}
                            <BubbleMessageContent
                              imageOverlay={
                                hasImageAttachment ? (
                                  <BubbleImageOverlayMeta
                                    deliveryIndicatorSrc={
                                      showDeliveryIndicator
                                        ? messageFailed
                                          ? '/icons/warning-48.png'
                                          : messagePending
                                            ? '/icons/hourglass-48.png'
                                            : '/icons/double-tick-50.png'
                                        : null
                                    }
                                    time={message.time}
                                  />
                                ) : undefined
                              }
                              linkedChannel={linkedChannel}
                              message={message}
                              onOpenAttachment={onOpenAttachment}
                              onOpenExternalLink={onOpenExternalLink}
                              onOpenLinkedChannel={
                                linkedChannel ? () => onOpenLinkedChannel(linkedChannel) : undefined
                              }
                              onOpenPremiumUpsell={onOpenPremiumUpsell}
                              onOpenSourceContact={
                                message.sourceContact
                                  ? () =>
                                      onOpenSourceContact(
                                        message.sourceContact as NonNullable<Message['sourceContact']>,
                                      )
                                  : undefined
                              }
                              showReplyInline={false}
                            />
                          </MediaOnlyBubbleRow>
                        ) : (
                          (() => {
                            const messageBubbleButton = (
                              <button
                                type="button"
                                data-bubble-measure={shouldRenderExternalGroupAuthor ? 'true' : undefined}
                                data-group-message-id={message.id}
                                className={bubbleClassNames.join(' ')}
                                onClick={(event) => onMessageSelect(event.currentTarget, message)}
                              >
                                {isGroupCaptionedImageBubble && groupMediaAuthor ? (
                                  <div className="bubble-media-header bubble-media-header-captioned">
                                    {groupMediaAuthor}
                                  </div>
                                ) : null}
                                {message.sourceChannel ? (
                                  <>
                                    <ForwardedChannelHeader
                                      sourceChannel={message.sourceChannel}
                                      onClick={() => onOpenSourceChannel(message)}
                                    />
                                    {!message.sourceChannel.leadText ? (
                                      <span className="bubble-meta">Переслано</span>
                                    ) : null}
                                  </>
                                ) : null}
                                <BubbleMessageContent
                                  imageOverlay={
                                    hasImageAttachment ? (
                                      <BubbleImageOverlayMeta
                                        deliveryIndicatorSrc={
                                          showDeliveryIndicator
                                            ? messageFailed
                                              ? '/icons/warning-48.png'
                                              : messagePending
                                                ? '/icons/hourglass-48.png'
                                                : '/icons/double-tick-50.png'
                                            : null
                                        }
                                        time={message.time}
                                      />
                                    ) : undefined
                                  }
                                  linkedChannel={linkedChannel}
                                  message={message}
                                  onOpenAttachment={onOpenAttachment}
                                  onOpenExternalLink={onOpenExternalLink}
                                  onOpenLinkedChannel={
                                    linkedChannel ? () => onOpenLinkedChannel(linkedChannel) : undefined
                                  }
                                  onOpenPremiumUpsell={onOpenPremiumUpsell}
                                  onOpenSourceContact={
                                    message.sourceContact
                                      ? () =>
                                          onOpenSourceContact(
                                            message.sourceContact as NonNullable<Message['sourceContact']>,
                                          )
                                      : undefined
                                  }
                                  showReplyInline={false}
                                />
                                {!hasImageAttachment ? <time>{message.time}</time> : null}
                                {!hasImageAttachment && showDeliveryCaption ? (
                                  <span className="bubble-delivery-caption">Сообщение не отправлено</span>
                                ) : null}
                                {!hasImageAttachment && showDeliveryIndicator ? (
                                  (() => {
                                    const deliveryIndicatorSrc = messageFailed
                                      ? '/icons/warning-48.png'
                                      : messagePending
                                        ? '/icons/hourglass-48.png'
                                        : '/icons/double-tick-50.png'

                                    return (
                                      <img
                                        className={
                                          shouldUseLightDeliveryIndicatorTint(deliveryIndicatorSrc)
                                            ? 'bubble-delivery-indicator bubble-delivery-indicator-light'
                                            : 'bubble-delivery-indicator'
                                        }
                                        src={deliveryIndicatorSrc}
                                        alt=""
                                        aria-hidden="true"
                                      />
                                    )
                                  })()
                                ) : null}
                              </button>
                            )

                            return shouldRenderExternalGroupAuthor ? (
                              <div className="bubble-author-layout">
                                <div className="bubble-author-strip">{groupMediaAuthor}</div>
                                {messageBubbleButton}
                              </div>
                            ) : (
                              messageBubbleButton
                            )
                          })()
                        )
                      }
                    />
                    }
                  />
                )}
              </Fragment>
            )
          })}
        </div>

        {composerDisabledNotice ? (
          <div className="composer composer-disabled">
            <p className="composer-disabled-note">{composerDisabledNotice}</p>
          </div>
        ) : (
          <form
            className="composer"
            onSubmit={async (event: FormEvent<HTMLFormElement>) => {
              event.preventDefault()
              await submitComposer()
            }}
          >
            <div className="composer-input">
              {replyTarget ? (
                <div className="composer-reply">
                  <div>
                    <span className="settings-label">Ответ</span>
                    <p>{replyTarget.text}</p>
                  </div>
                  <button
                    type="button"
                    className="soft-button composer-reply-cancel"
                    onClick={onReplyCancel}
                    aria-label="Отменить ответ"
                    title="Отменить ответ"
                  >
                    <img src="/icons/cancel.png" alt="" aria-hidden="true" className="composer-reply-cancel-icon" />
                  </button>
                </div>
              ) : null}
              <div className="composer-entry">
                <div className="composer-field">
                  {attachmentDraft ? (
                    <ComposerAttachmentPreview
                      attachmentDraft={attachmentDraft}
                      onClear={onAttachmentClear}
                      onOpenPreview={onAttachmentPreviewOpen}
                      onRenameFileBaseName={onRenameAttachmentFileBaseName}
                      onOpenPremiumUpsell={onOpenPremiumUpsell}
                      onToggleSendOriginal={onToggleSendOriginal}
                      premiumUnlocked={premiumUnlocked}
                      storageCleanupWarning={storageCleanupWarning}
                    />
                  ) : null}
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    className="composer-attachment-input"
                    onChange={onAttachmentChange}
                  />
                  <textarea
                    ref={draftInputRef}
                    placeholder={composerPlaceholder}
                    rows={1}
                    value={draft}
                    onFocus={onComposerFocus}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onPaste={onComposerPaste}
                    onKeyDown={handleComposerKeyDown}
                  />
                  <div className="composer-tools">
                    <EmojiPicker
                      canSelectGif={!gifSelectionBlockedReason}
                      gifLibrary={gifLibrary}
                      gifSelectionBlockedReason={gifSelectionBlockedReason}
                      onDeleteGif={onDeleteGif}
                      onOpenPremiumUpsell={onOpenPremiumUpsell}
                      onSearchGifs={onSearchGifs}
                      onSelect={(emoji) =>
                        insertComposerTextAtCursor(draftInputRef.current, draft, emoji, onDraftChange)
                      }
                      onSelectGif={onSelectGif}
                      onUploadGif={onUploadGif}
                      premiumUnlocked={premiumUnlocked}
                    />
                    <ComposerAttachmentPicker
                      attachmentName={attachmentName}
                      onSelectMode={onOpenAttachmentPicker}
                      premiumUnlocked={premiumUnlocked}
                    />
                    {hasComposerPayload ? (
                      <button
                        type="submit"
                        className="send-button composer-send"
                        disabled={!canSubmitComposer}
                        aria-label="Отправить"
                        title="Отправить"
                      >
                        <span className="composer-send-icon" aria-hidden="true">
                          <img src="/icons/sent.png" alt="" />
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </section>
      {actions}
    </>
  )
}
