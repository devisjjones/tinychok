const mobileKeyboardInsetActivationThresholdPx = 120

export function resolveMobileViewportKeyboardInset(options: {
  layoutViewportHeight: number
  visualViewportHeight: number
  visualViewportOffsetTop?: number
}) {
  const layoutViewportHeight = Number.isFinite(options.layoutViewportHeight)
    ? options.layoutViewportHeight
    : 0
  const visualViewportHeight = Number.isFinite(options.visualViewportHeight)
    ? options.visualViewportHeight
    : layoutViewportHeight
  const visualViewportOffsetTop = Number.isFinite(options.visualViewportOffsetTop)
    ? (options.visualViewportOffsetTop ?? 0)
    : 0

  if (layoutViewportHeight <= 0 || visualViewportHeight <= 0) {
    return 0
  }

  const keyboardInset = Math.round(
    Math.max(0, layoutViewportHeight - visualViewportHeight - visualViewportOffsetTop),
  )

  return keyboardInset >= mobileKeyboardInsetActivationThresholdPx ? keyboardInset : 0
}
