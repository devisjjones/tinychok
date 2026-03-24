import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { UserGifLibraryItem } from '../app/types'
import { compactEmojiCategories, fullEmojiCategories } from '../shared/emoji'
import { formatAttachmentImageDimensions, formatAttachmentSize } from '../app/utils'

type EmojiPickerProps = {
  canSelectGif?: boolean
  disabled?: boolean
  gifLibrary?: UserGifLibraryItem[]
  gifSelectionBlockedReason?: string | null
  onOpenPremiumUpsell?: () => void
  onSelect: (emoji: string) => void
  onSelectGif?: (gif: UserGifLibraryItem) => void
  onUploadGif?: (file: File) => Promise<void>
  premiumUnlocked?: boolean
}

export function EmojiPicker({
  canSelectGif = true,
  disabled = false,
  gifLibrary = [],
  gifSelectionBlockedReason = null,
  onOpenPremiumUpsell,
  onSelect,
  onSelectGif,
  onUploadGif,
  premiumUnlocked = false,
}: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState<'emoji' | 'gifs'>('emoji')
  const [gifError, setGifError] = useState('')
  const [gifUploadBusy, setGifUploadBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [showFullSet, setShowFullSet] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const gifInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setActiveTab('emoji')
        setGifError('')
        setShowFullSet(false)
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveTab('emoji')
        setGifError('')
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

  function resetPickerState() {
    setActiveTab('emoji')
    setGifError('')
    setShowFullSet(false)
  }

  function handleGifTabOpen() {
    if (!premiumUnlocked) {
      onOpenPremiumUpsell?.()
      return
    }

    setActiveTab('gifs')
    setGifError('')
    setShowFullSet(false)
  }

  async function handleGifUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !onUploadGif) return

    setGifError('')
    setGifUploadBusy(true)

    try {
      await onUploadGif(file)
    } catch (error) {
      setGifError(error instanceof Error ? error.message : 'Не удалось загрузить GIF.')
    } finally {
      setGifUploadBusy(false)
    }
  }

  function openGifFileDialog() {
    if (!premiumUnlocked) {
      onOpenPremiumUpsell?.()
      return
    }

    if (!canSelectGif) return
    gifInputRef.current?.click()
  }

  return (
    <div ref={rootRef} className="emoji-picker">
      <button
        type="button"
        className="soft-button composer-tool"
        onClick={() => {
          if (disabled) return
          setOpen((currentOpen) => {
            const nextOpen = !currentOpen
            if (nextOpen) return true
            resetPickerState()
            return false
          })
        }}
        aria-label="Смайлики и GIF"
        title="Смайлики и GIF"
        disabled={disabled}
      >
        <img src="/icons/smile.png" alt="" aria-hidden="true" className="emoji-picker-trigger-icon" />
      </button>
      {open ? (
        <div className="emoji-picker-popover" role="dialog" aria-label="Смайлики и GIF">
          <div className="emoji-picker-tabs">
            <button
              type="button"
              className={activeTab === 'emoji' ? 'emoji-picker-tab active' : 'emoji-picker-tab'}
              onClick={() => {
                setActiveTab('emoji')
                setGifError('')
              }}
            >
              Смайлики
            </button>
            <button
              type="button"
              className={activeTab === 'gifs' ? 'emoji-picker-tab active premium' : 'emoji-picker-tab premium'}
              onClick={handleGifTabOpen}
              aria-label={premiumUnlocked ? 'GIFs' : 'GIFs доступны в премиуме'}
              title={premiumUnlocked ? 'GIFs' : 'GIFs доступны в премиуме'}
            >
              <span>GIFs</span>
              <span className="premium-crown emoji-picker-tab-crown" aria-hidden="true">
                <img src="/icons/crown64.png" alt="" />
              </span>
            </button>
          </div>

          {activeTab === 'emoji' ? (
            <>
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
                          resetPickerState()
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
            </>
          ) : (
            <div className="emoji-picker-gifs">
              <input
                ref={gifInputRef}
                type="file"
                accept=".gif,image/gif"
                className="composer-attachment-input"
                onChange={handleGifUploadChange}
              />
              {gifSelectionBlockedReason ? (
                <div className="emoji-picker-gif-blocked">
                  <p>{gifSelectionBlockedReason}</p>
                </div>
              ) : gifLibrary.length === 0 ? (
                <div className="emoji-picker-gif-empty">
                  <button
                    type="button"
                    className="emoji-picker-gif-upload-button centered"
                    onClick={openGifFileDialog}
                    disabled={gifUploadBusy}
                  >
                    <span className="emoji-picker-gif-upload-plus" aria-hidden="true">+</span>
                    {gifUploadBusy ? 'Загружаем GIF...' : 'Загрузить GIF'}
                  </button>
                </div>
              ) : (
                <>
                  <div className="emoji-picker-gif-grid">
                    {gifLibrary.map((gif) => (
                      <button
                        key={gif.id}
                        type="button"
                        className="emoji-picker-gif-item"
                        onClick={() => {
                          if (!canSelectGif) return
                          onSelectGif?.(gif)
                          resetPickerState()
                          setOpen(false)
                        }}
                        disabled={!canSelectGif}
                        title={`${gif.fileName}\n${formatAttachmentSize(gif.size)}, ${formatAttachmentImageDimensions(gif.width, gif.height)}`}
                      >
                        <img src={gif.mediaUrl} alt={gif.fileName} className="emoji-picker-gif-image" />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="emoji-picker-gif-upload-button"
                    onClick={openGifFileDialog}
                    disabled={gifUploadBusy}
                  >
                    {gifUploadBusy ? 'Загружаем GIF...' : 'Добавить GIF'}
                  </button>
                </>
              )}
              {gifError ? <p className="emoji-picker-gif-error">{gifError}</p> : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
