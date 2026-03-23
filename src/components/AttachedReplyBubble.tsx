import type { CSSProperties, ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { Message } from '../app/types'
import { ReplyReferenceBlock } from './BubbleMessageContent'

type AttachedReplyBubbleProps = {
  bubble: ReactNode
  className?: string
  mine?: boolean
  onReplyClick?: () => void
  replyChatTitle?: string
  replyTo?: Message['replyTo']
}

export function AttachedReplyBubble({
  bubble,
  className,
  mine = false,
  onReplyClick,
  replyChatTitle,
  replyTo,
}: AttachedReplyBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const [bubbleWidth, setBubbleWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const node = bubbleRef.current
    if (!node) return

    const updateBubbleWidth = () => {
      const nextWidth = Math.ceil(node.getBoundingClientRect().width)
      setBubbleWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth))
    }

    updateBubbleWidth()

    const observer = new ResizeObserver(() => {
      updateBubbleWidth()
    })

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  const rootClassName = [
    'bubble-stack',
    mine ? 'mine' : null,
    className ?? null,
  ]
    .filter(Boolean)
    .join(' ')

  const style =
    bubbleWidth !== null
      ? ({ '--attached-bubble-width': `${bubbleWidth}px` } as CSSProperties)
      : undefined

  return (
    <div className={rootClassName} style={style}>
      {replyTo ? (
        <ReplyReferenceBlock
          mine={mine}
          onClick={onReplyClick}
          replyChatTitle={replyChatTitle}
          replyTo={replyTo}
        />
      ) : null}
      <div ref={bubbleRef} className="bubble-stack-main">
        {bubble}
      </div>
    </div>
  )
}
