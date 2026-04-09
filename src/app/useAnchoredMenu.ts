import { useLayoutEffect, useRef, useState } from 'react'
import type { ActionAnchor } from './types'

function getActionAnchorRoot(element: HTMLElement) {
  return element.closest<HTMLElement>('.bubble-author-layout') ?? element
}

function getActionAnchorMeasureElement(root: HTMLElement, fallbackElement: HTMLElement) {
  return (
    root.querySelector<HTMLElement>('[data-bubble-measure="true"]') ??
    fallbackElement.querySelector<HTMLElement>('[data-bubble-measure="true"]') ??
    fallbackElement
  )
}

function getActionAnchor(element: HTMLElement, align: 'start' | 'end' = 'start'): ActionAnchor {
  const root = getActionAnchorRoot(element)
  const rect = root.getBoundingClientRect()
  const measureRect = getActionAnchorMeasureElement(root, element).getBoundingClientRect()

  return {
    top: rect.top,
    bottom: rect.bottom,
    left: measureRect.left,
    right: measureRect.right,
    width: measureRect.width,
    align,
  }
}

function getOverlaySafeBottom(viewportInset: number) {
  const composerSelectors = ['.composer', '.composer-disabled', '.settings-support-composer', '.channel-room-footer']
  const candidateTops = composerSelectors.flatMap((selector) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector))
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.height > 0 && rect.width > 0 && rect.top < window.innerHeight && rect.bottom > 0)
      .map((rect) => Math.max(viewportInset, rect.top - 8)),
  )

  return candidateTops.length > 0
    ? Math.min(window.innerHeight - viewportInset, ...candidateTops)
    : window.innerHeight - viewportInset
}

function getDesiredActionOverlayTop(anchor: ActionAnchor) {
  const viewportInset = 16
  const safeBottom = getOverlaySafeBottom(viewportInset)
  const overlayHeight = Math.max(0, anchor.bottom - anchor.top)
  const maxHeight = Math.max(0, safeBottom - viewportInset)
  const boundedHeight = Math.min(overlayHeight, maxHeight)

  return Math.min(
    Math.max(viewportInset, anchor.top),
    Math.max(viewportInset, safeBottom - boundedHeight),
  )
}

export function scheduleActionAnchor(
  element: HTMLElement,
  align: 'start' | 'end',
  setAnchor: (anchor: ActionAnchor) => void,
) {
  window.requestAnimationFrame(() => {
    if (!element.isConnected) return
    const nextAnchor = getActionAnchor(element, align)
    const desiredTop = getDesiredActionOverlayTop(nextAnchor)
    const scrollDelta = nextAnchor.top - desiredTop
    const scrollContainer = element.closest<HTMLElement>('.message-feed')

    if (scrollContainer && Math.abs(scrollDelta) >= 1) {
      scrollContainer.scrollTop += scrollDelta
      window.requestAnimationFrame(() => {
        if (!element.isConnected) return
        setAnchor(getActionAnchor(element, align))
      })
      return
    }

    setAnchor(nextAnchor)
  })
}

function getAnchoredMenuStyle(anchor: ActionAnchor, menuWidth: number, menuHeight: number) {
  const menuOffset = 16
  const top =
    anchor.bottom + menuOffset + menuHeight <= window.innerHeight - 16
      ? anchor.bottom + menuOffset
      : Math.max(16, anchor.top - menuHeight - menuOffset)
  const preferredLeft = anchor.align === 'end' ? anchor.right - menuWidth : anchor.left
  const left = Math.min(window.innerWidth - menuWidth - 16, Math.max(16, preferredLeft))

  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${menuWidth}px`,
  }
}

export function useAnchoredMenu(
  anchor: ActionAnchor | null,
  menuWidth: number,
  fallbackHeight: number,
) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuHeight, setMenuHeight] = useState(fallbackHeight)

  useLayoutEffect(() => {
    if (anchor === null) return

    const menuNode = menuRef.current
    if (menuNode === null) return

    const measureMenu = () => {
      const nextHeight = menuNode.offsetHeight || fallbackHeight

      setMenuHeight((currentHeight) =>
        Math.abs(currentHeight - nextHeight) < 1 ? currentHeight : nextHeight,
      )
    }

    measureMenu()

    const resizeObserver = new ResizeObserver(measureMenu)
    resizeObserver.observe(menuNode)
    window.addEventListener('resize', measureMenu)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', measureMenu)
    }
  }, [anchor, fallbackHeight])

  return {
    menuRef,
    style: anchor ? getAnchoredMenuStyle(anchor, menuWidth, menuHeight) : undefined,
  }
}
