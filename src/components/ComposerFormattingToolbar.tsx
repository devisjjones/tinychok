import type { RefObject } from 'react'
import type { ComposerTextInputElement, ComposerTextMarkup } from '../app/utils'
import { wrapComposerSelectionWithMarkup } from '../app/utils'

type ComposerFormattingToolbarProps = {
  inputRef: RefObject<ComposerTextInputElement | null>
  onChange: (value: string) => void
  value: string
}

const toolbarButtons: ReadonlyArray<{
  ariaLabel: string
  label: string
  markup: ComposerTextMarkup
  title: string
}> = [
  {
    markup: 'bold',
    label: 'B',
    title: 'Жирный',
    ariaLabel: 'Сделать выделенный текст жирным',
  },
  {
    markup: 'italic',
    label: 'I',
    title: 'Курсив',
    ariaLabel: 'Сделать выделенный текст курсивом',
  },
  {
    markup: 'underline',
    label: 'U',
    title: 'Подчеркнутый',
    ariaLabel: 'Сделать выделенный текст подчеркнутым',
  },
  {
    markup: 'strikethrough',
    label: 'S',
    title: 'Перечеркнутый',
    ariaLabel: 'Сделать выделенный текст перечеркнутым',
  },
]

export function ComposerFormattingToolbar({
  inputRef,
  onChange,
  value,
}: ComposerFormattingToolbarProps) {
  return (
    <div className="composer-format-toolbar" aria-label="Форматирование текста">
      {toolbarButtons.map((button) => (
        <button
          key={button.markup}
          type="button"
          className={`soft-button composer-format-button composer-format-button-${button.markup}`}
          aria-label={button.ariaLabel}
          title={button.title}
          onMouseDown={(event) => {
            // Keep the current text selection inside the composer when toolbar buttons are clicked,
            // otherwise the browser will move focus to the button and the formatting command loses its range.
            event.preventDefault()
          }}
          onClick={() => {
            wrapComposerSelectionWithMarkup(inputRef.current, value, button.markup, onChange)
          }}
        >
          <span aria-hidden="true">{button.label}</span>
        </button>
      ))}
    </div>
  )
}
