import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

type ComposerAttachmentPickerProps = {
  attachmentName: string
  onSelectMode: (mode: 'file' | 'photo') => void
  premiumUnlocked?: boolean
}

export function ComposerAttachmentPicker({
  attachmentName,
  onSelectMode,
  premiumUnlocked = false,
}: ComposerAttachmentPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function handleToggle(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    setOpen((current) => !current)
  }

  function handleSelect(mode: 'file' | 'photo') {
    setOpen(false)
    onSelectMode(mode)
  }

  return (
    <div ref={rootRef} className="composer-attachment-picker">
      <button
        type="button"
        className={attachmentName ? 'soft-button composer-tool active' : 'soft-button composer-tool'}
        onClick={handleToggle}
        aria-label={attachmentName || 'Добавить вложение'}
        title={attachmentName || 'Добавить вложение'}
      >
        <img src="/icons/attach.png" alt="" />
      </button>
      {open ? (
        <div className="composer-attachment-popover">
          <button
            type="button"
            className="composer-attachment-option"
            onClick={() => handleSelect('photo')}
          >
            <strong>Приложить фотографию</strong>
            <span>До 10 МБ. Поддерживаются JPG, PNG и WebP.</span>
          </button>
          <button
            type="button"
            className="composer-attachment-option"
            onClick={() => handleSelect('file')}
          >
            <strong>Приложить файл</strong>
            <span>
              {premiumUnlocked
                ? 'Документы, архивы и видео до 200 МБ.'
                : (
                  <>
                    {'Документы, архивы и видео до 10 МБ. '}
                    <span className="composer-attachment-inline-premium">
                      <span>С премиумом</span>
                      <span className="premium-crown composer-attachment-premium-crown" aria-hidden="true">
                        <img src="/icons/crown64.png" alt="" />
                      </span>
                    </span>
                    {' можно до 200 МБ.'}
                  </>
                )}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
