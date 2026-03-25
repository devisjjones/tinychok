import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { messageGifUploadMaxSizeBytes } from '../app/constants'
import { duplicateUserGifMessage } from '../app/gifLibrary'
import type { UserGifLibraryItem } from '../app/types'
import { compactEmojiCategories, fullEmojiCategories } from '../shared/emoji'
import { formatAttachmentImageDimensions, formatAttachmentSize } from '../app/utils'

type EmojiPickerProps = {
  canSelectGif?: boolean
  disabled?: boolean
  gifLibrary?: UserGifLibraryItem[]
  gifSelectionBlockedReason?: string | null
  onDeleteGif?: (gif: UserGifLibraryItem) => Promise<void>
  onOpenPremiumUpsell?: () => void
  onSearchGifs?: (query: string) => Promise<UserGifLibraryItem[]>
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
  onDeleteGif,
  onOpenPremiumUpsell,
  onSearchGifs,
  onSelect,
  onSelectGif,
  onUploadGif,
  premiumUnlocked = false,
}: EmojiPickerProps) {
  const gifUploadHint = `Только GIF, до ${Math.round(messageGifUploadMaxSizeBytes / (1024 * 1024))} МБ.`
  const [activeTab, setActiveTab] = useState<'emoji' | 'gifs'>('emoji')
  const [gifError, setGifError] = useState('')
  const [gifNotice, setGifNotice] = useState('')
  const [gifDeletingId, setGifDeletingId] = useState<string | null>(null)
  const [gifSearchBusy, setGifSearchBusy] = useState(false)
  const [gifSearchQuery, setGifSearchQuery] = useState('')
  const [gifSearchResults, setGifSearchResults] = useState<UserGifLibraryItem[]>([])
  const [gifUploadBusy, setGifUploadBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [showFullSet, setShowFullSet] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const gifInputRef = useRef<HTMLInputElement | null>(null)
  const gifSearchRequestTokenRef = useRef(0)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setActiveTab('emoji')
        setGifError('')
        setGifNotice('')
        setShowFullSet(false)
        setGifSearchQuery('')
        setGifSearchResults([])
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveTab('emoji')
        setGifError('')
        setGifNotice('')
        setShowFullSet(false)
        setGifSearchQuery('')
        setGifSearchResults([])
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
    setGifNotice('')
    setGifSearchBusy(false)
    setGifSearchQuery('')
    setGifSearchResults([])
    setShowFullSet(false)
  }

  function handleGifTabOpen() {
    if (!premiumUnlocked) {
      onOpenPremiumUpsell?.()
      return
    }

    setActiveTab('gifs')
    setGifError('')
    setGifNotice('')
    setShowFullSet(false)
  }

  useEffect(() => {
    if (!gifNotice) return

    const timeoutId = window.setTimeout(() => {
      setGifNotice('')
    }, 2200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [gifNotice])

  useEffect(() => {
    if (!open || activeTab !== 'gifs') return

    const query = gifSearchQuery.trim()
    const requestToken = gifSearchRequestTokenRef.current + 1
    gifSearchRequestTokenRef.current = requestToken

    if (!query || !onSearchGifs || !premiumUnlocked) {
      setGifSearchBusy(false)
      setGifSearchResults([])
      return
    }

    setGifSearchBusy(true)

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const items = await onSearchGifs(query)
          if (gifSearchRequestTokenRef.current !== requestToken) return
          setGifSearchResults(items)
          setGifError('')
        } catch (error) {
          if (gifSearchRequestTokenRef.current !== requestToken) return
          setGifSearchResults([])
          setGifError(error instanceof Error ? error.message : 'Не удалось выполнить поиск GIF.')
        } finally {
          if (gifSearchRequestTokenRef.current === requestToken) {
            setGifSearchBusy(false)
          }
        }
      })()
    }, 180)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeTab, gifSearchQuery, onSearchGifs, open, premiumUnlocked])

  async function handleGifUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !onUploadGif) return

    setGifError('')
    setGifUploadBusy(true)

    try {
      await onUploadGif(file)
      resetPickerState()
      setOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить GIF.'
      if (message === duplicateUserGifMessage) {
        setGifNotice(message)
        setGifError('')
      } else {
        setGifError(message)
      }
    } finally {
      setGifUploadBusy(false)
    }
  }

  async function handleGifDelete(gif: UserGifLibraryItem) {
    if (!onDeleteGif || gifDeletingId) return

    setGifDeletingId(gif.id)
    setGifError('')

    try {
      await onDeleteGif(gif)
      setGifSearchResults((currentResults) => currentResults.filter((item) => item.mediaUrl !== gif.mediaUrl))
    } catch (error) {
      setGifError(error instanceof Error ? error.message : 'Не удалось удалить GIF.')
    } finally {
      setGifDeletingId(null)
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
              {!premiumUnlocked ? (
                <span className="premium-crown emoji-picker-tab-crown" aria-hidden="true">
                  <img src="/icons/crown64.png" alt="" />
                </span>
              ) : null}
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
              {gifNotice ? <div className="emoji-picker-gif-toast">{gifNotice}</div> : null}
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
              ) : (
                <>
                  <label className="emoji-picker-gif-search">
                    <span className="emoji-picker-gif-search-label">Поиск GIF в Тайничке</span>
                    <input
                      type="search"
                      className="emoji-picker-gif-search-input"
                      placeholder="Например: it's fine"
                      value={gifSearchQuery}
                      onChange={(event) => {
                        setGifSearchQuery(event.target.value)
                        setGifError('')
                      }}
                    />
                  </label>
                  {gifSearchQuery.trim() ? (
                    gifSearchBusy ? (
                      <div className="emoji-picker-gif-empty">
                        <p>Ищем GIF в Тайничке...</p>
                      </div>
                    ) : gifSearchResults.length > 0 ? (
                      <>
                        <p className="emoji-picker-gif-section-title">Найдено в Тайничке</p>
                        <div className="emoji-picker-gif-grid">
                          {gifSearchResults.map((gif) => (
                            <button
                              key={`search-${gif.mediaUrl}`}
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
                      </>
                    ) : (
                      <div className="emoji-picker-gif-empty">
                        <p>По запросу ничего не найдено.</p>
                      </div>
                    )
                  ) : gifLibrary.length === 0 ? (
                <div className="emoji-picker-gif-empty">
                  <div className="emoji-picker-gif-upload-actions">
                    <button
                      type="button"
                      className="emoji-picker-gif-upload-button centered"
                      onClick={openGifFileDialog}
                      disabled={gifUploadBusy}
                    >
                      <span className="emoji-picker-gif-upload-plus" aria-hidden="true">+</span>
                      {gifUploadBusy ? 'Загружаем GIF...' : 'Загрузить GIF'}
                    </button>
                    <p className="emoji-picker-gif-upload-hint">{gifUploadHint}</p>
                  </div>
                </div>
              ) : (
                    <>
                      <p className="emoji-picker-gif-section-title">Мои GIF</p>
                      <div className="emoji-picker-gif-grid">
                        {gifLibrary.map((gif) => (
                          <div key={gif.id} className="emoji-picker-gif-card">
                            <button
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
                            {onDeleteGif ? (
                              <button
                                type="button"
                                className="emoji-picker-gif-delete"
                                aria-label={`Удалить GIF ${gif.fileName}`}
                                title="Удалить GIF"
                                disabled={gifDeletingId === gif.id}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleGifDelete(gif)
                                }}
                              >
                                <img src="/icons/cancel.png" alt="" aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {gifLibrary.length > 0 ? (
                    <div className="emoji-picker-gif-upload-actions">
                      <button
                        type="button"
                        className="emoji-picker-gif-upload-button"
                        onClick={openGifFileDialog}
                        disabled={gifUploadBusy}
                      >
                        {gifUploadBusy ? 'Загружаем GIF...' : 'Добавить GIF'}
                      </button>
                      <p className="emoji-picker-gif-upload-hint">{gifUploadHint}</p>
                    </div>
                  ) : null}
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
