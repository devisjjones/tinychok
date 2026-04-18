import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { MessageReaction } from '../shared/types'
import { fullEmojiCategories } from '../shared/emoji'

type MessageReactionSurfaceProps = {
  bubble: ReactNode
  mine?: boolean
  onSetReaction?: (emoji: string | null) => void | Promise<void>
  reactions?: MessageReaction[]
}

export function MessageReactionSurface({
  bubble,
  mine = false,
  onSetReaction,
  reactions = [],
}: MessageReactionSurfaceProps) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const myReactionEmoji = reactions.find((reaction) => reaction.reactedByMe)?.emoji ?? null
  const canReact = Boolean(onSetReaction)

  async function submitReaction(emoji: string | null) {
    if (!onSetReaction || busy) {
      return
    }

    setBusy(true)

    try {
      await Promise.resolve(onSetReaction(emoji))
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const trigger = canReact ? (
    <button
      type="button"
      className={`message-reaction-trigger${myReactionEmoji ? ' is-active' : ''}`}
      aria-expanded={open}
      aria-label="Поставить реакцию"
      disabled={busy}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setOpen((currentOpen) => !currentOpen)
      }}
    >
      <img src="/icons/heart.png" alt="" aria-hidden="true" />
    </button>
  ) : null

  return (
    <div
      ref={rootRef}
      className={`message-reaction-surface${mine ? ' mine' : ''}${open ? ' reaction-picker-open' : ''}`}
    >
      {mine ? trigger : null}
      <div className={`message-reaction-surface-main${reactions.length > 0 ? ' has-reactions' : ''}`}>
        {bubble}
        {reactions.length > 0 ? (
          <div className={`message-reaction-list${mine ? ' mine' : ''}`}>
            {reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                className={`message-reaction-chip${reaction.reactedByMe ? ' is-own' : ''}`}
                disabled={busy || !onSetReaction}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void submitReaction(reaction.reactedByMe ? null : reaction.emoji)
                }}
              >
                <span className="message-reaction-chip-emoji" aria-hidden="true">
                  {reaction.emoji}
                </span>
                {reaction.count > 1 ? (
                  <span className="message-reaction-chip-count">{reaction.count}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {!mine ? trigger : null}
      {open ? (
        <div
          className={`message-reaction-picker${mine ? ' message-reaction-picker-mine' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          <div className="message-reaction-picker-scroll">
            {fullEmojiCategories.map((category) => (
              <section key={category.id} className="message-reaction-picker-category">
                <p className="message-reaction-picker-label">{category.label}</p>
                <div className="message-reaction-picker-grid">
                  {category.items.map((emoji) => (
                    <button
                      key={`${category.id}-${emoji}`}
                      type="button"
                      className={`message-reaction-picker-item${myReactionEmoji === emoji ? ' is-selected' : ''}`}
                      disabled={busy}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void submitReaction(emoji)
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
