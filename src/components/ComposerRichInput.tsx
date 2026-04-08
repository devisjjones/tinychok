import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ClipboardEventHandler,
  type FocusEventHandler,
  type KeyboardEventHandler,
} from 'react'
import { extractComposerMarkupFromEditable, renderComposerMarkupToHtml } from '../app/utils'

type ComposerRichInputProps = {
  className?: string
  onChange: (value: string) => void
  onFocus?: FocusEventHandler<HTMLDivElement>
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  onPaste?: ClipboardEventHandler<HTMLDivElement>
  placeholder: string
  value: string
}

export const ComposerRichInput = forwardRef<HTMLDivElement, ComposerRichInputProps>(
  function ComposerRichInput(
    { className = '', onChange, onFocus, onKeyDown, onPaste, placeholder, value },
    forwardedRef,
  ) {
    const inputRef = useRef<HTMLDivElement | null>(null)

    useImperativeHandle(forwardedRef, () => inputRef.current!, [])

    useLayoutEffect(() => {
      const input = inputRef.current
      if (!input) return

      const currentMarkup = extractComposerMarkupFromEditable(input)
      if (currentMarkup === value) {
        if (!value && input.innerHTML !== '') {
          input.innerHTML = ''
        }
        return
      }

      const nextHtml = renderComposerMarkupToHtml(value)
      if (input.innerHTML !== nextHtml) {
        input.innerHTML = nextHtml
      }
    }, [value])

    return (
      <div
        ref={inputRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        spellCheck
        data-placeholder={placeholder}
        className={`composer-editor-surface composer-rich-input${className ? ` ${className}` : ''}`}
        onFocus={onFocus}
        onInput={() => {
          const input = inputRef.current
          if (!input) return

          const nextValue = extractComposerMarkupFromEditable(input)
          if (!nextValue && input.innerHTML !== '') {
            input.innerHTML = ''
          }
          if (nextValue !== value) {
            onChange(nextValue)
          }
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
    )
  },
)
