import { accountsStorageKey, cookieConsentStorageKey, sessionStorageKey } from './constants'
import type { Account, CookieConsentChoice, Session } from './types'
import { normalizePremiumExpiry, normalizeQuietModeSettings } from './utils'

const persistedAuthSchemaVersion = 2
const persistedAuthSchemaStorageKey = `${sessionStorageKey}:schema-version`

export type PersistedAuthState = {
  accounts: Account[]
  session: Session | null
}

function canUseLocalStorage() {
  return typeof window !== 'undefined'
}

function normalizeStoredAccount(account: Account): Account {
  return {
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
  }
}

function normalizeStoredSession(session: Session): Session {
  return {
    ...session,
    browserNotificationsEnabled: session.browserNotificationsEnabled !== false,
    darkThemeEnabled: Boolean(session.darkThemeEnabled),
    quietModeEnabled: Boolean(session.quietModeEnabled),
    quietModeSettings: normalizeQuietModeSettings(session.quietModeSettings),
    invisibilityAutoEnabled: Boolean(session.invisibilityAutoEnabled),
    invisibilityEnabled: Boolean(session.invisibilityEnabled ?? session.quietModeEnabled),
    soundsDisabled: Boolean(session.soundsDisabled),
    premium: session.premium ?? true,
    premiumExpiresAt: normalizePremiumExpiry(session.premium ?? true, session.premiumExpiresAt),
    blockedContactIds: session.blockedContactIds ?? [],
  }
}

function clearPersistedAuthStorage() {
  if (!canUseLocalStorage()) return

  window.localStorage.removeItem(accountsStorageKey)
  window.localStorage.removeItem(sessionStorageKey)
}

function ensurePersistedAuthStorageSchema() {
  if (!canUseLocalStorage()) {
    return
  }

  const storedVersion = Number.parseInt(
    window.localStorage.getItem(persistedAuthSchemaStorageKey) ?? '',
    10,
  )

  if (storedVersion === persistedAuthSchemaVersion) {
    return
  }

  clearPersistedAuthStorage()
  window.localStorage.setItem(
    persistedAuthSchemaStorageKey,
    String(persistedAuthSchemaVersion),
  )
}

export function loadAccounts() {
  if (!canUseLocalStorage()) return [] as Account[]
  ensurePersistedAuthStorageSchema()

  const raw = window.localStorage.getItem(accountsStorageKey)
  if (!raw) return []

  try {
    return (JSON.parse(raw) as Account[]).map(normalizeStoredAccount)
  } catch {
    window.localStorage.removeItem(accountsStorageKey)
    return []
  }
}

export function loadSession() {
  if (!canUseLocalStorage()) return null as Session | null
  ensurePersistedAuthStorageSchema()

  const raw = window.localStorage.getItem(sessionStorageKey)
  if (!raw) return null

  try {
    return normalizeStoredSession(JSON.parse(raw) as Session)
  } catch {
    window.localStorage.removeItem(sessionStorageKey)
    return null
  }
}

export function loadPersistedAuthState(): PersistedAuthState {
  ensurePersistedAuthStorageSchema()
  return {
    accounts: loadAccounts(),
    session: loadSession(),
  }
}

export function saveAccounts(accounts: Account[]) {
  if (!canUseLocalStorage()) return

  ensurePersistedAuthStorageSchema()
  window.localStorage.setItem(accountsStorageKey, JSON.stringify(accounts))
}

export function saveSession(session: Session | null) {
  if (!canUseLocalStorage()) return

  ensurePersistedAuthStorageSchema()
  if (session) {
    window.localStorage.setItem(sessionStorageKey, JSON.stringify(session))
    return
  }

  window.localStorage.removeItem(sessionStorageKey)
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
