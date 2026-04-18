import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MessageReaction } from '../shared/types'
import { MessageReactionPicker } from './MessageReactionPicker'

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
  const [anchorWidth, setAnchorWidth] = useState<number | null>(null)
  const [anchorLeft, setAnchorLeft] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const mainRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const rootNode = rootRef.current
    const mainNode = mainRef.current

    if (!rootNode || !mainNode) {
      return
    }

    const measuredNode =
      (mainNode.querySelector('[data-bubble-measure="true"]') as HTMLElement | null) ??
      (mainNode.querySelector('.bubble, .channel-post, .room-thread-source-bubble') as HTMLElement | null) ??
      (mainNode.firstElementChild as HTMLElement | null)

    if (!measuredNode) {
      setAnchorWidth(null)
      return
    }

    const updateAnchorWidth = () => {
      const measuredRect = measuredNode.getBoundingClientRect()
      const mainRect = mainNode.getBoundingClientRect()
      const nextWidth = Math.ceil(measuredRect.width)
      const nextLeft = Math.max(0, Math.round(measuredRect.left - mainRect.left))

      setAnchorWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth))
      setAnchorLeft((currentLeft) => (currentLeft === nextLeft ? currentLeft : nextLeft))
    }

    updateAnchorWidth()

    const observer = new ResizeObserver(() => {
      updateAnchorWidth()
    })

    observer.observe(rootNode)
    observer.observe(mainNode)
    observer.observe(measuredNode)

    return () => {
      observer.disconnect()
    }
  }, [bubble, reactions.length])

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

  const style =
    anchorWidth !== null
      ? ({
          '--message-reaction-anchor-width': `${anchorWidth}px`,
          ...(anchorLeft !== null ? { '--message-reaction-anchor-left': `${anchorLeft}px` } : {}),
        } as CSSProperties)
      : undefined

  return (
    <div
      ref={rootRef}
      className={`message-reaction-surface${mine ? ' mine' : ''}${canReact ? ' can-react' : ''}${open ? ' reaction-picker-open' : ''}`}
      style={style}
    >
      {mine ? trigger : null}
      <div
        ref={mainRef}
        className={`message-reaction-surface-main${reactions.length > 0 ? ' has-reactions' : ''}`}
      >
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
        <MessageReactionPicker
          className={`message-reaction-picker${mine ? ' message-reaction-picker-mine' : ''}`}
          currentEmoji={myReactionEmoji}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation()
          }}
          onSelect={(emoji) => {
            void submitReaction(emoji)
          }}
        />
      ) : null}
    </div>
  )
}
