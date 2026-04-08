import type { CSSProperties, ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'

type ThreadedBubbleProps = {
  bubble: ReactNode
  emptyLabel?: string
  isMine?: boolean
  onOpenThread?: () => void
  showOpenWhenEmpty?: boolean
  threadCount?: number
  variant?: 'message' | 'channel'
}

function formatThreadCount(threadCount: number) {
  const remainder10 = threadCount % 10
  const remainder100 = threadCount % 100

  if (remainder10 === 1 && remainder100 !== 11) {
    return `${threadCount} комментарий`
  }

  if (remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)) {
    return `${threadCount} комментария`
  }

  return `${threadCount} комментариев`
}

export function ThreadedBubble({
  bubble,
  emptyLabel = 'Открыть комментарии',
  isMine = false,
  onOpenThread,
  showOpenWhenEmpty = false,
  threadCount = 0,
  variant = 'message',
}: ThreadedBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const [threadPillMaxWidth, setThreadPillMaxWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const node = bubbleRef.current
    if (!node) return

    const updateThreadPillWidth = () => {
      const measuredNode =
        (node.querySelector('[data-bubble-measure="true"]') as HTMLElement | null) ?? node
      const nextWidth = Math.ceil(measuredNode.getBoundingClientRect().width)
      setThreadPillMaxWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth))
    }

    updateThreadPillWidth()

    const observer = new ResizeObserver(() => {
      updateThreadPillWidth()
    })

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  const rootClassName = [
    'threaded-bubble',
    isMine ? 'mine' : null,
    threadCount > 0 || showOpenWhenEmpty ? 'has-thread' : null,
    variant === 'channel' ? 'channel' : null,
  ]
    .filter(Boolean)
    .join(' ')

  const style =
    threadPillMaxWidth !== null
      ? ({ '--thread-pill-max-width': `${threadPillMaxWidth}px` } as CSSProperties)
      : undefined

  return (
    <div className={rootClassName} style={style}>
      <div ref={bubbleRef} className="threaded-bubble-main">
        {bubble}
      </div>
      {(threadCount > 0 || showOpenWhenEmpty) && onOpenThread ? (
        <button
          type="button"
          className={`thread-pill${isMine ? ' mine' : ''}`}
          onClick={onOpenThread}
        >
          <img src="/icons/root-50.png" alt="" aria-hidden="true" className="thread-pill-icon" />
          <span>{threadCount > 0 ? formatThreadCount(threadCount) : emptyLabel}</span>
        </button>
      ) : null}
    </div>
  )
}
