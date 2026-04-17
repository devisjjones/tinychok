const mobileKeyboardInsetActivationThresholdPx = 120
const mobileKeyboardViewportBottomGapPx = 20

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

export function resolveMobileViewportRevealDelta(options: {
  elementBottom: number
  visualViewportHeight: number
  visualViewportOffsetTop?: number
  viewportBottomGap?: number
}) {
  const elementBottom = Number.isFinite(options.elementBottom) ? options.elementBottom : 0
  const visualViewportHeight = Number.isFinite(options.visualViewportHeight)
    ? options.visualViewportHeight
    : 0
  const visualViewportOffsetTop = Number.isFinite(options.visualViewportOffsetTop)
    ? (options.visualViewportOffsetTop ?? 0)
    : 0
  const viewportBottomGap = Number.isFinite(options.viewportBottomGap)
    ? (options.viewportBottomGap ?? mobileKeyboardViewportBottomGapPx)
    : mobileKeyboardViewportBottomGapPx

  if (elementBottom <= 0 || visualViewportHeight <= 0) {
    return 0
  }

  const safeViewportBottom = visualViewportOffsetTop + visualViewportHeight - viewportBottomGap
  return Math.max(0, Math.ceil(elementBottom - safeViewportBottom))
}
