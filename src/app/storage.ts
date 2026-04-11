import { accountsStorageKey, cookieConsentStorageKey, sessionStorageKey } from './constants'
import type { Account, CookieConsentChoice, Session } from './types'
import { normalizePremiumExpiry, normalizeQuietModeSettings } from './utils'

export function loadAccounts() {
  if (typeof window === 'undefined') return [] as Account[]

  const raw = window.localStorage.getItem(accountsStorageKey)
  if (!raw) return []

  try {
    return (JSON.parse(raw) as Account[]).map((account) => ({
      ...account,
      browserNotificationsEnabled: account.browserNotificationsEnabled !== false,
      darkThemeEnabled: Boolean(account.darkThemeEnabled),
      quietModeEnabled: Boolean(account.quietModeEnabled),
      quietModeSettings: normalizeQuietModeSettings(account.quietModeSettings),
      invisibilityAutoEnabled: Boolean(account.invisibilityAutoEnabled),
      invisibilityEnabled: Boolean(account.invisibilityEnabled ?? account.quietModeEnabled),
      soundsDisabled: Boolean(account.soundsDisabled),
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
      browserNotificationsEnabled: parsed.browserNotificationsEnabled !== false,
      darkThemeEnabled: Boolean(parsed.darkThemeEnabled),
      quietModeEnabled: Boolean(parsed.quietModeEnabled),
      quietModeSettings: normalizeQuietModeSettings(parsed.quietModeSettings),
      invisibilityAutoEnabled: Boolean(parsed.invisibilityAutoEnabled),
      invisibilityEnabled: Boolean(parsed.invisibilityEnabled ?? parsed.quietModeEnabled),
      soundsDisabled: Boolean(parsed.soundsDisabled),
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
