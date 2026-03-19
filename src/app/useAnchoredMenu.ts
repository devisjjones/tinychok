import { useLayoutEffect, useRef, useState } from 'react'
import type { ActionAnchor } from './types'

function getActionAnchor(element: HTMLElement, align: 'start' | 'end' = 'start'): ActionAnchor {
  const rect = element.getBoundingClientRect()

  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    align,
  }
}

export function scheduleActionAnchor(
  element: HTMLElement,
  align: 'start' | 'end',
  setAnchor: (anchor: ActionAnchor) => void,
) {
  window.requestAnimationFrame(() => {
    if (!element.isConnected) return
    setAnchor(getActionAnchor(element, align))
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
