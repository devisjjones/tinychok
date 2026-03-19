import { useEffect, useState } from 'react'
import { loadCookieConsent, saveCookieConsent } from './storage'
import type { CookieConsentChoice } from './types'

function applyCookieConsent(choice: CookieConsentChoice | null) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.dataset.cookieConsent = choice ?? 'pending'
  root.dataset.cookieBanner = choice === null ? 'visible' : 'hidden'
  root.dataset.analyticsConsent = choice === 'analytics' ? 'granted' : 'denied'
}

export function useCookieConsent() {
  const [cookieConsent, setCookieConsent] = useState<CookieConsentChoice | null>(() => loadCookieConsent())

  useEffect(() => {
    applyCookieConsent(cookieConsent)
  }, [cookieConsent])

  function updateCookieConsent(nextChoice: CookieConsentChoice) {
    setCookieConsent(nextChoice)
    saveCookieConsent(nextChoice)

    if (typeof window !== 'undefined') {
      // Future analytics bootstrapping can listen to one event instead of polling storage.
      window.dispatchEvent(
        new CustomEvent('tinychok:cookie-consent-change', {
          detail: {
            analyticsAllowed: nextChoice === 'analytics',
            choice: nextChoice,
          },
        }),
      )
    }
  }

  return {
    analyticsConsentGranted: cookieConsent === 'analytics',
    cookieConsent,
    updateCookieConsent,
  }
}
