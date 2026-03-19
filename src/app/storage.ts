import { accountsStorageKey, cookieConsentStorageKey, sessionStorageKey } from './constants'
import type { Account, CookieConsentChoice, Session } from './types'
import { normalizePremiumExpiry } from './utils'

export function loadAccounts() {
  if (typeof window === 'undefined') return [] as Account[]

  const raw = window.localStorage.getItem(accountsStorageKey)
  if (!raw) return []

  try {
    return (JSON.parse(raw) as Account[]).map((account) => ({
      ...account,
      premium: account.premium ?? true,
      premiumExpiresAt: normalizePremiumExpiry(account.premium ?? true, account.premiumExpiresAt),
      blockedContactIds: account.blockedContactIds ?? [],
    }))
  } catch {
    return []
  }
}

export function loadSession() {
  if (typeof window === 'undefined') return null as Session | null

  const raw = window.localStorage.getItem(sessionStorageKey)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Session
    return {
      ...parsed,
      premium: parsed.premium ?? true,
      premiumExpiresAt: normalizePremiumExpiry(parsed.premium ?? true, parsed.premiumExpiresAt),
      blockedContactIds: parsed.blockedContactIds ?? [],
    }
  } catch {
    return null
  }
}

export function loadCookieConsent() {
  if (typeof window === 'undefined') return null as CookieConsentChoice | null

  const raw = window.localStorage.getItem(cookieConsentStorageKey)
  return raw === 'necessary' || raw === 'analytics' ? raw : null
}

export function saveCookieConsent(choice: CookieConsentChoice) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(cookieConsentStorageKey, choice)
}
