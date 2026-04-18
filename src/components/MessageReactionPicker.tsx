import type { MouseEventHandler } from 'react'
import { fullEmojiCategories } from '../shared/emoji'

type MessageReactionPickerProps = {
  className?: string
  currentEmoji?: string | null
  disabled?: boolean
  onClick?: MouseEventHandler<HTMLDivElement>
  onSelect: (emoji: string) => void
}

export function MessageReactionPicker({
  className = 'message-reaction-picker',
  currentEmoji = null,
  disabled = false,
  onClick,
  onSelect,
}: MessageReactionPickerProps) {
  return (
    <div className={className} onClick={onClick}>
      <div className="message-reaction-picker-scroll">
        {fullEmojiCategories.map((category) => (
          <section key={category.id} className="message-reaction-picker-category">
            <p className="message-reaction-picker-label">{category.label}</p>
            <div className="message-reaction-picker-grid">
              {category.items.map((emoji) => (
                <button
                  key={`${category.id}-${emoji}`}
                  type="button"
                  className={`message-reaction-picker-item${currentEmoji === emoji ? ' is-selected' : ''}`}
                  disabled={disabled}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onSelect(emoji)
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
  )
}
