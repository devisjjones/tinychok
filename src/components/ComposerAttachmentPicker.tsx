import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

type ComposerAttachmentPickerProps = {
  attachmentName: string
  attachmentModes?: Array<'file' | 'photo'>
  disabled?: boolean
  onSelectMode: (mode: 'file' | 'photo') => void
  premiumUnlocked?: boolean
}

export function ComposerAttachmentPicker({
  attachmentName,
  attachmentModes = ['photo', 'file'],
  disabled = false,
  onSelectMode,
  premiumUnlocked = false,
}: ComposerAttachmentPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const availableAttachmentModes: Array<'file' | 'photo'> =
    attachmentModes.length > 0 ? attachmentModes : ['photo', 'file']
  const supportsPhotoAttachments = availableAttachmentModes.includes('photo')
  const supportsFileAttachments = availableAttachmentModes.includes('file')
  const singleAttachmentMode: 'file' | 'photo' | null =
    availableAttachmentModes.length === 1 ? availableAttachmentModes[0] : null

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

  useEffect(() => {
    if (disabled && open) {
      setOpen(false)
    }
  }, [disabled, open])

  function handleToggle(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) {
      return
    }
    if (singleAttachmentMode) {
      handleSelect(singleAttachmentMode)
      return
    }

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
        disabled={disabled}
        title={attachmentName || 'Добавить вложение'}
      >
        <img src="/icons/attach.png" alt="" />
      </button>
      {open && !singleAttachmentMode ? (
        <div className="composer-attachment-popover">
          {supportsPhotoAttachments ? (
            <button
              type="button"
              className="composer-attachment-option"
              onClick={() => handleSelect('photo')}
            >
              <span className="composer-attachment-option-icon" aria-hidden="true">
                <img src="/icons/picture.svg" alt="" />
              </span>
              <strong>Приложить фотографию</strong>
              <span className="composer-attachment-option-description">
                До 10 МБ. Поддерживаются JPG, PNG и WebP.
              </span>
            </button>
          ) : null}
          {supportsFileAttachments ? (
            <button
              type="button"
              className="composer-attachment-option"
              onClick={() => handleSelect('file')}
            >
              <span className="composer-attachment-option-icon" aria-hidden="true">
                <img src="/icons/videofile.png" alt="" />
              </span>
              <strong>Приложить файл</strong>
              <span className="composer-attachment-option-description">
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
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
