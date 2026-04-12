import { useEffect } from 'react'

export function useDocumentTheme(darkThemeEnabled: boolean) {
  useEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    const body = document.body
    const themeColorMeta = document.querySelector('meta[name="theme-color"]')
    const nextTheme = darkThemeEnabled ? 'dark' : 'light'

    root.dataset.theme = nextTheme
    body.dataset.theme = nextTheme
    if (themeColorMeta instanceof HTMLMetaElement) {
      themeColorMeta.content = darkThemeEnabled ? '#17181c' : '#f7efe5'
    }
  }, [darkThemeEnabled])
}
