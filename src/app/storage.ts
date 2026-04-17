import { accountsStorageKey, cookieConsentStorageKey, sessionStorageKey } from './constants'
import type { AppSnapshot } from '../shared/backend'
import type { Account, CookieConsentChoice, Session } from './types'
import { normalizePremiumExpiry, normalizeQuietModeSettings } from './utils'

const persistedAuthSchemaVersion = 2
const persistedAuthSchemaStorageKey = `${sessionStorageKey}:schema-version`
const persistedRoomCollectionsStorageKey = `${sessionStorageKey}:room-collections`

export type PersistedRoomCollections = Pick<
  AppSnapshot,
  | 'channels'
  | 'chats'
  | 'contactRequests'
  | 'discoveryResults'
  | 'groups'
  | 'outgoingContactRequests'
  | 'subscriptionChannels'
  | 'supportTicketCooldownUntil'
  | 'supportTickets'
  | 'supportUnreadCount'
  | 'threadInbox'
> & {
  identifier: string
  savedAt: string
}

export type PersistedAuthState = {
  accounts: Account[]
  roomCollections: PersistedRoomCollections | null
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
    premiumBadgeHidden: Boolean(account.premiumBadgeHidden),
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
    premiumBadgeHidden: Boolean(session.premiumBadgeHidden),
    premium: session.premium ?? true,
    premiumExpiresAt: normalizePremiumExpiry(session.premium ?? true, session.premiumExpiresAt),
    blockedContactIds: session.blockedContactIds ?? [],
  }
}

function trimPersistedRoomMessage<
  T extends AppSnapshot['chats'][number]['messages'][number] | AppSnapshot['groups'][number]['messages'][number],
>(message: T): T {
  return {
    ...message,
    threadComments: undefined,
  }
}

function trimPersistedChannelPost<T extends AppSnapshot['subscriptionChannels'][number]['posts'][number]>(
  post: T,
): T {
  return {
    ...post,
    threadComments: undefined,
  }
}

function buildPersistedRoomCollections(snapshot: AppSnapshot): PersistedRoomCollections {
  return {
    channels: snapshot.channels,
    chats: snapshot.chats.map((chat) => ({
      ...chat,
      historyHasMore: false,
      messages: chat.messages.length > 0 ? [trimPersistedRoomMessage(chat.messages.at(-1)!)] : [],
      pinnedMessage: undefined,
    })),
    contactRequests: snapshot.contactRequests,
    discoveryResults: snapshot.discoveryResults,
    groups: snapshot.groups.map((group) => ({
      ...group,
      messages: group.messages.length > 0 ? [trimPersistedRoomMessage(group.messages.at(-1)!)] : [],
    })),
    identifier: snapshot.session.identifier,
    outgoingContactRequests: snapshot.outgoingContactRequests,
    savedAt: new Date().toISOString(),
    subscriptionChannels: snapshot.subscriptionChannels.map((channel) => ({
      ...channel,
      posts: channel.posts.length > 0 ? [trimPersistedChannelPost(channel.posts.at(-1)!)] : [],
    })),
    supportTicketCooldownUntil: snapshot.supportTicketCooldownUntil,
    supportTickets: snapshot.supportTickets.map((ticket) => ({
      ...ticket,
      comments: [],
    })),
    supportUnreadCount: Math.max(0, Math.floor(snapshot.supportUnreadCount ?? 0)),
    threadInbox: snapshot.threadInbox ?? [],
  }
}

function clearPersistedAuthStorage() {
  if (!canUseLocalStorage()) return

  window.localStorage.removeItem(accountsStorageKey)
  window.localStorage.removeItem(persistedRoomCollectionsStorageKey)
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

export function loadPersistedRoomCollections() {
  if (!canUseLocalStorage()) return null as PersistedRoomCollections | null
  ensurePersistedAuthStorageSchema()

  const raw = window.localStorage.getItem(persistedRoomCollectionsStorageKey)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as PersistedRoomCollections
    return typeof parsed?.identifier === 'string' && parsed.identifier.length > 0 ? parsed : null
  } catch {
    window.localStorage.removeItem(persistedRoomCollectionsStorageKey)
    return null
  }
}

export function loadPersistedAuthState(): PersistedAuthState {
  ensurePersistedAuthStorageSchema()
  return {
    accounts: loadAccounts(),
    roomCollections: loadPersistedRoomCollections(),
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

export function savePersistedRoomCollections(snapshot: AppSnapshot | null) {
  if (!canUseLocalStorage()) return

  ensurePersistedAuthStorageSchema()
  if (snapshot) {
    window.localStorage.setItem(
      persistedRoomCollectionsStorageKey,
      JSON.stringify(buildPersistedRoomCollections(snapshot)),
    )
    return
  }

  window.localStorage.removeItem(persistedRoomCollectionsStorageKey)
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
