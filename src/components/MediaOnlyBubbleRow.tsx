import type { ReactNode } from 'react'
import { useRef } from 'react'

type MediaOnlyBubbleRowProps = {
  actionLabel?: string
  bubbleAttributes?: Record<string, string | number | undefined>
  bubbleClassName: string
  children: ReactNode
  lane?: 'message' | 'channel'
  mine?: boolean
  onOpenActions?: (anchorElement: HTMLElement) => void
  semantic?: 'article' | 'div'
}

export function MediaOnlyBubbleRow({
  actionLabel = 'Открыть действия сообщения',
  bubbleAttributes,
  bubbleClassName,
  children,
  lane = 'message',
  mine = false,
  onOpenActions,
  semantic = 'div',
}: MediaOnlyBubbleRowProps) {
  const bubbleRef = useRef<HTMLElement | null>(null)
  const rowClassName = [
    'media-bubble-row',
    mine ? 'mine' : null,
    lane === 'channel' ? 'channel' : null,
  ]
    .filter(Boolean)
    .join(' ')

  const bubbleNode =
    semantic === 'article' ? (
      <article
        {...bubbleAttributes}
        ref={(node) => {
          bubbleRef.current = node
        }}
        data-bubble-measure="true"
        className={bubbleClassName}
      >
        {children}
      </article>
    ) : (
      <div
        {...bubbleAttributes}
        ref={(node) => {
          bubbleRef.current = node
        }}
        data-bubble-measure="true"
        className={bubbleClassName}
      >
        {children}
      </div>
    )

  const actionNode = onOpenActions ? (
    <button
      type="button"
      className="media-bubble-row-action"
      aria-label={actionLabel}
      title={actionLabel}
      onClick={(event) => {
        event.stopPropagation()
        if (bubbleRef.current) {
          onOpenActions(bubbleRef.current)
        }
      }}
    />
  ) : null

  if (!actionNode) {
    return bubbleNode
  }

  return (
    <div className={rowClassName}>
      {mine ? actionNode : null}
      {bubbleNode}
      {mine ? null : actionNode}
    </div>
  )
}
