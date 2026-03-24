import type { ChangeEvent, FormEvent, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react'
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import type { ComposerAttachmentDraft } from '../app/composerAttachments'
import type { ChannelMessageSource, GroupParticipant, GroupPreview, Message, ReplyTarget } from '../app/types'
import {
  formatChannelAvatarLabel,
  formatConversationDayLabel,
  getConversationDayKey,
  insertComposerTextAtCursor,
  isImageMimeType,
  scrollFeedChildIntoView,
  shouldShowDeliveryCaption,
  shouldSubmitComposerWithEnter,
} from '../app/utils'
import {
  BubbleMessageContent,
  ForwardedChannelHeader,
} from '../components/BubbleMessageContent'
import { AttachedReplyBubble } from '../components/AttachedReplyBubble'
import { ComposerAttachmentPreview } from '../components/ComposerAttachmentPreview'
import { ComposerAttachmentPicker } from '../components/ComposerAttachmentPicker'
import { ConversationDayDivider } from '../components/ConversationDayDivider'
import { EmojiPicker } from '../components/EmojiPicker'
import { ThreadedBubble } from '../components/ThreadedBubble'

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
  onAttachmentClear: () => void
  onOpenGroupActions: (event: MouseEvent<HTMLButtonElement>) => void
  onBack: () => void
  onComposerFocus: () => void
  onDraftChange: (value: string) => void
  onMessageSelect: (event: MouseEvent<HTMLButtonElement>, message: Message) => void
  onOpenAttachment: (attachment: NonNullable<Message['attachment']>) => void
  onOpenThread: (messageId: number) => void
  onOpenLinkedChannel: (sourceChannel: ChannelMessageSource) => void
  onOpenParticipants: () => void
  onOpenSourceChannel: (message: Message) => void
  onOpenAttachmentPicker: (mode: 'file' | 'photo') => void
  onOpenPremiumUpsell?: () => void
  onReplyCancel: () => void
  onReplyReferenceJump?: (messageId: number) => void
  onToggleSendOriginal?: () => void
  premiumUnlocked?: boolean
  replyTarget: ReplyTarget | null
  resolveLinkedChannelFromMessage: (message: Message) => ChannelMessageSource | null
  composerDisabledNotice?: string | null
  onSubmit: () => void | Promise<void>
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
  onAttachmentClear,
  onOpenGroupActions,
  onBack,
  onComposerFocus,
  onDraftChange,
  onMessageSelect,
  onOpenAttachment,
  onOpenThread,
  onOpenLinkedChannel,
  onOpenParticipants,
  onOpenSourceChannel,
  onOpenAttachmentPicker,
  onOpenPremiumUpsell,
  onReplyCancel,
  onReplyReferenceJump,
  onToggleSendOriginal,
  premiumUnlocked = false,
  replyTarget,
  resolveLinkedChannelFromMessage,
  composerDisabledNotice,
  onSubmit,
}: GroupRoomProps) {
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null)
  const hasComposerPayload = draft.trim().length > 0 || Boolean(attachmentDraft)
  const canSubmitComposer = attachmentDraft ? attachmentDraft.status === 'ready' : draft.trim().length > 0
  const composerPlaceholder = attachmentDraft
    ? isImageMimeType(attachmentDraft.mimeType)
      ? 'Добавьте подпись к фотографии...'
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

  useLayoutEffect(() => {
    const textarea = draftInputRef.current
    if (!textarea) return

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const maxHeight = Math.max(120, Math.floor(viewportHeight * 0.5))

    textarea.style.height = '0px'
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight)
    textarea.style.height = `${Math.max(56, nextHeight)}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [draft])

  useEffect(() => {
    if (!replyTarget) return

    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus()
    })
  }, [replyTarget])

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
                    {group.muted ? (
                      <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                        <img src="/icons/bell-100.png" alt="" />
                      </span>
                    ) : null}
                    <span className="chat-star">
                      <img src="/icons/group100.png" alt="Группа" />
                    </span>
                  </div>
                </div>
              <button
                type="button"
                className="room-members-link"
                onClick={onOpenParticipants}
              >
                {`${group.members} участников`}
              </button>
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

        <div className="message-feed" ref={messageFeedRef}>
          {visibleMessages.map((message, index) => {
            const previousMessage = index > 0 ? visibleMessages[index - 1] : null
            const messageDayKey = getConversationDayKey(message.createdAt)
            const previousMessageDayKey = previousMessage ? getConversationDayKey(previousMessage.createdAt) : null
            const groupParticipant = resolveGroupParticipant(message)
            const linkedChannel = message.sourceChannel ? null : resolveLinkedChannelFromMessage(message)
            const messageDeliveryIssue =
              message.author === 'me' ? getMessageDeliveryIssue(message.id) : null
            const messagePending = messageDeliveryIssue === 'pending'
            const messageFailed = messageDeliveryIssue === 'failed'
            const showDeliveryCaption = messageDeliveryIssue !== null && shouldShowDeliveryCaption(message)
            const showDeliveryIndicator = message.author === 'me'
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

            const replyReference = message.replyTo

            return (
              <Fragment key={message.id}>
                {index === 0 || previousMessageDayKey !== messageDayKey ? (
                  <ConversationDayDivider label={formatConversationDayLabel(message.createdAt)} />
                ) : null}
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
                        <button
                          type="button"
                          data-group-message-id={message.id}
                          className={bubbleClassNames.join(' ')}
                          onClick={(event) => onMessageSelect(event, message)}
                        >
                          {message.author === 'me' ? (
                            <span className="bubble-meta">Вы</span>
                          ) : groupParticipant ? (
                            <div className="bubble-sender">
                              <span className="bubble-sender-avatar-stack">
                                <span className="avatar bubble-sender-avatar" style={{ backgroundColor: groupParticipant.accent }}>
                                  {groupParticipant.title.slice(0, 1)}
                                </span>
                                {groupParticipant.online ? (
                                  <span className="bubble-sender-presence-dot" aria-label="В сети" />
                                ) : null}
                              </span>
                              <span className="bubble-sender-name">{groupParticipant.title}</span>
                              {groupParticipant.premium ? (
                                <span className="premium-crown bubble-sender-crown" aria-label="Премиум">
                                  <img src="/icons/crown64.png" alt="" />
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="bubble-meta">{message.displayAuthor ?? 'Участник группы'}</span>
                          )}
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
                            linkedChannel={linkedChannel}
                            message={message}
                            onOpenAttachment={onOpenAttachment}
                            onOpenLinkedChannel={
                              linkedChannel ? () => onOpenLinkedChannel(linkedChannel) : undefined
                            }
                            showReplyInline={false}
                          />
                          <time>{message.time}</time>
                          {showDeliveryCaption ? (
                            <span className="bubble-delivery-caption">Сообщение не отправлено</span>
                          ) : null}
                          {showDeliveryIndicator ? (
                            <img
                              className="bubble-delivery-indicator"
                              src={
                                messageFailed
                                  ? '/icons/warning-48.png'
                                  : messagePending
                                    ? '/icons/hourglass-48.png'
                                    : '/icons/double-tick-50.png'
                              }
                              alt=""
                              aria-hidden="true"
                            />
                          ) : null}
                        </button>
                      }
                    />
                  }
                />
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
                      onOpenPremiumUpsell={onOpenPremiumUpsell}
                      onToggleSendOriginal={onToggleSendOriginal}
                      premiumUnlocked={premiumUnlocked}
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
                    rows={1}
                    placeholder={composerPlaceholder}
                    value={draft}
                    onFocus={onComposerFocus}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                  />
                  <div className="composer-tools">
                    <EmojiPicker
                      onSelect={(emoji) =>
                        insertComposerTextAtCursor(draftInputRef.current, draft, emoji, onDraftChange)
                      }
                    />
                    <ComposerAttachmentPicker
                      attachmentName={attachmentName}
                      onSelectMode={onOpenAttachmentPicker}
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
