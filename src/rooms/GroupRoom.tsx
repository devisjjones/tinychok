import type { ChangeEvent, FormEvent, MouseEvent, ReactNode, RefObject } from 'react'
import { useLayoutEffect, useRef } from 'react'
import type { ChannelMessageSource, GroupParticipant, GroupPreview, Message } from '../app/types'
import { shouldShowDeliveryCaption } from '../app/utils'
import { BubbleMessageContent, ForwardedChannelHeader } from '../components/BubbleMessageContent'

type GroupRoomProps = {
  actions: ReactNode
  activeMessageId: number | null
  attachmentInputRef: RefObject<HTMLInputElement | null>
  attachmentName: string
  draft: string
  getMessageDeliveryIssue: (messageId: number) => 'pending' | 'failed' | null
  group: GroupPreview
  messageFeedRef: RefObject<HTMLDivElement | null>
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  onBack: () => void
  onComposerFocus: () => void
  onDraftChange: (value: string) => void
  onMessageSelect: (event: MouseEvent<HTMLButtonElement>, message: Message) => void
  onOpenLinkedChannel: (sourceChannel: ChannelMessageSource) => void
  onOpenParticipants: () => void
  onOpenSourceChannel: (message: Message) => void
  onOpenAttachmentPicker: () => void
  resolveLinkedChannelFromMessage: (message: Message) => ChannelMessageSource | null
  onSubmit: () => void | Promise<void>
}

export function GroupRoom({
  actions,
  activeMessageId,
  attachmentInputRef,
  attachmentName,
  draft,
  getMessageDeliveryIssue,
  group,
  messageFeedRef,
  onAttachmentChange,
  onBack,
  onComposerFocus,
  onDraftChange,
  onMessageSelect,
  onOpenLinkedChannel,
  onOpenParticipants,
  onOpenSourceChannel,
  onOpenAttachmentPicker,
  resolveLinkedChannelFromMessage,
  onSubmit,
}: GroupRoomProps) {
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null)
  const hasComposerPayload = draft.trim().length > 0 || Boolean(attachmentName)

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
            <span className="room-mobile-back-icon" aria-hidden="true">
              &larr;
            </span>
          </button>
          <div className="room-id">
            <span className="avatar large" style={{ backgroundColor: group.accent }}>
              {group.title.slice(0, 1)}
            </span>
            <div>
              <div className="room-title">
                <div className="room-title-name">
                  <h3>{group.title}</h3>
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
        </header>

        <div className="message-feed" ref={messageFeedRef}>
          {group.messages.map((message) => {
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

            return (
              <button
                key={message.id}
                type="button"
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
                    <span className="bubble-meta">Переслано</span>
                  </>
                ) : null}
                <BubbleMessageContent
                  linkedChannel={linkedChannel}
                  message={message}
                  onOpenLinkedChannel={
                    linkedChannel ? () => onOpenLinkedChannel(linkedChannel) : undefined
                  }
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
            )
          })}
        </div>

        <form
          className="composer"
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            await Promise.resolve(onSubmit())
            window.requestAnimationFrame(() => {
              draftInputRef.current?.focus()
            })
          }}
        >
          <div className="composer-input">
            <div className="composer-entry">
              <div className="composer-field">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="composer-attachment-input"
                  onChange={onAttachmentChange}
                />
                <textarea
                  ref={draftInputRef}
                  rows={1}
                  placeholder="Напиши сообщение в группу..."
                  value={draft}
                  onFocus={onComposerFocus}
                  onChange={(event) => onDraftChange(event.target.value)}
                />
                <div className="composer-tools">
                  <button
                    type="button"
                    className={attachmentName ? 'soft-button composer-tool active' : 'soft-button composer-tool'}
                    onClick={onOpenAttachmentPicker}
                    aria-label="Добавить файл"
                    title={attachmentName || 'Добавить файл'}
                  >
                    <img src="/icons/attach100.png" alt="" />
                  </button>
                </div>
              </div>
              {hasComposerPayload ? (
                <button
                  type="submit"
                  className="send-button composer-send"
                  aria-label="Отправить"
                  title="Отправить"
                >
                  <span className="composer-send-icon" aria-hidden="true">
                    &rarr;
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </section>
      {actions}
    </>
  )
}
