import { useEffect, useRef, useState } from 'react'
import { compactEmojiCategories, fullEmojiCategories } from '../shared/emoji'

type EmojiPickerProps = {
  disabled?: boolean
  onSelect: (emoji: string) => void
}

export function EmojiPicker({
  disabled = false,
  onSelect,
}: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [showFullSet, setShowFullSet] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setShowFullSet(false)
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowFullSet(false)
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

  const visibleCategories = showFullSet ? fullEmojiCategories : compactEmojiCategories

  return (
    <div ref={rootRef} className="emoji-picker">
      <button
        type="button"
        className="soft-button composer-tool"
        onClick={() => {
          if (disabled) return
          setOpen((currentOpen) => {
            const nextOpen = !currentOpen
            if (nextOpen) {
              return true
            }
            setShowFullSet(false)
            return false
          })
        }}
        aria-label="Добавить смайл"
        title="Добавить смайл"
        disabled={disabled}
      >
        <img src="/icons/smile.png" alt="" aria-hidden="true" className="emoji-picker-trigger-icon" />
      </button>
      {open ? (
        <div className="emoji-picker-popover" role="dialog" aria-label="Выбор смайла">
          {visibleCategories.map((category) => (
            <section key={category.id} className="emoji-picker-section">
              <p className="emoji-picker-section-title">{category.label}</p>
              <div className="emoji-picker-grid">
                {category.items.map((emoji) => (
                  <button
                    key={`${category.id}-${emoji}`}
                    type="button"
                    className="emoji-picker-item"
                    onClick={() => {
                      onSelect(emoji)
                      setShowFullSet(false)
                      setOpen(false)
                    }}
                    title={emoji}
                  >
                    <span>{emoji}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {!showFullSet ? (
            <button
              type="button"
              className="emoji-picker-expand-button"
              onClick={() => setShowFullSet(true)}
            >
              Весь набор
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
