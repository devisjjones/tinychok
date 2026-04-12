import type {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from 'react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ComposerAttachmentDraft } from '../app/composerAttachments'
import type { ChannelMessageSource, Chat, EditTarget, Message, ReplyTarget, UserGifLibraryItem } from '../app/types'
import {
  formatConversationDayLabel,
  formatMessageTimeLabel,
  formatMessagePreview,
  getConversationDayKey,
  isImageMimeType,
  isStandaloneEmojiMessageText,
  isVideoNoteAttachment,
  isVideoMimeType,
  scrollFeedChildIntoView,
  shouldAutoFocusTextInputOnSceneOpen,
  shouldSubmitComposerWithEnter,
  shouldShowDeliveryCaption,
  stripMessageFormattingMarkup,
} from '../app/utils'
import {
  BubbleMessageContent,
  EmojiOnlyMessageContent,
  BubbleImageOverlayMeta,
  BubbleTextInlineMeta,
  ForwardedChannelHeader,
  shouldUseLightDeliveryIndicatorTint,
} from '../components/BubbleMessageContent'
import { AttachedReplyBubble } from '../components/AttachedReplyBubble'
import { ConversationDayDivider } from '../components/ConversationDayDivider'
import { MediaOnlyBubbleRow } from '../components/MediaOnlyBubbleRow'
import { RoomComposer } from '../components/RoomComposer'

type DirectChatComposerGate =
  | {
      kind: 'action'
      actionLabel: string
      busy?: boolean
      message?: ReactNode
      messageTone?: 'danger' | 'friendly'
      tone?: 'danger' | 'neutral' | 'primary'
    }
  | {
      kind: 'incoming-request'
      actionError?: string
      busy?: boolean
      message: ReactNode
    }
  | {
      kind: 'disabled' | 'status'
      message: ReactNode
    }

type DirectChatRoomProps = {
  activeChat: Chat
  activeMessageId: number | null
  attachmentDraft?: ComposerAttachmentDraft
  attachmentInputRef: RefObject<HTMLInputElement | null>
  attachmentName: string
  chatActionsOpen: boolean
  draft: string
  getMessageDeliveryIssue: (messageId: number) => 'pending' | 'failed' | null
  getMessageUploadProgress: (messageId: number) => number | null
  messageFeedRef: RefObject<HTMLDivElement | null>
  onAttachmentClear: () => void
  onAttachmentPreviewOpen?: () => void
  onRenameAttachmentFileBaseName?: (nextBaseName: string) => void
  pinnedMessage: Message | null
  quietMode: boolean
  editTarget: EditTarget | null
  replyTarget: ReplyTarget | null
  visibleMessages: Message[]
  composerDisabledNotice?: string | null
  composerGate?: DirectChatComposerGate | null
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  onComposerPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void | Promise<void>
  onBack: () => void
  onBlockChat: () => void
  onCloseChatActions: () => void
  onCreateGroup: () => void
  onDraftChange: (value: string) => void
  onEditCancel: () => void
  onMessageSelect: (anchorElement: HTMLElement, message: Message) => void
  onOpenAttachment: (attachment: NonNullable<Message['attachment']>) => void
  onOpenExternalLink?: (url: string) => void
  onOpenLinkedChannel: (sourceChannel: ChannelMessageSource) => void
  onOpenSourceContact: (sourceContact: NonNullable<Message['sourceContact']>) => void
  onOpenSourceGroup: (sourceGroup: NonNullable<Message['sourceGroup']>) => void
  onOpenSourceChannel: (message: Message) => void
  onOpenAttachmentPicker: (mode: 'file' | 'photo') => void
  onOpenPremiumGift: () => void
  onOpenPremiumUpsell?: () => void
  onOpenVideoNoteRecorder?: () => void
  onComposerGateAction?: () => void
  onComposerGateAccept?: () => void
  onComposerGateReject?: () => void
  onComposerGateBlock?: () => void
  onReplyCancel: () => void
  onDeleteGif?: (gif: UserGifLibraryItem) => Promise<void>
  onSearchGifs?: (query: string) => Promise<UserGifLibraryItem[]>
  onRequestDeleteContact: () => void
  onRequestDeleteHistory: () => void
  onRequestReportContact: () => void
  onShareContact: () => void
  onSelectGif?: (gif: UserGifLibraryItem) => void
  onUploadGif?: (file: File) => Promise<void>
  onReplyReferenceJump?: (messageId: number) => void
  onToggleSendOriginal?: () => void
  onToggleChatMuted: () => void
  premiumUnlocked?: boolean
  gifLibrary?: UserGifLibraryItem[]
  gifSelectionBlockedReason?: string | null
  resolveLinkedChannelFromMessage: (message: Message) => ChannelMessageSource | null
  onSubmit: () => void | Promise<void>
  onToggleChatActions: () => void
  onToggleFavoriteChat: () => void
  onUnpinMessage: () => void
  storageCleanupWarning?: ReactNode
}

export function DirectChatRoom({
  activeChat,
  activeMessageId,
  attachmentDraft,
  attachmentInputRef,
  attachmentName,
  chatActionsOpen,
  draft,
  getMessageDeliveryIssue,
  getMessageUploadProgress,
  messageFeedRef,
  onAttachmentClear,
  onAttachmentPreviewOpen,
  onRenameAttachmentFileBaseName,
  pinnedMessage,
  quietMode,
  editTarget,
  replyTarget,
  visibleMessages,
  composerDisabledNotice = null,
  composerGate = null,
  onAttachmentChange,
  onComposerPaste,
  onBack,
  onBlockChat,
  onCloseChatActions,
  onCreateGroup,
  onDraftChange,
  onEditCancel,
  onMessageSelect,
  onOpenAttachment,
  onOpenExternalLink,
  onOpenLinkedChannel,
  onOpenSourceContact,
  onOpenSourceGroup,
  onOpenSourceChannel,
  onOpenAttachmentPicker,
  onOpenPremiumGift,
  onOpenPremiumUpsell,
  onOpenVideoNoteRecorder,
  onComposerGateAction,
  onComposerGateAccept,
  onComposerGateReject,
  onComposerGateBlock,
  onReplyCancel,
  onDeleteGif,
  onSearchGifs,
  onSelectGif,
  onUploadGif,
  onReplyReferenceJump,
  onRequestDeleteContact,
  onRequestDeleteHistory,
  onRequestReportContact,
  onShareContact,
  onToggleSendOriginal,
  onToggleChatMuted,
  gifLibrary = [],
  gifSelectionBlockedReason = null,
  premiumUnlocked = false,
  resolveLinkedChannelFromMessage,
  onSubmit,
  onToggleChatActions,
  onToggleFavoriteChat,
  onUnpinMessage,
  storageCleanupWarning = null,
}: DirectChatRoomProps) {
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null)
  const roomPresenceBlockRef = useRef<HTMLDivElement | null>(null)
  const roomPresenceMeasureRef = useRef<HTMLDivElement | null>(null)
  const roomTitleNameRef = useRef<HTMLDivElement | null>(null)
  const roomTitleHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const effectiveVisibleMessages = activeChat.archivedAccount ? [] : visibleMessages
  const effectiveComposerDisabledNotice =
    composerDisabledNotice ?? (activeChat.archivedAccount ? 'Аккаунт удалён. Переписка недоступна.' : null)
  const effectiveComposerGate = effectiveComposerDisabledNotice ? null : composerGate
  const canSubmitComposer = attachmentDraft ? attachmentDraft.status === 'ready' : draft.trim().length > 0
  const roomStatusText = activeChat.status.trim()
  const roomLastSeenText = activeChat.lastSeen?.trim() ?? ''
  const roomPresenceParts: string[] = []
  if (activeChat.archivedAccount) {
    roomPresenceParts.push('Удалённый аккаунт')
  } else {
    if (roomStatusText && roomStatusText.toLowerCase() !== 'в сети' && roomStatusText !== roomLastSeenText) {
      roomPresenceParts.push(roomStatusText)
    }
    if (!activeChat.online && roomLastSeenText) {
      roomPresenceParts.push(roomLastSeenText)
    }
  }
  const roomPresenceText = roomPresenceParts.join(' · ').trim() || '\u00A0'
  const [roomStatusExpanded, setRoomStatusExpanded] = useState(false)
  const [roomStatusExpandable, setRoomStatusExpandable] = useState(false)
  const [roomStatusCollapsedLines, setRoomStatusCollapsedLines] = useState<1 | 2>(2)
  const composerPlaceholder = attachmentDraft
    ? attachmentDraft.kind === 'video-note'
      ? 'Видеосообщение отправится без подписи.'
      : isImageMimeType(attachmentDraft.mimeType)
      ? 'Добавьте подпись к фотографии...'
      : isVideoMimeType(attachmentDraft.mimeType)
        ? 'Добавьте подпись к видео...'
        : 'Добавьте подпись к файлу...'
    : 'Напиши сообщение в тайник...'
  const composerDraftDisabled = attachmentDraft?.kind === 'video-note'
  const videoNoteDisabled = Boolean(attachmentDraft) || draft.trim().length > 0
  const videoNoteTitle = videoNoteDisabled
    ? 'Уберите текст или текущее вложение, чтобы записать видеосообщение.'
    : 'Записать видеосообщение'

  async function submitComposer() {
    await Promise.resolve(onSubmit())
    if (!shouldAutoFocusTextInputOnSceneOpen()) return
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

  useEffect(() => {
    if (!replyTarget && !editTarget) return

    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus()
    })
  }, [editTarget, replyTarget])

  useEffect(() => {
    if (effectiveComposerDisabledNotice || effectiveComposerGate || activeChat.archivedAccount) return
    if (!shouldAutoFocusTextInputOnSceneOpen()) return

    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus()
    })
  }, [activeChat.id, activeChat.archivedAccount, effectiveComposerDisabledNotice, effectiveComposerGate])

  useEffect(() => {
    setRoomStatusExpanded(false)
  }, [activeChat.id, roomPresenceText])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const titleBlock = roomTitleNameRef.current
    const titleHeading = roomTitleHeadingRef.current
    if (!titleBlock || !titleHeading || !activeChat.title.trim()) {
      if (titleHeading) {
        titleHeading.style.removeProperty('font-size')
      }
      return
    }

    let animationFrameId = 0
    let resizeObserver: ResizeObserver | null = null

    const syncTitleFontSize = () => {
      titleHeading.style.removeProperty('font-size')

      const computedStyles = window.getComputedStyle(titleHeading)
      const responsiveFontSize = Number.parseFloat(computedStyles.fontSize)
      const maxFontSize =
        Number.isFinite(responsiveFontSize) && responsiveFontSize > 0 ? responsiveFontSize : 18
      const isCompactViewport = window.matchMedia('(max-width: 640px)').matches
      const minFontSize = isCompactViewport ? 12.5 : 15
      let nextFontSize = maxFontSize

      titleHeading.style.fontSize = `${nextFontSize}px`

      while (nextFontSize > minFontSize) {
        const nextComputedStyles = window.getComputedStyle(titleHeading)
        const nextLineHeight =
          Number.parseFloat(nextComputedStyles.lineHeight) || nextFontSize * 1.05
        const maxHeight = nextLineHeight * 2 + 1
        const widthOverflow = titleHeading.scrollWidth > titleHeading.clientWidth + 1
        const heightOverflow = titleHeading.scrollHeight > maxHeight

        if (!widthOverflow && !heightOverflow) {
          break
        }

        nextFontSize -= 0.5
        titleHeading.style.fontSize = `${nextFontSize}px`
      }
    }

    const scheduleSync = () => {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(syncTitleFontSize)
    }

    scheduleSync()
    window.addEventListener('resize', scheduleSync)

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(scheduleSync)
      resizeObserver.observe(titleBlock)
      resizeObserver.observe(titleHeading)
    }

    return () => {
      window.removeEventListener('resize', scheduleSync)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [activeChat.archivedAccount, activeChat.blockedByAdmin, activeChat.muted, activeChat.premium, activeChat.title])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const block = roomPresenceBlockRef.current
    const measure = roomPresenceMeasureRef.current
    const titleHeading = roomTitleHeadingRef.current
    if (!block || !measure || !roomPresenceText.trim()) {
      setRoomStatusExpandable(false)
      setRoomStatusCollapsedLines(2)
      return
    }

    let animationFrameId = 0
    let resizeObserver: ResizeObserver | null = null

    const syncExpandableState = () => {
      const isMobileViewport = window.matchMedia('(max-width: 640px)').matches
      if (!isMobileViewport) {
        setRoomStatusExpandable(false)
        return
      }

      const computedMeasureStyles = window.getComputedStyle(measure)
      const fontSize = Number.parseFloat(computedMeasureStyles.fontSize) || 16
      const lineHeight = Number.parseFloat(computedMeasureStyles.lineHeight) || fontSize * 1.25
      const computedTitleStyles = titleHeading ? window.getComputedStyle(titleHeading) : null
      const titleFontSize = computedTitleStyles ? Number.parseFloat(computedTitleStyles.fontSize) || 16 : 16
      const titleLineHeight = computedTitleStyles
        ? Number.parseFloat(computedTitleStyles.lineHeight) || titleFontSize * 1.05
        : 0
      const titleUsesMultipleLines = titleHeading
        ? titleLineHeight > 0 && titleHeading.scrollHeight > titleLineHeight * 1.5
        : false
      const nextCollapsedLines: 1 | 2 = titleUsesMultipleLines ? 1 : 2
      const maxCollapsedHeight = lineHeight * nextCollapsedLines + 1
      const nextExpandable = measure.scrollHeight > maxCollapsedHeight

      setRoomStatusCollapsedLines((previous) => (previous === nextCollapsedLines ? previous : nextCollapsedLines))
      setRoomStatusExpandable((previous) => (previous === nextExpandable ? previous : nextExpandable))
      if (!nextExpandable) {
        setRoomStatusExpanded(false)
      }
    }

    const scheduleSync = () => {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(syncExpandableState)
    }

    scheduleSync()
    window.addEventListener('resize', scheduleSync)

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(scheduleSync)
      resizeObserver.observe(block)
      if (titleHeading) {
        resizeObserver.observe(titleHeading)
      }
    }

    return () => {
      window.removeEventListener('resize', scheduleSync)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [
    roomPresenceText,
    activeChat.archivedAccount,
    activeChat.blockedByAdmin,
    activeChat.muted,
    activeChat.premium,
    activeChat.title,
  ])

  function jumpToMessage(messageId: number) {
    if (onReplyReferenceJump) {
      onReplyReferenceJump(messageId)
      return
    }

    void window.requestAnimationFrame(() => {
      scrollFeedChildIntoView(messageFeedRef.current, `[data-direct-message-id="${messageId}"]`)
    })
  }

  return (
    <section className={pinnedMessage ? 'chat-room has-pinned-message' : 'chat-room'}>
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
          <span className="chat-avatar-stack room-avatar-stack">
            <span className="avatar large" style={{ backgroundColor: activeChat.accent }}>
              {activeChat.avatarImage ? (
                <img src={activeChat.avatarImage} alt="" className="channel-avatar-image" />
              ) : activeChat.archivedAccount ? (
                <img src="/icons/ghost.png" alt="" aria-hidden="true" className="avatar-ghost-icon" />
              ) : (
                activeChat.title.slice(0, 1)
              )}
            </span>
            {activeChat.online && !activeChat.archivedAccount ? <span className="presence-dot" aria-label="В сети" /> : null}
          </span>
          <div>
            <div className="room-title">
              <div ref={roomTitleNameRef} className="room-title-name">
                <h3 ref={roomTitleHeadingRef}>{activeChat.title}</h3>
                {activeChat.archivedAccount ? <span className="room-archive-badge">Архив</span> : null}
                {activeChat.blockedByAdmin ? (
                  <span className="blocked-contact-badge" aria-label="Пользователь заблокирован администрацией">
                    <img src="/icons/blocked.png" alt="" aria-hidden="true" />
                  </span>
                ) : null}
                {activeChat.muted ? (
                  <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                    <img src="/icons/bell-100.png" alt="" />
                  </span>
                ) : null}
                {activeChat.premium ? (
                  <span className="premium-crown room-crown" aria-label="Премиум">
                    <img src="/icons/crown64.png" alt="" />
                  </span>
                ) : null}
              </div>
            </div>
            <div
              ref={roomPresenceBlockRef}
              className={`room-presence-block${roomStatusExpanded ? ' room-presence-block-expanded' : ''}`}
            >
              <p
                className={`room-presence-text${
                  roomStatusExpandable ? ' room-presence-text-toggleable' : ''
                }${
                  roomStatusExpanded
                    ? ' room-presence-text-expanded'
                    : ` room-presence-text-collapsed room-presence-text-collapsed-${roomStatusCollapsedLines}`
                }`}
              >
                {roomPresenceText}
              </p>
              {roomStatusExpandable ? (
                <button
                  type="button"
                  className={`room-presence-toggle${roomStatusExpanded ? ' is-expanded' : ''}`}
                  onClick={() => setRoomStatusExpanded((previous) => !previous)}
                  aria-label={roomStatusExpanded ? 'Свернуть статус' : 'Показать полный статус'}
                  aria-expanded={roomStatusExpanded}
                >
                  <img src="/icons/back.png" alt="" aria-hidden="true" />
                </button>
              ) : null}
              <div ref={roomPresenceMeasureRef} className="room-presence-text room-presence-text-measure" aria-hidden="true">
                {roomPresenceText}
              </div>
            </div>
          </div>
        </div>
        <div className="room-actions">
          <button
            type="button"
            className={activeChat.pinned ? 'soft-button active room-star' : 'soft-button room-star'}
            onClick={onToggleFavoriteChat}
            aria-label="Избранное"
          >
            <img src="/icons/star100.png" alt="" />
          </button>
          <button
            type="button"
            className="soft-button room-menu-button"
            onClick={onToggleChatActions}
            aria-label="Меню контакта"
          >
            <img src="/icons/menu.png" alt="" aria-hidden="true" className="room-menu-icon" />
          </button>
          {chatActionsOpen ? (
            <>
              <button
                type="button"
                className="room-menu-scrim"
                aria-label="Закрыть меню"
                onClick={onCloseChatActions}
              />
              <div className="room-menu">
                <button
                  type="button"
                  className="room-menu-item"
                  onClick={onToggleChatMuted}
                >
                  {activeChat.muted ? 'Включить уведомления' : 'Заглушить'}
                </button>
                <button type="button" className="room-menu-item" onClick={onCreateGroup}>
                  Создать группу
                </button>
                {!activeChat.archivedAccount ? (
                  <button type="button" className="room-menu-item" onClick={onShareContact}>
                    Поделиться контактом
                  </button>
                ) : null}
                <button
                  type="button"
                  className="room-menu-item room-menu-item-premium"
                  onClick={onOpenPremiumGift}
                >
                  <span>Подарить</span>
                  <img src="/icons/crown64.png" alt="" />
                </button>
                <button type="button" className="room-menu-item danger" onClick={onBlockChat}>
                  Заблокировать
                </button>
                <button
                  type="button"
                  className="room-menu-item danger"
                  onClick={onRequestReportContact}
                >
                  Пожаловаться
                </button>
                <button
                  type="button"
                  className="room-menu-item danger"
                  onClick={onRequestDeleteContact}
                >
                  Удалить контакт
                </button>
                <button
                  type="button"
                  className="room-menu-item danger"
                  onClick={onRequestDeleteHistory}
                >
                  Удалить переписку
                </button>
              </div>
            </>
          ) : null}
        </div>
      </header>

      {pinnedMessage ? (
        <div className="pinned-message">
          <div className="pinned-message-content">
            <img className="pinned-message-icon" src="/icons/pin100.png" alt="" aria-hidden="true" />
            <p>{formatMessagePreview(pinnedMessage)}</p>
          </div>
          <button type="button" className="soft-button pinned-message-close" onClick={onUnpinMessage}>
            Снять
          </button>
        </div>
      ) : null}

      <div className="message-feed direct-room-feed" ref={messageFeedRef}>
        {effectiveVisibleMessages.map((message, index) => {
          const previousMessage = index > 0 ? effectiveVisibleMessages[index - 1] : null
          const messageDayKey = getConversationDayKey(message.createdAt)
          const previousMessageDayKey = previousMessage ? getConversationDayKey(previousMessage.createdAt) : null
          const linkedChannel =
            message.sourceChannel || message.sourceContact ? null : resolveLinkedChannelFromMessage(message)
          const messageDeliveryIssue =
            message.author === 'me' ? getMessageDeliveryIssue(message.id) : null
          const hasImageAttachment = Boolean(
            message.attachment &&
            (isImageMimeType(message.attachment.mimeType) || isVideoMimeType(message.attachment.mimeType)),
          )
          const messagePending = messageDeliveryIssue === 'pending'
          const messageFailed = messageDeliveryIssue === 'failed'
          const messageUploadProgress =
            message.author === 'me' && messagePending ? getMessageUploadProgress(message.id) : null
          const showDeliveryCaption = messageFailed && shouldShowDeliveryCaption(message)
          const showDeliveryIndicator = message.author === 'me'
          const messageReadByRecipient = message.author === 'me' && Boolean(message.readAt)
          const deliveryIndicatorSrc = messageFailed
            ? '/icons/warning-48.png'
            : messagePending
              ? '/icons/hourglass-48.png'
              : messageReadByRecipient
                ? '/icons/double-tick-50.png'
                : '/icons/check-mark-50.png'
          const isImageOnlyBubble =
            hasImageAttachment &&
            !linkedChannel &&
            !message.sourceChannel &&
            !message.sourceGroup &&
            message.text.trim().length === 0
          const isVideoNoteOnlyBubble =
            isImageOnlyBubble &&
            Boolean(message.attachment && isVideoNoteAttachment(message.attachment))
          const videoNoteDeliveryIndicatorSrc =
            showDeliveryIndicator && !(messagePending && isVideoNoteOnlyBubble)
              ? deliveryIndicatorSrc
              : null
          const isStandaloneEmojiOnlyMessage =
            !hasImageAttachment &&
            !linkedChannel &&
            !message.sourceChannel &&
            !message.sourceContact &&
            !message.sourceGroup &&
            !message.forwarded &&
            !message.attachmentRemovedNotice &&
            isStandaloneEmojiMessageText(message.text)
          const standaloneEmojiGlyph = isStandaloneEmojiOnlyMessage
            ? stripMessageFormattingMarkup(message.text).trim()
            : ''
          const shouldUseInlineTextMeta =
            !hasImageAttachment &&
            !isStandaloneEmojiOnlyMessage &&
            !showDeliveryCaption &&
            (message.text.trim().length > 0 || Boolean(message.attachment))
          const bubbleClassNames = ['bubble', 'bubble-button']

          if (message.author === 'me') {
            bubbleClassNames.push('mine')
          }

          if (activeMessageId === message.id) {
            bubbleClassNames.push('selected')
          }

          if (showDeliveryIndicator && !isStandaloneEmojiOnlyMessage) {
            bubbleClassNames.push('has-delivery-indicator')
          }

          if (messageDeliveryIssue && !isStandaloneEmojiOnlyMessage) {
            bubbleClassNames.push('has-delivery-issue')
          }

          if (showDeliveryCaption && !isStandaloneEmojiOnlyMessage) {
            bubbleClassNames.push('has-delivery-caption')
          }

          if (messageFailed && !isStandaloneEmojiOnlyMessage) {
            bubbleClassNames.push('delivery-failed')
          }

          if (messageReadByRecipient && !isStandaloneEmojiOnlyMessage) {
            bubbleClassNames.push('read-by-recipient')
          }

          if (message.replyTo) {
            bubbleClassNames.push('has-attached-reply')
          }

          if (isImageOnlyBubble) {
            bubbleClassNames.push('media-only-bubble')
          }

          if (isVideoNoteOnlyBubble) {
            bubbleClassNames.push('video-note-only-bubble')
          }

          if (isStandaloneEmojiOnlyMessage) {
            bubbleClassNames.push('emoji-only-message')
          }

          const replyReference = message.replyTo
          // Keep every room surface on the same createdAt-first time contract.
          const renderedMessageTime = formatMessageTimeLabel(message.createdAt, message.time)

          return (
            <Fragment key={message.id}>
              {index === 0 || previousMessageDayKey !== messageDayKey ? (
                <ConversationDayDivider label={formatConversationDayLabel(message.createdAt)} />
              ) : null}
              {message.system ? (
                <div className="direct-system-message" data-direct-message-id={message.id}>
                  <span className="direct-system-message-label">{message.text}</span>
                </div>
              ) : (
              <AttachedReplyBubble
                mine={message.author === 'me'}
                onReplyClick={
                  replyReference && Number.isInteger(replyReference.id) && replyReference.id > 0
                    ? () => jumpToMessage(replyReference.id)
                    : undefined
                }
                replyChatTitle={activeChat.title}
                replyTo={replyReference}
                bubble={
                  isImageOnlyBubble ? (
                    <MediaOnlyBubbleRow
                      actionLabel="Открыть действия сообщения"
                      bubbleAttributes={{ 'data-direct-message-id': message.id }}
                      bubbleClassName={bubbleClassNames.join(' ')}
                      mine={message.author === 'me'}
                      onOpenActions={(anchorElement) => onMessageSelect(anchorElement, message)}
                    >
                      <BubbleMessageContent
                        imageOverlay={
                          hasImageAttachment ? (
                            <BubbleImageOverlayMeta
                              deliveryIndicatorSrc={videoNoteDeliveryIndicatorSrc}
                              time={renderedMessageTime}
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
                        onOpenSourceGroup={
                          message.sourceGroup
                            ? () => onOpenSourceGroup(message.sourceGroup as NonNullable<Message['sourceGroup']>)
                            : undefined
                        }
                        replyChatTitle={activeChat.title}
                        showReplyInline={false}
                        uploadProgress={messageUploadProgress ?? undefined}
                      />
                    </MediaOnlyBubbleRow>
                  ) : (
                    <button
                      type="button"
                      data-direct-message-id={message.id}
                      className={bubbleClassNames.join(' ')}
                      onClick={(event) => onMessageSelect(event.currentTarget, message)}
                    >
                      {isStandaloneEmojiOnlyMessage ? (
                        <EmojiOnlyMessageContent
                          deliveryIndicatorSrc={showDeliveryIndicator ? deliveryIndicatorSrc : null}
                          edited={Boolean(message.editedAt)}
                          emoji={standaloneEmojiGlyph}
                          time={renderedMessageTime}
                        />
                      ) : (
                        <>
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
                          {message.forwarded && !message.sourceChannel ? (
                            <span className="bubble-meta">
                              {message.forwardedAuthorName
                                ? `Переслано ${message.forwardedAuthorName}`
                                : 'Переслано'}
                            </span>
                          ) : null}
                          <BubbleMessageContent
                            imageOverlay={
                              hasImageAttachment ? (
                                <BubbleImageOverlayMeta
                                  deliveryIndicatorSrc={videoNoteDeliveryIndicatorSrc}
                                  time={renderedMessageTime}
                                />
                              ) : undefined
                            }
                            linkedChannel={linkedChannel}
                            inlineMeta={
                              shouldUseInlineTextMeta ? (
                                <BubbleTextInlineMeta
                                  deliveryIndicatorSrc={
                                    showDeliveryIndicator ? deliveryIndicatorSrc : null
                                  }
                                  edited={Boolean(message.editedAt)}
                                  time={renderedMessageTime}
                                />
                              ) : undefined
                            }
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
                            onOpenSourceGroup={
                              message.sourceGroup
                                ? () => onOpenSourceGroup(message.sourceGroup as NonNullable<Message['sourceGroup']>)
                                : undefined
                            }
                            replyChatTitle={activeChat.title}
                            showReplyInline={false}
                            uploadProgress={messageUploadProgress ?? undefined}
                          />
                          {!hasImageAttachment && !shouldUseInlineTextMeta ? <time>{renderedMessageTime}</time> : null}
                          {!hasImageAttachment && showDeliveryCaption ? (
                            <span className="bubble-delivery-caption">Сообщение не отправлено</span>
                          ) : null}
                          {!hasImageAttachment && !shouldUseInlineTextMeta && showDeliveryIndicator ? (
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
                          ) : null}
                        </>
                      )}
                    </button>
                  )
                }
              />
              )}
            </Fragment>
          )
        })}

        {activeChat.typing && !quietMode ? (
          <div className="typing">
            <span />
            <span />
            <span />
            <p>{activeChat.title} печатает…</p>
          </div>
        ) : null}
      </div>

      {effectiveComposerDisabledNotice ? (
        <div className="composer composer-disabled">
          <p className="composer-disabled-note">{effectiveComposerDisabledNotice}</p>
        </div>
      ) : effectiveComposerGate ? (
        <div className="composer composer-disabled composer-gated">
          {effectiveComposerGate.message ? (
            <p
              className={[
                'composer-disabled-note',
                effectiveComposerGate.kind === 'action' && effectiveComposerGate.messageTone === 'friendly'
                  ? 'composer-disabled-note-friendly'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {effectiveComposerGate.message}
            </p>
          ) : null}
          {effectiveComposerGate.kind === 'incoming-request' ? (
            <>
              {/* Incoming requests are resolved only inside the shared room so users can
                  inspect preserved history before they accept, reject, or block. */}
              {effectiveComposerGate.actionError ? (
                <p className="auth-error">{effectiveComposerGate.actionError}</p>
              ) : null}
              <div className="composer-gate-actions">
                <button
                  type="button"
                  className="send-button channel-subscribe-button composer-gate-button"
                  onClick={onComposerGateAccept}
                  disabled={effectiveComposerGate.busy}
                >
                  {effectiveComposerGate.busy ? 'Обрабатываем...' : 'Подтвердить контакт'}
                </button>
                <button
                  type="button"
                  className="room-confirm-button composer-gate-button"
                  onClick={onComposerGateReject}
                  disabled={effectiveComposerGate.busy}
                >
                  Отклонить контакт
                </button>
                <button
                  type="button"
                  className="room-confirm-button room-confirm-danger composer-gate-button"
                  onClick={onComposerGateBlock}
                  disabled={effectiveComposerGate.busy}
                >
                  Заблокировать контакт
                </button>
              </div>
            </>
          ) : null}
          {effectiveComposerGate.kind === 'action' ? (
            <button
              type="button"
              className={[
                'composer-gate-button',
                effectiveComposerGate.tone === 'danger'
                  ? 'room-confirm-button room-confirm-danger'
                  : effectiveComposerGate.tone === 'neutral'
                    ? 'room-confirm-button'
                  : 'send-button channel-subscribe-button',
              ].join(' ')}
              onClick={onComposerGateAction}
              disabled={effectiveComposerGate.busy}
            >
              {effectiveComposerGate.actionLabel}
            </button>
          ) : null}
        </div>
      ) : (
        <RoomComposer
          attachmentDraft={attachmentDraft}
          attachmentInputRef={attachmentInputRef}
          attachmentName={attachmentName}
          draft={draft}
          draftInputRef={draftInputRef}
          gifLibrary={gifLibrary}
          gifSelectionBlockedReason={gifSelectionBlockedReason}
          onAttachmentChange={onAttachmentChange}
          onAttachmentClear={onAttachmentClear}
          onAttachmentPreviewOpen={onAttachmentPreviewOpen}
          onRenameAttachmentFileBaseName={onRenameAttachmentFileBaseName}
          onComposerPaste={onComposerPaste}
          onDeleteGif={onDeleteGif}
          onDraftChange={onDraftChange}
          onEditCancel={onEditCancel}
          onDraftFocus={undefined}
          onKeyDown={handleComposerKeyDown}
          onOpenAttachmentPicker={onOpenAttachmentPicker}
          onOpenPremiumUpsell={onOpenPremiumUpsell}
          onOpenVideoNoteRecorder={onOpenVideoNoteRecorder}
          onReplyCancel={onReplyCancel}
          onSearchGifs={onSearchGifs}
          onSelectGif={onSelectGif}
          onSubmit={submitComposer}
          onToggleSendOriginal={onToggleSendOriginal}
          onUploadGif={onUploadGif}
          placeholder={composerPlaceholder}
          premiumUnlocked={premiumUnlocked}
          editTarget={editTarget}
          replyTarget={replyTarget}
          draftDisabled={composerDraftDisabled}
          storageCleanupWarning={storageCleanupWarning}
          submitAriaLabel="Отправить"
          submitDisabled={!canSubmitComposer}
          submitTitle="Отправить"
          videoNoteDisabled={videoNoteDisabled}
          videoNoteTitle={videoNoteTitle}
        />
      )}
    </section>
  )
}
