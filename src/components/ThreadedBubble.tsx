import type { CSSProperties, ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'

type ThreadedBubbleProps = {
  bubble: ReactNode
  isMine?: boolean
  onOpenThread?: () => void
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
  isMine = false,
  onOpenThread,
  threadCount = 0,
  variant = 'message',
}: ThreadedBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const [threadPillMaxWidth, setThreadPillMaxWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const node = bubbleRef.current
    if (!node) return

    const updateThreadPillWidth = () => {
      const nextWidth = Math.ceil(node.getBoundingClientRect().width)
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
    threadCount > 0 ? 'has-thread' : null,
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
      {threadCount > 0 && onOpenThread ? (
        <button
          type="button"
          className={`thread-pill${isMine ? ' mine' : ''}`}
          onClick={onOpenThread}
        >
          <img src="/icons/root-50.png" alt="" aria-hidden="true" className="thread-pill-icon" />
          <span>{formatThreadCount(threadCount)}</span>
        </button>
      ) : null}
    </div>
  )
}
