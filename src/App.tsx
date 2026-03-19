import { type ChangeEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  accountNameMaxFontSize,
  accountNameMinFontSize,
  accountStatusMaxFontSize,
  accountStatusMinFontSize,
  accountsStorageKey,
  channelActionMenuHeight,
  channelActionMenuWidth,
  channelAvatarTones,
  channelBlockedMenuHeight,
  channelDescriptionMaxLength,
  channelTitleMaxLength,
  chatActionMenuHeight,
  chatActionMenuWidth,
  displayNameFieldMaxLength,
  nicknameFieldMaxLength,
  quickFilters,
  sessionStorageKey,
  statusFieldMaxLength,
  surnameFieldMaxLength,
} from './app/constants'
import {
  discoveryResults,
  initialChannels,
  initialChats,
  initialGroups,
  initialSubscribedChannels,
} from './app/mockData'
import { loadAccounts, loadSession } from './app/storage'
import type {
  Account,
  ActionAnchor,
  AuthStep,
  Channel,
  ChannelsView,
  Message,
  ReplyTarget,
  Session,
  SettingsView,
  StageView,
  TopListView,
} from './app/types'
import { scheduleActionAnchor, useAnchoredMenu } from './app/useAnchoredMenu'
import {
  formatChannelAvatarLabel,
  formatContactStatus,
  formatGroupPreview,
  formatGroupTime,
  formatNowTime,
  formatPreview,
  formatSessionName,
  getChannelVisibilityDescription,
  getChannelVisibilityLabel,
  getNextChannelVisibility,
  getPremiumDaysLeft,
  hasActivePremium,
  isPhoneQuery,
  makeDraftChannel,
  makePremiumExpiry,
  matchesQuery,
  moveUnreadItemsFirst,
  normalizeIdentifier,
  normalizeNickname,
  normalizePremiumExpiry,
  sanitizeChannelDescription,
  sanitizeChannelTitle,
  sanitizePersonField,
  sanitizeStatusField,
} from './app/utils'
import { AuthScreen } from './screens/AuthScreen'
import { ConfirmLogoutScreen } from './screens/ConfirmLogoutScreen'
import { DirectChatRoom } from './rooms/DirectChatRoom'
import { GroupRoom } from './rooms/GroupRoom'
import { SubscriptionChannelRoom } from './rooms/SubscriptionChannelRoom'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import { useCookieConsent } from './app/useCookieConsent'
import './App.css'

function App() {
  const messageFeedRef = useRef<HTMLDivElement | null>(null)
  const accountNameRef = useRef<HTMLHeadingElement | null>(null)
  const accountStatusRef = useRef<HTMLParagraphElement | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const channelsPanelRef = useRef<HTMLDivElement | null>(null)
  const channelAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const channelAvatarObjectUrlsRef = useRef(new Set<string>())
  const [chats, setChats] = useState(initialChats)
  const [channels, setChannels] = useState(initialChannels)
  const [activeChatId, setActiveChatId] = useState<number | null>(null)
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null)
  const [retainedAllChatId, setRetainedAllChatId] = useState<number | null>(null)
  const [retainedFavoriteChatId, setRetainedFavoriteChatId] = useState<number | null>(null)
  const [retainedSubscriptionChannelId, setRetainedSubscriptionChannelId] = useState<number | null>(
    null,
  )
  const [retainedGroupId, setRetainedGroupId] = useState<number | null>(null)
  const [activeChannelId, setActiveChannelId] = useState<number | null>(initialChannels[0]?.id ?? null)
  const [stageView, setStageView] = useState<StageView>('main')
  const [channelsView, setChannelsView] = useState<ChannelsView>('list')
  const [settingsView, setSettingsView] = useState<SettingsView>('profile')
  const [query, setQuery] = useState('')
  const [chatMessageDrafts, setChatMessageDrafts] = useState<Record<number, string>>({})
  const [groupMessageDrafts, setGroupMessageDrafts] = useState<Record<number, string>>({})
  const [chatAttachmentNames, setChatAttachmentNames] = useState<Record<number, string>>({})
  const [activeFilter, setActiveFilter] = useState('Все')
  const [searchOpen, setSearchOpen] = useState(false)
  const [quietMode, setQuietMode] = useState(false)
  const [authStep, setAuthStep] = useState<AuthStep>('phone')
  const [displayName, setDisplayName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const [bottomSection, setBottomSection] = useState<'chats' | 'contacts'>('chats')
  const [chatActionsOpen, setChatActionsOpen] = useState(false)
  const [blockedActionChatId, setBlockedActionChatId] = useState<number | null>(null)
  const [premiumGiftChatId, setPremiumGiftChatId] = useState<number | null>(null)
  const [messageActionMessageId, setMessageActionMessageId] = useState<number | null>(null)
  const [forwardingMessageId, setForwardingMessageId] = useState<number | null>(null)
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const [confirmingDeleteHistoryChatId, setConfirmingDeleteHistoryChatId] = useState<number | null>(
    null,
  )
  const [confirmingDeleteContactChatId, setConfirmingDeleteContactChatId] = useState<number | null>(
    null,
  )
  const [confirmingDeleteMessageId, setConfirmingDeleteMessageId] = useState<number | null>(null)
  const [confirmingDeleteChannelId, setConfirmingDeleteChannelId] = useState<number | null>(null)
  const [transferringChannelId, setTransferringChannelId] = useState<number | null>(null)
  const [channelTransferTargetChatId, setChannelTransferTargetChatId] = useState<number | null>(null)
  const [channelTransferCode, setChannelTransferCode] = useState('')
  const [channelTransferError, setChannelTransferError] = useState('')
  const [channelTransferSearch, setChannelTransferSearch] = useState('')
  const [creatingChannelTitle, setCreatingChannelTitle] = useState('')
  const [creatingChannelDirectLink, setCreatingChannelDirectLink] = useState('')
  const [creatingChannelDescription, setCreatingChannelDescription] = useState('')
  const [creatingChannelAvatarTone, setCreatingChannelAvatarTone] = useState(channelAvatarTones[0])
  const [uploadingChannelAvatarId, setUploadingChannelAvatarId] = useState<number | null>(null)
  const [editingChannelTitleId, setEditingChannelTitleId] = useState<number | null>(null)
  const [editingChannelTitleValue, setEditingChannelTitleValue] = useState('')
  const [topListView, setTopListView] = useState<TopListView>('none')
  const [copyHintText, setCopyHintText] = useState('')
  const [subscriptionChannels, setSubscriptionChannels] = useState(initialSubscribedChannels)
  const [groups, setGroups] = useState(initialGroups)
  const [activeSubscriptionChannelId, setActiveSubscriptionChannelId] = useState<number | null>(null)
  const [activeSubscriptionPostId, setActiveSubscriptionPostId] = useState<number | null>(null)
  const [activeGroupMessageId, setActiveGroupMessageId] = useState<number | null>(null)
  const [forwardingSubscriptionPostText, setForwardingSubscriptionPostText] = useState('')
  const [forwardingGroupMessageText, setForwardingGroupMessageText] = useState('')
  const [messageActionAnchor, setMessageActionAnchor] = useState<ActionAnchor | null>(null)
  const [subscriptionPostActionAnchor, setSubscriptionPostActionAnchor] = useState<ActionAnchor | null>(
    null,
  )
  const [groupMessageActionAnchor, setGroupMessageActionAnchor] = useState<ActionAnchor | null>(null)
  const { cookieConsent, updateCookieConsent } = useCookieConsent()

  const blockedContactIds = session?.blockedContactIds ?? []
  const availableChats = chats.filter((chat) => !blockedContactIds.includes(chat.id))
  const blockedChats = chats.filter((chat) => blockedContactIds.includes(chat.id))
  const visibleRetainedAllChatId =
    activeFilter === 'Все' &&
    stageView === 'main' &&
    bottomSection === 'chats' &&
    topListView === 'none' &&
    !searchOpen &&
    activeChatId === retainedAllChatId
      ? retainedAllChatId
      : null
  const visibleRetainedFavoriteChatId =
    activeFilter === '★' &&
    stageView === 'main' &&
    bottomSection === 'chats' &&
    topListView === 'none' &&
    !searchOpen &&
    activeChatId === retainedFavoriteChatId
      ? retainedFavoriteChatId
      : null
  const visibleRetainedGroupId =
    topListView === 'groups' &&
    stageView === 'main' &&
    !searchOpen &&
    activeGroupId === retainedGroupId
      ? retainedGroupId
      : null

  const visibleChats = availableChats.filter((chat) => {
    if (searchOpen) return true
    if (bottomSection === 'contacts') return true
    if (activeFilter === '★') return Boolean(chat.pinned)

    return true
  })

  const myContactsResults = availableChats.filter((chat) => {
    if (query.trim() === '') return false

    return (
      matchesQuery(chat.title, query) ||
      matchesQuery(chat.handle, query) ||
      matchesQuery(chat.phone, query)
    )
  })

  const searchResults = discoveryResults.filter((result) => {
    if (query.trim() === '') return true

    return (
      matchesQuery(result.title, query) ||
      matchesQuery(result.handle, query) ||
      matchesQuery(result.phone, query)
    )
  })

  const activeChat =
    activeChatId === null ? null : availableChats.find((chat) => chat.id === activeChatId) ?? null
  const pinnedMessage =
    activeChat?.pinnedMessageId === undefined
      ? null
      : activeChat?.messages.find((message) => message.id === activeChat.pinnedMessageId) ?? null
  const activeMessage =
    messageActionMessageId === null
      ? null
      : activeChat?.messages.find((message) => message.id === messageActionMessageId) ?? null
  const forwardingMessage =
    forwardingMessageId === null
      ? null
      : activeChat?.messages.find((message) => message.id === forwardingMessageId) ?? null
  const premiumGiftChat =
    premiumGiftChatId === null ? null : chats.find((chat) => chat.id === premiumGiftChatId) ?? null
  const activeChannel =
    activeChannelId === null
      ? null
      : channels.find((channel) => channel.id === activeChannelId) ?? null
  const activeSubscriptionChannel =
    activeSubscriptionChannelId === null
      ? null
      : subscriptionChannels.find((channel) => channel.id === activeSubscriptionChannelId) ?? null
  const activeSubscriptionPost =
    activeSubscriptionPostId === null
      ? null
      : activeSubscriptionChannel?.posts.find((post) => post.id === activeSubscriptionPostId) ?? null
  const activeGroup = activeGroupId === null ? null : groups.find((group) => group.id === activeGroupId) ?? null
  const activeGroupMessage =
    activeGroupMessageId === null
      ? null
      : activeGroup?.messages.find((message) => message.id === activeGroupMessageId) ?? null
  const subscriptionMenuFallbackHeight =
    activeSubscriptionChannel?.visibility === 'closed' ? channelBlockedMenuHeight : channelActionMenuHeight
  const { menuRef: subscriptionPostMenuRef, style: subscriptionPostMenuStyle } = useAnchoredMenu(
    subscriptionPostActionAnchor,
    channelActionMenuWidth,
    subscriptionMenuFallbackHeight,
  )
  const { menuRef: groupMessageMenuRef, style: groupMessageMenuStyle } = useAnchoredMenu(
    groupMessageActionAnchor,
    channelActionMenuWidth,
    channelActionMenuHeight,
  )
  const { menuRef: messageMenuRef, style: messageMenuStyle } = useAnchoredMenu(
    messageActionAnchor,
    chatActionMenuWidth,
    chatActionMenuHeight,
  )
  const transferringChannel =
    transferringChannelId === null
      ? null
      : channels.find((channel) => channel.id === transferringChannelId) ?? null
  const channelTransferTarget =
    channelTransferTargetChatId === null
      ? null
      : availableChats.find((chat) => chat.id === channelTransferTargetChatId) ?? null
  const channelTransferResults = availableChats.filter((chat) => {
    if (channelTransferSearch.trim() === '') return true

    return (
      matchesQuery(chat.title, channelTransferSearch) ||
      matchesQuery(chat.handle, channelTransferSearch) ||
      matchesQuery(chat.phone, channelTransferSearch)
    )
  })
  const activeChatMessageCount = activeChat?.messages.length ?? 0
  const activeGroupMessageCount = activeGroup?.messages.length ?? 0
  const isSettingsView = stageView === 'settings'
  const isPremiumView = stageView === 'premium'
  const isChannelsView = stageView === 'channels'
  const isRailVisible = !isSettingsView && !isPremiumView && !isChannelsView
  const isChannelsListView = isChannelsView && channelsView === 'list'
  const isChannelCreateView = isChannelsView && channelsView === 'create'
  const isChannelDetailView = isChannelsView && channelsView === 'detail'
  const isChatOpen = stageView === 'main' && activeChat !== null
  const isGroupOpen = stageView === 'main' && activeGroup !== null
  const isSubscriptionChannelOpen = stageView === 'main' && activeSubscriptionChannel !== null
  const isChannelsTopListOpen = topListView === 'channels'
  const isGroupsTopListOpen = topListView === 'groups'
  const isAnyRoomOpen = isChatOpen || isSubscriptionChannelOpen || isGroupOpen
  const visibleRetainedSubscriptionChannelId =
    isChannelsTopListOpen &&
    stageView === 'main' &&
    !searchOpen &&
    activeSubscriptionChannelId === retainedSubscriptionChannelId
      ? retainedSubscriptionChannelId
      : null
  const searchShowsPhone = isPhoneQuery(query)
  const totalUnreadCount = availableChats.reduce((sum, chat) => sum + chat.unread, 0)
  const totalFavoriteUnreadCount = availableChats.reduce(
    (sum, chat) => sum + (chat.pinned ? chat.unread : 0),
    0,
  )
  const sortByUnreadEnabled = !quietMode
  const orderedVisibleChats =
    !sortByUnreadEnabled
      ? visibleChats
      : activeFilter === 'Все'
      ? moveUnreadItemsFirst(visibleChats, visibleRetainedAllChatId)
      : activeFilter === '★'
      ? moveUnreadItemsFirst(visibleChats, visibleRetainedFavoriteChatId)
      : visibleChats
  const orderedSubscriptionChannels = sortByUnreadEnabled
    ? moveUnreadItemsFirst(subscriptionChannels, visibleRetainedSubscriptionChannelId)
    : subscriptionChannels
  const orderedGroups = sortByUnreadEnabled
    ? moveUnreadItemsFirst(groups, visibleRetainedGroupId)
    : groups
  const totalChannelNotifications = subscriptionChannels.reduce((sum, channel) => sum + channel.unread, 0)
  const totalGroupNotifications = groups.reduce((sum, group) => sum + group.unread, 0)
  const sessionHasPremium = hasActivePremium(session?.premium, session?.premiumExpiresAt)
  const sessionName = session ? formatSessionName(session) : ''
  const premiumDaysLeft = getPremiumDaysLeft(session?.premium, session?.premiumExpiresAt)
  const cookieConsentStatus =
    cookieConsent === 'analytics'
      ? 'Вы приняли аналитические cookie'
      : cookieConsent === 'necessary'
      ? 'Вы приняли только необходимые cookie'
      : 'Выбор ещё не сохранён'
  const nextCookieConsentChoice = cookieConsent === 'analytics' ? 'necessary' : 'analytics'
  const cookieConsentToggleLabel = cookieConsent === null ? 'Сохранить выбор' : 'Изменить выбор'
  const authExistingAccount = normalizeIdentifier(identifier)
    ? loadAccounts().find((account) => account.identifier === normalizeIdentifier(identifier)) ?? null
    : null
  const cookieConsentBanner = (
    <CookieConsentBanner consent={cookieConsent} onChoice={updateCookieConsent} />
  )

  useEffect(() => {
    if ((!isChatOpen && !isSubscriptionChannelOpen && !isGroupOpen) || !messageFeedRef.current) return

    messageFeedRef.current.scrollTop = messageFeedRef.current.scrollHeight
  }, [
    activeChatId,
    activeChatMessageCount,
    activeGroupId,
    activeGroupMessageCount,
    activeSubscriptionChannelId,
    isChatOpen,
    isGroupOpen,
    isSubscriptionChannelOpen,
  ])

  useEffect(() => {
    if (!isChannelsView || !channelsPanelRef.current) return

    channelsPanelRef.current.scrollTop = 0
  }, [activeChannelId, channelsView, isChannelsView])

  useEffect(() => {
    const avatarObjectUrls = channelAvatarObjectUrlsRef.current

    return () => {
      avatarObjectUrls.forEach((url) => URL.revokeObjectURL(url))
      avatarObjectUrls.clear()
    }
  }, [])

  useEffect(() => {
    if (!copyHintText) return

    const timeoutId = window.setTimeout(() => setCopyHintText(''), 1600)
    return () => window.clearTimeout(timeoutId)
  }, [copyHintText])

  const adjustAccountNameFontSize = useCallback(() => {
    const nameNode = accountNameRef.current

    if (!nameNode) return

    if (!sessionName.trim()) {
      nameNode.style.removeProperty('font-size')
      return
    }

    let nextFontSize = accountNameMaxFontSize
    nameNode.style.fontSize = `${nextFontSize}px`

    const computedStyle = window.getComputedStyle(nameNode)
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || nextFontSize * 0.98
    const maxHeight = lineHeight * 2 + 1

    while (nameNode.scrollHeight > maxHeight && nextFontSize > accountNameMinFontSize) {
      nextFontSize -= 0.5
      nameNode.style.fontSize = `${nextFontSize}px`
    }
  }, [sessionName])

  const adjustAccountStatusFontSize = useCallback(() => {
    const statusNode = accountStatusRef.current
    const statusValue = session?.status?.trim()

    if (!statusNode) return

    if (!statusValue) {
      statusNode.style.removeProperty('font-size')
      return
    }

    let nextFontSize = accountStatusMaxFontSize
    statusNode.style.fontSize = `${nextFontSize}px`

    const computedStyle = window.getComputedStyle(statusNode)
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || nextFontSize * 1.32
    const maxHeight = lineHeight * 2 + 1

    while (statusNode.scrollHeight > maxHeight && nextFontSize > accountStatusMinFontSize) {
      nextFontSize -= 0.5
      statusNode.style.fontSize = `${nextFontSize}px`
    }
  }, [session?.status])

  useLayoutEffect(() => {
    if (!isRailVisible) return
    adjustAccountNameFontSize()
  }, [adjustAccountNameFontSize, isRailVisible])

  useLayoutEffect(() => {
    if (!isRailVisible) return
    adjustAccountStatusFontSize()
  }, [adjustAccountStatusFontSize, isRailVisible])

  useEffect(() => {
    const hasName = sessionName.trim() !== ''
    const hasStatus = Boolean(session?.status?.trim())

    if (!isRailVisible || (!hasName && !hasStatus)) return

    const handleResize = () => {
      adjustAccountNameFontSize()
      adjustAccountStatusFontSize()
    }

    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [adjustAccountNameFontSize, adjustAccountStatusFontSize, isRailVisible, session?.status, sessionName])

  function persistSession(nextSession: Session | null) {
    setSession(nextSession)

    if (typeof window === 'undefined') return

    if (nextSession) {
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession))
    } else {
      window.localStorage.removeItem(sessionStorageKey)
    }
  }

  function syncSession(nextSession: Session) {
    persistSession(nextSession)

    const nextAccounts = loadAccounts().map((account) =>
      account.identifier === nextSession.identifier
        ? {
            ...account,
            displayName: nextSession.displayName,
            surname: nextSession.surname ?? '',
            nickname: nextSession.nickname ?? '',
            status: nextSession.status ?? '',
            premium: nextSession.premium ?? true,
            premiumExpiresAt: normalizePremiumExpiry(
              nextSession.premium ?? true,
              nextSession.premiumExpiresAt,
            ),
            blockedContactIds: nextSession.blockedContactIds ?? [],
          }
        : account,
    )

    window.localStorage.setItem(accountsStorageKey, JSON.stringify(nextAccounts))
  }

  function submitPhoneStep() {
    const normalized = normalizeIdentifier(identifier)

    if (!normalized) {
      setAuthError('Введи номер телефона.')
      return
    }

    if (normalized.length < 12) {
      setAuthError('Проверь номер телефона.')
      return
    }

    setIdentifier(normalized)
    setAuthError('')
    setAuthStep('code')
  }

  function submitCodeStep() {
    const normalized = normalizeIdentifier(identifier)
    const trimmedCode = smsCode.trim()
    const accounts = loadAccounts()
    const existingAccount = accounts.find((account) => account.identifier === normalized)

    if (trimmedCode.length < 4) {
      setAuthError('Введи код из SMS.')
      return
    }

    if (existingAccount) {
      persistSession({
        identifier: existingAccount.identifier,
        displayName: existingAccount.displayName,
        surname: existingAccount.surname ?? '',
        nickname: existingAccount.nickname ?? '',
        status: existingAccount.status ?? '',
        premium: existingAccount.premium ?? true,
        premiumExpiresAt: normalizePremiumExpiry(
          existingAccount.premium ?? true,
          existingAccount.premiumExpiresAt,
        ),
        blockedContactIds: existingAccount.blockedContactIds ?? [],
      })
      setAuthError('')
      return
    }

    setAuthError('')
    setAuthStep('profile')
  }

  function submitProfileStep() {
    const normalized = normalizeIdentifier(identifier)
    const trimmedName = sanitizePersonField(displayName, displayNameFieldMaxLength)

    if (!trimmedName) {
      setAuthError('Для регистрации нужен ник или имя.')
      return
    }

    const accounts = loadAccounts()
    const nextAccount: Account = {
      identifier: normalized,
      displayName: trimmedName,
      surname: '',
      nickname: '',
      status: '',
      premium: true,
      premiumExpiresAt: makePremiumExpiry(30),
      blockedContactIds: [],
      createdAt: new Date().toISOString(),
    }

    window.localStorage.setItem(accountsStorageKey, JSON.stringify([...accounts, nextAccount]))
    persistSession({
      identifier: nextAccount.identifier,
      displayName: nextAccount.displayName,
      surname: nextAccount.surname,
      nickname: nextAccount.nickname,
      status: nextAccount.status,
      premium: nextAccount.premium,
      premiumExpiresAt: nextAccount.premiumExpiresAt,
      blockedContactIds: nextAccount.blockedContactIds,
    })
    setAuthError('')
  }

  function logout() {
    persistSession(null)
    setIdentifier('')
    setDisplayName('')
    setSmsCode('')
    setAuthStep('phone')
    setChatMessageDrafts({})
    setGroupMessageDrafts({})
    setChatAttachmentNames({})
    setConfirmingLogout(false)
    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setPremiumGiftChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    setConfirmingDeleteChannelId(null)
    setTransferringChannelId(null)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setTopListView('none')
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedSubscriptionChannelId(null)
    setRetainedGroupId(null)
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setActiveGroupId(null)
    setActiveGroupMessageId(null)
    setForwardingSubscriptionPostText('')
    setForwardingGroupMessageText('')
    setMessageActionAnchor(null)
    setSubscriptionPostActionAnchor(null)
    setGroupMessageActionAnchor(null)
  }

  function sendMessage() {
    if (!activeChat) return

    const text = (chatMessageDrafts[activeChat.id] ?? '').trim()
    if (!text || !activeChat) return

    setChats((currentChats) =>
      currentChats.map((chat) => {
        if (chat.id !== activeChat.id) return chat

        return {
          ...chat,
          typing: false,
          unread: 0,
          status: 'только что был(а) здесь',
          messages: [
            ...chat.messages,
            {
              id: Date.now(),
              author: 'me',
              text,
              time: formatNowTime(),
              replyTo: replyTarget
                ? {
                    text: replyTarget.text,
                    author: replyTarget.author,
                  }
                : undefined,
            },
          ],
        }
      }),
    )

    setChatMessageDrafts((currentDrafts) => ({
      ...currentDrafts,
      [activeChat.id]: '',
    }))
    setChatAttachmentNames((currentAttachments) => ({
      ...currentAttachments,
      [activeChat.id]: '',
    }))
    setReplyTarget(null)
  }

  function updateChatDraft(chatId: number, value: string) {
    setChatMessageDrafts((currentDrafts) => ({
      ...currentDrafts,
      [chatId]: value,
    }))
  }

  function updateGroupDraft(groupId: number, value: string) {
    setGroupMessageDrafts((currentDrafts) => ({
      ...currentDrafts,
      [groupId]: value,
    }))
  }

  function sendGroupMessage() {
    if (!activeGroup) return

    const text = (groupMessageDrafts[activeGroup.id] ?? '').trim()
    if (!text) return

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === activeGroup.id
          ? {
              ...group,
              unread: 0,
              messages: [
                ...group.messages,
                {
                  id: Date.now() + group.id,
                  author: 'me',
                  text,
                  time: formatNowTime(),
                },
              ],
            }
          : group,
      ),
    )

    setGroupMessageDrafts((currentDrafts) => ({
      ...currentDrafts,
      [activeGroup.id]: '',
    }))
    closeGroupMessageActions()
  }

  function openAttachmentPicker() {
    attachmentInputRef.current?.click()
  }

  function handleChatAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const attachmentName = event.target.files?.[0]?.name ?? ''

    if (activeChat) {
      setChatAttachmentNames((currentAttachments) => ({
        ...currentAttachments,
        [activeChat.id]: attachmentName,
      }))
    }

    // Reset the native file input so selecting the same file again still fires onChange.
    event.target.value = ''
  }

  function closeActiveRoom() {
    setActiveChatId(null)
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setActiveGroupId(null)
    setActiveGroupMessageId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setChatActionsOpen(false)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    setForwardingSubscriptionPostText('')
    setForwardingGroupMessageText('')
    setMessageActionAnchor(null)
    setSubscriptionPostActionAnchor(null)
    setGroupMessageActionAnchor(null)
  }

  function openSubscriptionChannel(channelId: number) {
    const shouldRetainSubscriptionChannelInList =
      topListView === 'channels' &&
      subscriptionChannels.some(
        (channel) =>
          channel.id === channelId &&
          (channel.unread > 0 || channel.id === retainedSubscriptionChannelId),
      )

    setStageView('main')
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedGroupId(null)
    setActiveChatId(null)
    setActiveGroupId(null)
    setActiveGroupMessageId(null)
    setForwardingGroupMessageText('')
    setGroupMessageActionAnchor(null)
    setRetainedSubscriptionChannelId(shouldRetainSubscriptionChannelInList ? channelId : null)
    setActiveSubscriptionChannelId(channelId)
    setActiveSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
    setSubscriptionPostActionAnchor(null)
    setTopListView('channels')
    setSearchOpen(false)
    setSubscriptionChannels((currentChannels) =>
      currentChannels.map((channel) =>
        channel.id === channelId
          ? {
              ...channel,
              unread: 0,
            }
          : channel,
      ),
    )
  }

  function openGroup(groupId: number) {
    const shouldRetainGroupInList =
      topListView === 'groups' &&
      groups.some((group) => group.id === groupId && (group.unread > 0 || group.id === retainedGroupId))

    setStageView('main')
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedSubscriptionChannelId(null)
    setActiveChatId(null)
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
    setSubscriptionPostActionAnchor(null)
    setTopListView('groups')
    setSearchOpen(false)
    setRetainedGroupId(shouldRetainGroupInList ? groupId : null)
    setActiveGroupId(groupId)
    setActiveGroupMessageId(null)
    setForwardingGroupMessageText('')
    setGroupMessageActionAnchor(null)
    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              unread: 0,
            }
          : group,
      ),
    )
  }

  function openChat(chatId: number) {
    const shouldRetainChatInAllFilter =
      activeFilter === 'Все' &&
      availableChats.some((chat) => chat.id === chatId && (chat.unread > 0 || chat.id === retainedAllChatId))
    const shouldRetainChatInFavoritesFilter =
      activeFilter === '★' &&
      availableChats.some(
        (chat) =>
          chat.id === chatId && Boolean(chat.pinned) && (chat.unread > 0 || chat.id === retainedFavoriteChatId),
      )

    setStageView('main')
    setSettingsView('profile')
    setConfirmingLogout(false)
    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setPremiumGiftChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    setConfirmingDeleteChannelId(null)
    setTransferringChannelId(null)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setTopListView('none')
    setRetainedAllChatId(shouldRetainChatInAllFilter ? chatId : null)
    setRetainedFavoriteChatId(shouldRetainChatInFavoritesFilter ? chatId : null)
    setRetainedSubscriptionChannelId(null)
    setRetainedGroupId(null)
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setActiveGroupId(null)
    setActiveGroupMessageId(null)
    setForwardingSubscriptionPostText('')
    setForwardingGroupMessageText('')
    setMessageActionAnchor(null)
    setSubscriptionPostActionAnchor(null)
    setGroupMessageActionAnchor(null)
    setBottomSection('chats')
    setActiveChatId(chatId)
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              unread: 0,
            }
          : chat,
      ),
    )
  }

  function togglePinnedChat(chatId: number) {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              pinned: !chat.pinned,
            }
          : chat,
      ),
    )
  }

  function updateSessionProfile(patch: Partial<Session>) {
    if (!session) return

    const nextDisplayName =
      patch.displayName !== undefined
        ? sanitizePersonField(patch.displayName, displayNameFieldMaxLength)
        : session.displayName
    const nextSurname =
      patch.surname !== undefined
        ? sanitizePersonField(patch.surname, surnameFieldMaxLength)
        : session.surname ?? ''
    const nextNickname =
      patch.nickname !== undefined
        ? normalizeNickname(patch.nickname)
        : session.nickname ?? ''
    const nextStatus =
      patch.status !== undefined ? sanitizeStatusField(patch.status) : session.status ?? ''

    if (nextDisplayName === '') return

    const nextSession: Session = {
      ...session,
      displayName: nextDisplayName,
      surname: nextSurname,
      nickname: nextNickname,
      status: nextStatus,
      premium: session.premium ?? true,
      premiumExpiresAt: normalizePremiumExpiry(session.premium ?? true, session.premiumExpiresAt),
    }

    syncSession(nextSession)
  }

  function blockChat(chatId: number) {
    if (!session || blockedContactIds.includes(chatId)) return

    syncSession({
      ...session,
      blockedContactIds: [...blockedContactIds, chatId],
    })
    setChatActionsOpen(false)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setActiveChatId(null)
    setStageView('main')
  }

  function blockThenDeleteChat(chatId: number) {
    if (session && !blockedContactIds.includes(chatId)) {
      syncSession({
        ...session,
        blockedContactIds: [...blockedContactIds, chatId],
      })
    }

    deleteContact(chatId)
  }

  function unblockChat(chatId: number) {
    if (!session) return

    syncSession({
      ...session,
      blockedContactIds: blockedContactIds.filter((id) => id !== chatId),
    })
    setBlockedActionChatId(null)
  }

  function deleteChatHistory(chatId: number) {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              typing: false,
              unread: 0,
              pinnedMessageId: undefined,
              messages: [],
            }
          : chat,
      ),
    )
    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    setMessageActionAnchor(null)
  }

  function deleteContact(chatId: number) {
    setChats((currentChats) => currentChats.filter((chat) => chat.id !== chatId))
    setChatMessageDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }
      delete nextDrafts[chatId]
      return nextDrafts
    })
    setChatAttachmentNames((currentAttachments) => {
      const nextAttachments = { ...currentAttachments }
      delete nextAttachments[chatId]
      return nextAttachments
    })

    if (session && blockedContactIds.includes(chatId)) {
      syncSession({
        ...session,
        blockedContactIds: blockedContactIds.filter((id) => id !== chatId),
      })
    }

    if (activeChatId === chatId) {
      setActiveChatId(null)
      setStageView('main')
    }

    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setConfirmingDeleteMessageId(null)
  }

  async function copyMessageText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopyHintText('Сообщение скопировано')
    } catch {
      // Ignore clipboard failures in demo mode.
    }

    setMessageActionMessageId(null)
  }

  async function copyToClipboard(text: string, successMessage = 'Ссылка скопирована') {
    try {
      await navigator.clipboard.writeText(text)
      setCopyHintText(successMessage)
    } catch {
      // Ignore clipboard failures in demo mode.
    }
  }

  function replyToMessage(message: Message) {
    setReplyTarget({
      id: message.id,
      text: message.text,
      author: message.author,
    })
    setMessageActionMessageId(null)
  }

  function pinMessage(chatId: number, messageId: number) {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              pinnedMessageId: messageId,
            }
          : chat,
      ),
    )

    setMessageActionMessageId(null)
  }

  function unpinMessage(chatId: number) {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              pinnedMessageId: undefined,
            }
          : chat,
      ),
    )
  }

  function forwardMessageToChat(targetChatId: number, message: Message) {
    forwardTextToChat(targetChatId, message.text)
    setForwardingMessageId(null)
    setMessageActionMessageId(null)
  }

  function forwardTextToChat(targetChatId: number, text: string) {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === targetChatId
          ? {
              ...chat,
              unread: chat.id === activeChatId ? 0 : chat.unread,
              messages: [
                ...chat.messages,
                {
                  id: Date.now() + targetChatId,
                  author: 'me',
                  text,
                  time: formatNowTime(),
                  forwarded: true,
                },
              ],
            }
          : chat,
      ),
    )
  }

  function deleteMessage(chatId: number, messageId: number) {
    setChats((currentChats) =>
      currentChats.map((chat) => {
        if (chat.id !== chatId) return chat

        return {
          ...chat,
          pinnedMessageId: chat.pinnedMessageId === messageId ? undefined : chat.pinnedMessageId,
          messages: chat.messages.filter((message) => message.id !== messageId),
        }
      }),
    )

    if (replyTarget?.id === messageId) {
      setReplyTarget(null)
    }

    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setConfirmingDeleteMessageId(null)
    setMessageActionAnchor(null)
  }

  function prepareChannelDraft(channelNumber: number, channelId: number) {
    const nextDraft = makeDraftChannel(channelNumber, channelId)
    setCreatingChannelTitle(nextDraft.title)
    setCreatingChannelDirectLink(nextDraft.directLink)
    setCreatingChannelDescription(nextDraft.description)
    setCreatingChannelAvatarTone(nextDraft.avatarTone)
  }

  function openChannelsView(nextView: ChannelsView = 'list') {
    setRetainedAllChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedSubscriptionChannelId(null)
    setRetainedGroupId(null)
    setStageView('channels')
    setChannelsView(nextView)
    setTopListView('none')
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setActiveGroupId(null)
    setActiveGroupMessageId(null)
    setForwardingSubscriptionPostText('')
    setForwardingGroupMessageText('')
    setConfirmingLogout(false)
    setPremiumGiftChatId(null)
    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
    setConfirmingDeleteChannelId(null)
    setTransferringChannelId(null)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setMessageActionAnchor(null)
    setSubscriptionPostActionAnchor(null)
    setGroupMessageActionAnchor(null)
  }

  function openChannelsListView() {
    openChannelsView('list')
  }

  function openChannelCreateView() {
    const nextId = channels.reduce((maxId, channel) => Math.max(maxId, channel.id), 0) + 1
    prepareChannelDraft(channels.length + 1, nextId)
    openChannelsView('create')
  }

  function openChannelDetailView(channelId: number) {
    setActiveChannelId(channelId)
    openChannelsView('detail')
  }

  function updateChannel(channelId: number, patch: Partial<Channel>) {
    setChannels((currentChannels) =>
      currentChannels.map((channel) =>
        channel.id === channelId
          ? {
              ...channel,
              ...patch,
            }
          : channel,
      ),
    )
  }

  function openChannelAvatarPicker(channelId: number) {
    setUploadingChannelAvatarId(channelId)
    channelAvatarInputRef.current?.click()
  }

  function handleChannelAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const targetChannelId = uploadingChannelAvatarId

    if (!file || targetChannelId === null) {
      event.target.value = ''
      return
    }

    const nextAvatarImage = URL.createObjectURL(file)
    channelAvatarObjectUrlsRef.current.add(nextAvatarImage)

    setChannels((currentChannels) =>
      currentChannels.map((channel) => {
        if (channel.id !== targetChannelId) return channel

        if (channel.avatarImage?.startsWith('blob:')) {
          URL.revokeObjectURL(channel.avatarImage)
          channelAvatarObjectUrlsRef.current.delete(channel.avatarImage)
        }

        return {
          ...channel,
          avatarImage: nextAvatarImage,
        }
      }),
    )

    setUploadingChannelAvatarId(null)
    event.target.value = ''
  }

  function createChannel() {
    const nextId = channels.reduce((maxId, channel) => Math.max(maxId, channel.id), 0) + 1
    const title =
      sanitizeChannelTitle(creatingChannelTitle) || `Новый канал ${channels.length + 1}`
    const directLink = creatingChannelDirectLink.trim() || `https://tinychok.app/c/draft-${nextId}`
    const description =
      sanitizeChannelDescription(creatingChannelDescription) ||
      'Описание канала пока не заполнено. Здесь можно подготовить текст до публикации.'
    const nextChannel: Channel = {
      id: nextId,
      title,
      directLink,
      description,
      avatarTone: creatingChannelAvatarTone,
      status: 'draft',
      visibility: 'private',
    }

    setChannels((currentChannels) => [...currentChannels, nextChannel])
    setActiveChannelId(nextId)
    openChannelsView('detail')
  }

  function closeChannelTransfer() {
    setTransferringChannelId(null)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setChannelTransferSearch('')
  }

  function closeSubscriptionPostActions() {
    setActiveSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
    setSubscriptionPostActionAnchor(null)
  }

  function closeGroupMessageActions() {
    setActiveGroupMessageId(null)
    setForwardingGroupMessageText('')
    setGroupMessageActionAnchor(null)
  }

  function deleteChannel(channelId: number) {
    setChannels((currentChannels) => currentChannels.filter((channel) => channel.id !== channelId))
    setConfirmingDeleteChannelId(null)
    setChannelsView('list')
    if (transferringChannelId === channelId) {
      closeChannelTransfer()
    }
  }

  function startChannelTransfer(channelId: number) {
    setConfirmingDeleteChannelId(null)
    setTransferringChannelId(channelId)
    setChannelTransferTargetChatId(null)
    setChannelTransferCode('')
    setChannelTransferError('')
    setChannelTransferSearch('')
  }

  function openChannelTitleEditor(channel: Channel) {
    setEditingChannelTitleId(channel.id)
    setEditingChannelTitleValue(channel.title)
  }

  function submitChannelTitleEdit() {
    if (editingChannelTitleId === null) return

    const nextTitle = sanitizeChannelTitle(editingChannelTitleValue)
    if (!nextTitle) return

    updateChannel(editingChannelTitleId, { title: nextTitle })
    setEditingChannelTitleId(null)
    setEditingChannelTitleValue('')
  }

  function selectChannelTransferTarget(chatId: number) {
    setChannelTransferTargetChatId(chatId)
    setChannelTransferCode('')
    setChannelTransferError('')
  }

  function submitChannelTransfer() {
    if (transferringChannelId === null || channelTransferTarget === null) return

    if (channelTransferCode.trim().length < 4) {
      setChannelTransferError('Введи код из SMS для подтверждения передачи канала.')
      return
    }

    setChannels((currentChannels) =>
      currentChannels.filter((channel) => channel.id !== transferringChannelId),
    )
    setChannelsView('list')
    closeChannelTransfer()
  }

  if (!session) {
    return (
      <>
        <AuthScreen
          authError={authError}
          authExistingAccount={authExistingAccount}
          authStep={authStep}
          displayName={displayName}
          displayNameMaxLength={displayNameFieldMaxLength}
          identifier={identifier}
          smsCode={smsCode}
          onDisplayNameChange={(value) =>
            setDisplayName(sanitizePersonField(value, displayNameFieldMaxLength))
          }
          onIdentifierChange={setIdentifier}
          onSmsCodeChange={(value) => setSmsCode(value.replace(/[^\d]/g, ''))}
          onSubmit={() => {
            if (authStep === 'phone') {
              submitPhoneStep()
              return
            }

            if (authStep === 'code') {
              submitCodeStep()
              return
            }

            submitProfileStep()
          }}
        />
        {cookieConsentBanner}
      </>
    )
  }

  if (confirmingLogout) {
    return (
      <>
        <ConfirmLogoutScreen
          onCancel={() => setConfirmingLogout(false)}
          onConfirm={logout}
        />
        {cookieConsentBanner}
      </>
    )
  }

  const shellClassName = [
    'shell',
    isPremiumView
      ? 'shell-settings shell-premium'
      : isSettingsView || isChannelsView
        ? 'shell-settings'
        : '',
    !isSettingsView && !isPremiumView && !isChannelsView && !isAnyRoomOpen ? 'shell-main-list' : '',
    !isSettingsView && !isPremiumView && !isChannelsView && isAnyRoomOpen ? 'shell-main-room' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const subscriptionPostActions = activeSubscriptionPost ? (
    <>
      <button
        type="button"
        className="room-confirm-scrim"
        aria-label="Закрыть действия с постом канала"
        onClick={closeSubscriptionPostActions}
      />
      {activeSubscriptionChannel?.visibility === 'closed' ? (
        subscriptionPostActionAnchor ? (
          <div
            ref={subscriptionPostMenuRef}
            className="message-menu message-menu-note"
            style={subscriptionPostMenuStyle}
          >
            <p className="room-confirm-copy">
              Канал имеет тип "закрытый", копирование и пересылка сообщений запрещена
            </p>
          </div>
        ) : null
      ) : forwardingSubscriptionPostText ? (
        <div className="room-confirm room-forward">
          <p className="room-confirm-copy">Кому переслать сообщение?</p>
          <div className="room-forward-list">
            {availableChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className="room-forward-item"
                onClick={() => {
                  forwardTextToChat(chat.id, forwardingSubscriptionPostText)
                  closeSubscriptionPostActions()
                }}
              >
                <span className="avatar" style={{ backgroundColor: chat.accent }}>
                  {chat.title.slice(0, 1)}
                </span>
                <span>{chat.title}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="room-confirm-button"
            onClick={() => setForwardingSubscriptionPostText('')}
          >
            Назад
          </button>
        </div>
      ) : subscriptionPostActionAnchor ? (
        <div
          ref={subscriptionPostMenuRef}
          className="message-menu"
          style={subscriptionPostMenuStyle}
        >
          <button
            type="button"
            className="message-menu-item"
            onClick={() => setForwardingSubscriptionPostText(activeSubscriptionPost.text)}
          >
            Переслать
          </button>
          <button
            type="button"
            className="message-menu-item"
            onClick={() => {
              copyToClipboard(activeSubscriptionPost.text, 'Сообщение скопировано')
              closeSubscriptionPostActions()
            }}
          >
            Скопировать
          </button>
        </div>
      ) : null}
    </>
  ) : null

  const groupMessageActions = activeGroupMessage ? (
    <>
      <button
        type="button"
        className="room-confirm-scrim"
        aria-label="Закрыть действия с сообщением группы"
        onClick={closeGroupMessageActions}
      />
      {forwardingGroupMessageText ? (
        <div className="room-confirm room-forward">
          <p className="room-confirm-copy">Кому переслать сообщение?</p>
          <div className="room-forward-list">
            {availableChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className="room-forward-item"
                onClick={() => {
                  forwardTextToChat(chat.id, forwardingGroupMessageText)
                  closeGroupMessageActions()
                }}
              >
                <span className="avatar" style={{ backgroundColor: chat.accent }}>
                  {chat.title.slice(0, 1)}
                </span>
                <span>{chat.title}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="room-confirm-button"
            onClick={() => setForwardingGroupMessageText('')}
          >
            Назад
          </button>
        </div>
      ) : groupMessageActionAnchor ? (
        <div
          ref={groupMessageMenuRef}
          className="message-menu"
          style={groupMessageMenuStyle}
        >
          <button
            type="button"
            className="message-menu-item"
            onClick={() => setForwardingGroupMessageText(activeGroupMessage.text)}
          >
            Переслать
          </button>
          <button
            type="button"
            className="message-menu-item"
            onClick={() => {
              copyToClipboard(activeGroupMessage.text, 'Сообщение скопировано')
              closeGroupMessageActions()
            }}
          >
            Скопировать
          </button>
        </div>
      ) : null}
    </>
  ) : null

  return (
    <>
      <main className={shellClassName}>
      {isRailVisible ? (
        <aside className="rail">
        <div className="account-header">
            <div className="account-headline">
              <div className="account-name">
              <h2 ref={accountNameRef}>{sessionName}</h2>
            </div>
            <div className="quiet-toggle-stack">
              {sessionHasPremium ? (
                <span className="premium-crown quiet-toggle-crown" aria-label="Премиум">
                  <img src="/icons/crown64.png" alt="" />
                </span>
              ) : null}
              <button
                className={quietMode ? 'ghost-button quiet-toggle active' : 'ghost-button quiet-toggle'}
                type="button"
                onClick={() => setQuietMode((current) => !current)}
                aria-label="Тихо"
                title="Тихо"
              >
                <img src={quietMode ? '/icons/quiet.png' : '/icons/quiet100.png'} alt="" />
              </button>
            </div>
          </div>
          {session.status?.trim() ? (
            <div className="account-status-row">
              <p ref={accountStatusRef}>{session.status}</p>
            </div>
          ) : null}
        </div>

        <div className="filters" aria-label="Фильтры чатов">
          {quickFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={
                topListView === 'none' &&
                (filter === 'Все' ? activeFilter === 'Все' : filter === activeFilter)
                  ? 'filter active'
                  : 'filter'
              }
              onClick={() => {
                if (filter === 'Все') {
                  setRetainedAllChatId(null)
                  setRetainedFavoriteChatId(null)
                  setRetainedSubscriptionChannelId(null)
                  setRetainedGroupId(null)
                  setActiveFilter('Все')
                  setSearchOpen(false)
                  setTopListView('none')
                  setActiveSubscriptionChannelId(null)
                  setActiveGroupId(null)
                  setActiveGroupMessageId(null)
                  setForwardingGroupMessageText('')
                  setGroupMessageActionAnchor(null)
                  return
                }

                setRetainedAllChatId(null)
                setRetainedFavoriteChatId(null)
                setRetainedSubscriptionChannelId(null)
                setRetainedGroupId(null)
                setActiveFilter(filter)
                setSearchOpen(false)
                setTopListView('none')
                setActiveSubscriptionChannelId(null)
                setActiveGroupId(null)
                setActiveGroupMessageId(null)
                setForwardingGroupMessageText('')
                setGroupMessageActionAnchor(null)
              }}
            >
              {filter === '★' ? (
                <>
                  <img className="filter-icon" src="/icons/star100.png" alt="Избранное" />
                  {!quietMode && totalFavoriteUnreadCount > 0 ? (
                    <span className="filter-badge">{totalFavoriteUnreadCount}</span>
                  ) : null}
                </>
              ) : (
                <span>Все</span>
              )}
              {filter === 'Все' && !quietMode && totalUnreadCount > 0 ? (
                <span className="filter-badge">{totalUnreadCount}</span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            className={isChannelsTopListOpen ? 'filter active' : 'filter'}
            onClick={() => {
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setTopListView('channels')
              setActiveChatId(null)
              setActiveSubscriptionChannelId(null)
              setActiveSubscriptionPostId(null)
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
              setSearchOpen(false)
              setQuery('')
            }}
            aria-label="Каналы"
            title="Каналы"
          >
            <img className="filter-icon" src="/icons/news100.svg" alt="Каналы" />
            {!quietMode && totalChannelNotifications > 0 ? (
              <span className="filter-badge">{totalChannelNotifications}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={isGroupsTopListOpen ? 'filter active' : 'filter'}
            onClick={() => {
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setTopListView('groups')
              setActiveChatId(null)
              setActiveSubscriptionChannelId(null)
              setActiveSubscriptionPostId(null)
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
              setSearchOpen(false)
              setQuery('')
            }}
            aria-label="Группы"
            title="Группы"
          >
            <img className="filter-icon" src="/icons/group100.png" alt="Группы" />
            {!quietMode && totalGroupNotifications > 0 ? (
              <span className="filter-badge">{totalGroupNotifications}</span>
            ) : null}
          </button>
        </div>

        {searchOpen && topListView === 'none' ? (
          <label className="search">
            <span className="search-label">Поиск</span>
            <input
              type="search"
              placeholder="Имя или @handle"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}

        {searchOpen && topListView === 'none' ? (
          <div className="chat-list search-results">
            {myContactsResults.length > 0 ? (
              <section className="search-group">
                <p className="search-group-title">Мои контакты</p>
                {myContactsResults.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className={chat.id === activeChat?.id ? 'chat-card active' : 'chat-card'}
                    onClick={() => openChat(chat.id)}
                  >
                    <span className="avatar" style={{ backgroundColor: chat.accent }}>
                      {chat.title.slice(0, 1)}
                    </span>
                    <span className="chat-copy">
                    <span className="chat-topline">
                      <span className="chat-name-row">
                        <strong className="chat-name-text">{chat.title}</strong>
                        {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                        {chat.premium ? (
                          <span className="premium-crown chat-crown" aria-label="Премиум">
                            <img src="/icons/crown64.png" alt="" />
                          </span>
                        ) : null}
                        {chat.pinned ? (
                          <span className="chat-star">
                            <img src="/icons/star100.png" alt="Избранный контакт" />
                          </span>
                        ) : null}
                      </span>
                      <span>{chat.messages.at(-1)?.time}</span>
                    </span>
                    <span className="chat-handle">
                      {searchShowsPhone ? chat.phone : chat.handle}
                    </span>
                  </span>
                  {!quietMode && chat.unread > 0 ? <span className="badge">{chat.unread}</span> : null}
                </button>
                ))}
              </section>
            ) : null}

            <section className="search-group">
              <p className="search-group-title">Результаты поиска</p>
              {searchResults.map((result) => (
                <article key={result.id} className="chat-card search-card">
                  <span className="avatar" style={{ backgroundColor: result.accent }}>
                    {result.title.slice(0, 1)}
                  </span>
                  <span className="chat-copy">
                    <span className="chat-topline">
                      <span className="chat-name-row">
                        <strong>{result.title}</strong>
                      </span>
                    </span>
                    <span className="chat-handle">
                      {searchShowsPhone ? result.phone : result.handle}
                    </span>
                  </span>
                </article>
              ))}
            </section>
          </div>
        ) : isChannelsTopListOpen ? (
          <div className="chat-list">
            {orderedSubscriptionChannels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                className={channel.id === activeSubscriptionChannelId ? 'chat-card active' : 'chat-card'}
                onClick={() => openSubscriptionChannel(channel.id)}
              >
                <span className="avatar" style={{ backgroundColor: channel.accent }}>
                  {channel.title.slice(0, 1)}
                </span>
                <span className="chat-copy">
                  <span className="chat-topline">
                    <span className="chat-name-row">
                      <strong className="chat-name-text">{channel.title}</strong>
                      <span className="chat-star">
                        <img src="/icons/news100.svg" alt="Канал" />
                      </span>
                    </span>
                    <span>{channel.time}</span>
                  </span>
                  <span className="chat-handle">{channel.handle}</span>
                  <span className="chat-preview">{channel.preview}</span>
                </span>
                {!quietMode && channel.unread > 0 ? <span className="badge">{channel.unread}</span> : null}
              </button>
            ))}
          </div>
        ) : isGroupsTopListOpen ? (
          <div className="chat-list">
            {orderedGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={group.id === activeGroupId ? 'chat-card active' : 'chat-card'}
                onClick={() => openGroup(group.id)}
              >
                <span className="avatar" style={{ backgroundColor: group.accent }}>
                  {group.title.slice(0, 1)}
                </span>
                <span className="chat-copy">
                  <span className="chat-topline group-topline">
                    <span className="chat-name-row group-name-row">
                      <strong className="chat-name-text group-name-text">{group.title}</strong>
                      <span className="chat-star">
                        <img src="/icons/group100.png" alt="Группа" />
                      </span>
                    </span>
                    <span className="group-time">{formatGroupTime(group)}</span>
                  </span>
                  <span className="chat-handle">{`${group.handle} · ${group.members} участников`}</span>
                  <span className="chat-preview">{formatGroupPreview(group)}</span>
                </span>
                {!quietMode && group.unread > 0 ? <span className="badge">{group.unread}</span> : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="chat-list">
            {orderedVisibleChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={chat.id === activeChat?.id ? 'chat-card active' : 'chat-card'}
                onClick={() => openChat(chat.id)}
              >
                <span className="avatar" style={{ backgroundColor: chat.accent }}>
                  {chat.title.slice(0, 1)}
                </span>
                <span className="chat-copy">
                    <span className="chat-topline">
                      <span className="chat-name-row">
                        <strong className="chat-name-text">{chat.title}</strong>
                        {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                        {chat.premium ? (
                          <span className="premium-crown chat-crown" aria-label="Премиум">
                            <img src="/icons/crown64.png" alt="" />
                        </span>
                      ) : null}
                      {chat.pinned ? (
                        <span className="chat-star">
                          <img src="/icons/star100.png" alt="Избранный контакт" />
                        </span>
                        ) : null}
                    </span>
                    {bottomSection === 'contacts' ? null : <span>{chat.messages.at(-1)?.time}</span>}
                  </span>
                  {bottomSection === 'contacts' ? (
                    <span className="chat-preview chat-status-preview">{formatContactStatus(chat)}</span>
                  ) : chat.typing && !quietMode ? (
                    <div className="chat-typing" aria-label={`${chat.title} печатает`}>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="chat-typing-label">печатает...</span>
                    </div>
                  ) : (
                    <span className="chat-preview">{formatPreview(chat)}</span>
                  )}
                </span>
                {bottomSection === 'contacts' || quietMode || chat.unread <= 0 ? null : (
                  <span className="badge">{chat.unread}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="bottom-nav" aria-label="Основная навигация">
          <button
            type="button"
            className={!searchOpen && bottomSection === 'chats' ? 'soft-button icon-button active' : 'soft-button icon-button'}
            onClick={() => {
              if (isChannelsView) {
                setStageView('main')
              }
              setTopListView('none')
              setActiveSubscriptionChannelId(null)
              setBottomSection('chats')
              setSearchOpen(false)
              setQuery('')
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setActiveFilter('Все')
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
            }}
            aria-label="Чаты"
          >
            <img src="/icons/chat100.png" alt="" />
          </button>
          <button
            type="button"
            className={!searchOpen && bottomSection === 'contacts' ? 'soft-button icon-button active' : 'soft-button icon-button'}
            onClick={() => {
              if (isChannelsView) {
                setStageView('main')
              }
              setTopListView('none')
              setActiveSubscriptionChannelId(null)
              setBottomSection('contacts')
              setSearchOpen(false)
              setQuery('')
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setActiveFilter('Все')
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
            }}
            aria-label="Контакты"
          >
            <img src="/icons/contacts100.svg" alt="" />
          </button>
          <button
            type="button"
            className={searchOpen ? 'soft-button icon-button active' : 'soft-button icon-button'}
            onClick={() => {
              if (isChannelsView) {
                setStageView('main')
              }
              setTopListView('none')
              setActiveSubscriptionChannelId(null)
              setSearchOpen(true)
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setActiveFilter('Поиск')
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
            }}
            aria-label="Поиск"
          >
            <img src="/icons/search100.svg" alt="" />
          </button>
          {sessionHasPremium ? (
            <button
              type="button"
              className={isChannelsView ? 'soft-button icon-button icon-button-channel active' : 'soft-button icon-button icon-button-channel'}
              onClick={() => openChannelsListView()}
              aria-label="Каналы"
            >
              <img src="/icons/omnichannel100.png" alt="" />
            </button>
          ) : (
            <button
              type="button"
              className="soft-button icon-button"
              onClick={() => {
                setRetainedAllChatId(null)
                setRetainedFavoriteChatId(null)
                setRetainedSubscriptionChannelId(null)
                setRetainedGroupId(null)
                setStageView('premium')
                setConfirmingLogout(false)
                setPremiumGiftChatId(null)
                setActiveGroupId(null)
                setActiveGroupMessageId(null)
                setForwardingGroupMessageText('')
                setGroupMessageActionAnchor(null)
              }}
              aria-label="Премиум"
            >
              <img src="/icons/crown100.png" alt="" />
            </button>
          )}
          <button
            type="button"
            className={isSettingsView ? 'soft-button icon-button active' : 'soft-button icon-button'}
            onClick={() => {
              setRetainedAllChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setRetainedGroupId(null)
              setStageView('settings')
              setSettingsView('profile')
              setConfirmingLogout(false)
              setActiveGroupId(null)
              setActiveGroupMessageId(null)
              setForwardingGroupMessageText('')
              setGroupMessageActionAnchor(null)
            }}
            aria-label="Настройки"
          >
            <img src="/icons/settings50.svg" alt="" />
          </button>
        </div>
        </aside>
      ) : null}

      <section
        className={
          isPremiumView
            ? 'stage settings-open premium-open'
            : isSettingsView
              ? 'stage settings-open'
            : isChannelsView
              ? 'stage channels-open'
            : isChatOpen || isSubscriptionChannelOpen || isGroupOpen
              ? 'stage chat-open'
              : 'stage'
        }
      >
        {!isSettingsView &&
        !isPremiumView &&
        !isChannelsView &&
        !activeChat &&
        !activeSubscriptionChannel &&
        !activeGroup ? (
          <div className="hero-panel hero-panel-idle">
            <div>
              <p className="eyebrow">Личный канал</p>
              <h2>Мессенджер для тихих разговоров и маленьких секретов</h2>
            </div>
          </div>
        ) : null}

        {isSettingsView ? (
          <section className="settings-view">
            <div className="settings-panel">
              <div className="settings-heading">
                <p className="eyebrow">Настройки</p>
                <h2>{formatSessionName(session)}</h2>
                <p className="settings-identity">{session.identifier}</p>
              </div>

              {settingsView === 'profile' ? (
                <div className="settings-stack">
                  <article className="settings-item">
                    <span className="settings-label">Имя</span>
                    <input
                    type="text"
                    className="settings-input"
                    value={session.displayName}
                    maxLength={displayNameFieldMaxLength}
                    onChange={(event) =>
                      updateSessionProfile({ displayName: event.target.value })
                    }
                    />
                  </article>
                  <article className="settings-item">
                    <span className="settings-label">Фамилия</span>
                    <input
                    type="text"
                    className="settings-input"
                    value={session.surname ?? ''}
                    maxLength={surnameFieldMaxLength}
                    onChange={(event) =>
                      updateSessionProfile({ surname: event.target.value })
                    }
                    />
                  </article>
                  <article className="settings-item">
                    <span className="settings-label">Статус</span>
                    <input
                      type="text"
                      className="settings-input"
                      value={session.status ?? ''}
                      placeholder="Статус не задан"
                      maxLength={statusFieldMaxLength}
                      onChange={(event) =>
                        updateSessionProfile({ status: event.target.value })
                      }
                    />
                  </article>
                  <article className="settings-item">
                    <span className="settings-label">Никнейм</span>
                    <label className="settings-handle">
                      <span>@</span>
                      <input
                        type="text"
                        className="settings-input handle-input"
                        value={session.nickname ?? ''}
                        placeholder="nickname"
                        maxLength={nicknameFieldMaxLength}
                        onChange={(event) =>
                          updateSessionProfile({
                            nickname: normalizeNickname(event.target.value),
                          })
                        }
                      />
                    </label>
                  </article>
                </div>
              ) : settingsView === 'management' ? (
                <div className="settings-stack">
                  <article className="settings-item">
                    <span className="settings-label">Аккаунт</span>
                    <p className="settings-text">
                      Управление номером, учётной записью и запросами на удаление данных.
                    </p>
                  </article>
                  <button
                    type="button"
                    className="settings-action-card"
                    onClick={() => setSettingsView('blocked')}
                  >
                    Заблокированные контакты
                  </button>
                  <button type="button" className="settings-action-card">
                    Сменить номер телефона
                  </button>
                  <a
                    className="settings-action-card settings-action-link"
                    href="/privacy-policy.html"
                  >
                    Политика в отношении обработки персональных данных
                  </a>
                  <article className="settings-item settings-consent-card">
                    <span className="settings-label">Cookie и аналитика</span>
                    <strong className="settings-consent-status">{cookieConsentStatus}</strong>
                    <p className="settings-text">
                      Необходимые cookie нужны для входа, защиты сессии и сохранения настроек.
                      Аналитические cookie помогают улучшать Tinychok и включаются только после
                      вашего выбора. Подробнее в{' '}
                      <a className="settings-inline-link" href="/privacy-policy.html">
                        Политике обработки персональных данных
                      </a>
                      .
                    </p>
                    <button
                      type="button"
                      className="soft-button settings-consent-toggle"
                      onClick={() => updateCookieConsent(nextCookieConsentChoice)}
                    >
                      {cookieConsentToggleLabel}
                    </button>
                  </article>
                  <button type="button" className="settings-action-card danger">
                    Удалить аккаунт
                  </button>
                  <button type="button" className="settings-action-card danger">
                    Удалить данные и аккаунт
                  </button>
                </div>
              ) : (
                <div className="settings-stack">
                  <article className="settings-item">
                    <span className="settings-label">Заблокированные контакты</span>
                    <p className="settings-text">
                      Контакты скрыты из списка, но переписка с ними сохранена.
                    </p>
                  </article>
                  {blockedChats.length > 0 ? (
                    blockedChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        className="settings-action-card"
                        onClick={() => setBlockedActionChatId(chat.id)}
                      >
                        {chat.title}
                      </button>
                    ))
                  ) : (
                    <article className="settings-item">
                      <p className="settings-text">Пока нет заблокированных контактов.</p>
                    </article>
                  )}
                  {blockedActionChatId !== null ? (
                    <div className="settings-popover">
                      <button
                        type="button"
                        className="settings-action-card danger"
                        onClick={() => deleteChatHistory(blockedActionChatId)}
                      >
                        Удалить переписку
                      </button>
                      <button
                        type="button"
                        className="settings-action-card"
                        onClick={() => unblockChat(blockedActionChatId)}
                      >
                        Вернуть контакт
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="settings-actions">
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    setStageView('main')
                    setConfirmingLogout(false)
                  }}
                >
                  Назад
                </button>
                {settingsView === 'profile' ? (
                  <button
                    type="button"
                    className="soft-button"
                    onClick={() => {
                      setSettingsView('management')
                      setConfirmingLogout(false)
                      setBlockedActionChatId(null)
                    }}
                  >
                    Управление
                  </button>
                ) : (
                  <button
                    type="button"
                    className="soft-button"
                    onClick={() => {
                      setSettingsView(settingsView === 'blocked' ? 'management' : 'profile')
                      setConfirmingLogout(false)
                      setBlockedActionChatId(null)
                    }}
                  >
                    {settingsView === 'blocked' ? 'Управление' : 'К настройкам'}
                  </button>
                )}
                <button
                  type="button"
                  className="soft-button icon-button"
                  onClick={() => {
                    setStageView('premium')
                    setPremiumGiftChatId(null)
                    setConfirmingLogout(false)
                  }}
                  aria-label="Премиум"
                >
                  <img src="/icons/crown100.png" alt="" />
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setConfirmingLogout(true)}
                >
                  Выйти
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isPremiumView ? (
          <section className="settings-view premium-view">
            <div className="settings-panel premium-panel">
              <div className="settings-heading premium-heading">
                {premiumGiftChat ? (
                  <>
                    <div className="premium-gift-title">
                      <h2>Подарить Премиум</h2>
                      <img src="/icons/crown100.png" alt="" />
                    </div>
                    <p className="premium-gift-contact">{`Контакту ${premiumGiftChat.title}`}</p>
                  </>
                ) : (
                  <h2>{sessionHasPremium ? 'Продли премиум Тайничок' : 'Премиум Тайничок'}</h2>
                )}
                <p className="settings-copy">
                  {premiumGiftChat
                    ? 'В Тайничке нет рекламы, поэтому, совершая покупку, вы помогаете обслуживать серверы.'
                    : 'В Тайничке нет рекламы, поэтому, совершая покупку, вы помогаете обслуживать серверы.'}
                </p>
                {!premiumGiftChat && sessionHasPremium && premiumDaysLeft !== null ? (
                  <p className="premium-gift-contact">
                    {premiumDaysLeft > 0
                      ? `Премиум активен ещё ${premiumDaysLeft} дн.`
                      : 'Премиум заканчивается сегодня'}
                  </p>
                ) : null}
              </div>

              <div className="premium-stack">
                <article className="premium-card">
                  <div className="premium-price">
                    <strong>199р</strong>
                    <span>/ месяц</span>
                  </div>
                  <p className="premium-note">Для спокойного доступа ко всем премиум-возможностям.</p>
                  <ul className="premium-features">
                    <li>
                      <span className="premium-feature-crown">
                        <span>Добавляет к имени</span>
                        <img src="/icons/crown64.png" alt="" aria-hidden="true" />
                      </span>
                    </li>
                    <li>Увеличивает срок хранения файлов и фотографий</li>
                    <li>Создание тематических каналов</li>
                  </ul>
                  <button type="button" className="send-button premium-submit">
                    Выбрать месяц
                  </button>
                </article>

                <article className="premium-card premium-card-annual">
                  <div className="premium-price">
                    <strong>1390р</strong>
                    <span>/ год</span>
                  </div>
                  <p className="premium-note">Выгоднее для тех, кто остаётся в Тайничке надолго.</p>
                  <ul className="premium-features">
                    <li>
                      <span className="premium-feature-crown">
                        <span>Добавляет к имени</span>
                        <img src="/icons/crown64.png" alt="" aria-hidden="true" />
                      </span>
                    </li>
                    <li>Увеличивает срок хранения файлов и фотографий</li>
                    <li>Создание тематических каналов</li>
                  </ul>
                  <button type="button" className="send-button premium-submit">
                    Выбрать год
                  </button>
                </article>
              </div>

              <div className="settings-actions">
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    setStageView('main')
                    setPremiumGiftChatId(null)
                  }}
                >
                  Назад
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isChannelsListView ? (
          <section className="channels-view">
            <div ref={channelsPanelRef} className="settings-panel channels-manager-panel">
              <div className="channels-screen-header">
                <p className="eyebrow">Каналы</p>
                <h2>Управление каналами</h2>
                <p className="settings-copy">Каналы, которыми вы управляете сейчас.</p>
              </div>

              <div className="channels-manager-content">
                {channels.length > 0 ? (
                  <div className="channels-list">
                    {channels.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        className="channel-card"
                        onClick={() => openChannelDetailView(channel.id)}
                      >
                        <span className="channel-avatar" style={{ backgroundColor: channel.avatarTone }}>
                          {channel.avatarImage ? (
                            <img src={channel.avatarImage} alt="" className="channel-avatar-image" />
                          ) : (
                            formatChannelAvatarLabel(channel.title)
                          )}
                        </span>
                        <span className="channel-card-copy">
                          <strong className="channel-card-title">
                            <span>{channel.title}</span>
                            <span className="chat-star">
                              <img src="/icons/news100.svg" alt="Канал" />
                            </span>
                          </strong>
                          <span>{channel.status === 'draft' ? 'Черновик канала' : 'Активный канал'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <article className="settings-item">
                    <p className="settings-text">Пока нет каналов. Создайте первый канал из этой сцены.</p>
                  </article>
                )}
              </div>

              <div className="settings-actions channels-manager-actions">
                <button type="button" className="soft-button" onClick={() => setStageView('main')}>
                  Назад
                </button>
                <button
                  type="button"
                  className="send-button channels-create-button"
                  onClick={openChannelCreateView}
                >
                  Создать канал
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isChannelCreateView ? (
          <section className="channels-view">
            <div ref={channelsPanelRef} className="settings-panel channels-detail-panel">
              <div className="channels-screen-header">
                <p className="eyebrow">Каналы</p>
                <h2>Создать канал</h2>
                <p className="settings-copy">
                  Подготовьте черновик канала: название, прямую ссылку, аватарку и описание.
                </p>
              </div>

              <div className="channels-fields">
                <article className="settings-item">
                  <span className="settings-label">Название канала</span>
                  <input
                    type="text"
                    className="settings-input"
                    maxLength={channelTitleMaxLength}
                    value={creatingChannelTitle}
                    onChange={(event) => setCreatingChannelTitle(event.target.value.slice(0, channelTitleMaxLength))}
                  />
                </article>

                <article className="settings-item">
                  <span className="settings-label">Прямая ссылка</span>
                  <input
                    type="text"
                    className="settings-input"
                    value={creatingChannelDirectLink}
                    onChange={(event) => setCreatingChannelDirectLink(event.target.value)}
                  />
                </article>

                <article className="settings-item">
                  <span className="settings-label">Аватарка канала</span>
                  <div className="channel-avatar-settings">
                    <span className="channel-avatar channel-avatar-large" style={{ backgroundColor: creatingChannelAvatarTone }}>
                      {formatChannelAvatarLabel(creatingChannelTitle || 'Новый канал')}
                    </span>
                    <div className="channel-avatar-copy">
                      <p className="settings-text">
                        Сейчас используется аккуратная заглушка. Можно переключить вариант аватарки до загрузки настоящего изображения.
                      </p>
                      <button
                        type="button"
                        className="soft-button"
                        onClick={() => {
                          const currentToneIndex = channelAvatarTones.indexOf(creatingChannelAvatarTone)
                          const nextToneIndex =
                            currentToneIndex === -1 ? 0 : (currentToneIndex + 1) % channelAvatarTones.length
                          setCreatingChannelAvatarTone(channelAvatarTones[nextToneIndex])
                        }}
                      >
                        Сменить аватарку
                      </button>
                    </div>
                  </div>
                </article>

                <article className="settings-item channel-description-card">
                  <span className="settings-label">Описание канала</span>
                  <textarea
                    className="channel-description-input"
                    maxLength={channelDescriptionMaxLength}
                    value={creatingChannelDescription}
                    onChange={(event) =>
                      setCreatingChannelDescription(
                        event.target.value.slice(0, channelDescriptionMaxLength),
                      )
                    }
                  />
                </article>
              </div>

              <div className="settings-actions">
                <button type="button" className="soft-button" onClick={openChannelsListView}>
                  Назад
                </button>
                <button type="button" className="send-button" onClick={createChannel}>
                  Создать канал
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isChannelDetailView ? (
          <section className="channels-view">
            <div ref={channelsPanelRef} className="settings-panel channels-detail-panel">
              {activeChannel ? (
                <>
                  <div className="channels-heading">
                    <div className="channels-heading-main">
                      <div className="channel-header-avatar-stack">
                        <span
                          className="channel-avatar channel-avatar-large"
                          style={{ backgroundColor: activeChannel.avatarTone }}
                        >
                          {activeChannel.avatarImage ? (
                            <img src={activeChannel.avatarImage} alt="" className="channel-avatar-image" />
                          ) : (
                            formatChannelAvatarLabel(activeChannel.title)
                          )}
                        </span>
                        <button
                          type="button"
                          className="soft-button channel-avatar-change"
                          onClick={() => openChannelAvatarPicker(activeChannel.id)}
                        >
                          Сменить
                        </button>
                      </div>
                      <div className="channel-title-block">
                        <div className="channel-title-row">
                          <h3>{activeChannel.title}</h3>
                          <button
                            type="button"
                            className="soft-button channel-title-edit"
                            onClick={() => openChannelTitleEditor(activeChannel)}
                            aria-label="Редактировать название канала"
                            title="Редактировать название канала"
                          >
                            <img src="/icons/edit100.png" alt="" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="channels-fields">
                    <article className="settings-item">
                      <span className="settings-label">Прямая ссылка</span>
                      <div className="channel-link-field">
                        <input
                          type="text"
                          className="settings-input channel-link-input"
                          value={
                            activeChannel.visibility === 'closed'
                              ? 'Недоступно для закрытого канала'
                              : activeChannel.directLink
                          }
                          readOnly={activeChannel.visibility === 'closed'}
                          onChange={(event) =>
                            updateChannel(activeChannel.id, { directLink: event.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="soft-button channel-link-copy"
                          onClick={() => copyToClipboard(activeChannel.directLink)}
                          aria-label="Копировать ссылку"
                          title="Копировать ссылку"
                          disabled={activeChannel.visibility === 'closed'}
                        >
                          <img src="/icons/copy100.png" alt="" />
                        </button>
                      </div>
                    </article>

                    <article className="settings-item channel-description-card">
                      <span className="settings-label">Описание канала</span>
                      <textarea
                        className="channel-description-input"
                        maxLength={channelDescriptionMaxLength}
                        value={activeChannel.description}
                        onChange={(event) =>
                          updateChannel(activeChannel.id, {
                            description: event.target.value.slice(0, channelDescriptionMaxLength),
                          })
                        }
                      />
                    </article>

                    <article className="settings-item channel-privacy-card">
                      <span className="settings-label">Приватность канала</span>
                      <div className="channel-privacy-row">
                        <div className="channel-privacy-content">
                          <strong>{getChannelVisibilityLabel(activeChannel.visibility)}</strong>
                          <p className="settings-text">
                            {getChannelVisibilityDescription(activeChannel.visibility)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="soft-button channel-privacy-toggle"
                          onClick={() =>
                            updateChannel(activeChannel.id, {
                              visibility: getNextChannelVisibility(activeChannel.visibility),
                            })
                          }
                          aria-label="Изменить приватность канала"
                          title="Изменить приватность канала"
                        >
                          <img src="/icons/reset100.png" alt="" />
                        </button>
                      </div>
                    </article>
                  </div>

                  <div className="channels-actions">
                    <button
                      type="button"
                      className="settings-action-card danger"
                      onClick={() => setConfirmingDeleteChannelId(activeChannel.id)}
                    >
                      Удалить канал
                    </button>
                    <button
                      type="button"
                      className="settings-action-card"
                      onClick={() => startChannelTransfer(activeChannel.id)}
                    >
                      Передать
                    </button>
                  </div>
                </>
              ) : (
                <div className="channels-empty-state">
                  <p className="eyebrow">Канал</p>
                  <h3>Канал не найден</h3>
                  <p className="settings-copy">
                    Вернитесь к списку каналов и выберите другой черновик.
                  </p>
                </div>
              )}

              <div className="settings-actions">
                <button type="button" className="soft-button" onClick={openChannelsListView}>
                  Назад
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isSubscriptionChannelOpen ? (
          <SubscriptionChannelRoom
            actions={subscriptionPostActions}
            activePostId={activeSubscriptionPostId}
            channel={activeSubscriptionChannel}
            messageFeedRef={messageFeedRef}
            onBack={closeActiveRoom}
            onPostSelect={(event, postId) => {
              setActiveSubscriptionPostId(postId)
              scheduleActionAnchor(event.currentTarget, 'start', setSubscriptionPostActionAnchor)
              setForwardingSubscriptionPostText('')
            }}
          />
        ) : null}

        {isGroupOpen ? (
          <GroupRoom
            actions={groupMessageActions}
            activeMessageId={activeGroupMessageId}
            draft={groupMessageDrafts[activeGroup.id] ?? ''}
            group={activeGroup}
            messageFeedRef={messageFeedRef}
            onBack={closeActiveRoom}
            onComposerFocus={closeGroupMessageActions}
            onDraftChange={(value) => updateGroupDraft(activeGroup.id, value)}
            onMessageSelect={(event, message) => {
              setActiveGroupMessageId(message.id)
              scheduleActionAnchor(
                event.currentTarget,
                message.author === 'me' ? 'end' : 'start',
                setGroupMessageActionAnchor,
              )
              setForwardingGroupMessageText('')
            }}
            onSubmit={sendGroupMessage}
          />
        ) : null}

        {isChatOpen ? (
          <>
            <DirectChatRoom
              activeChat={activeChat}
              activeMessageId={messageActionMessageId}
              attachmentInputRef={attachmentInputRef}
              attachmentName={chatAttachmentNames[activeChat.id] ?? ''}
              chatActionsOpen={chatActionsOpen}
              draft={chatMessageDrafts[activeChat.id] ?? ''}
              messageFeedRef={messageFeedRef}
              pinnedMessage={pinnedMessage}
              quietMode={quietMode}
              replyTarget={replyTarget}
              onAttachmentChange={handleChatAttachmentChange}
              onBack={closeActiveRoom}
              onBlockChat={() => blockChat(activeChat.id)}
              onCloseChatActions={() => setChatActionsOpen(false)}
              onDraftChange={(value) => updateChatDraft(activeChat.id, value)}
              onMessageSelect={(event, message) => {
                setMessageActionMessageId(message.id)
                scheduleActionAnchor(
                  event.currentTarget,
                  message.author === 'me' ? 'end' : 'start',
                  setMessageActionAnchor,
                )
              }}
              onOpenAttachmentPicker={openAttachmentPicker}
              onOpenPremiumGift={() => {
                setPremiumGiftChatId(activeChat.id)
                setStageView('premium')
                setChatActionsOpen(false)
              }}
              onReplyCancel={() => setReplyTarget(null)}
              onRequestDeleteContact={() => {
                setConfirmingDeleteContactChatId(activeChat.id)
                setChatActionsOpen(false)
              }}
              onRequestDeleteHistory={() => {
                setConfirmingDeleteHistoryChatId(activeChat.id)
                setChatActionsOpen(false)
              }}
              onSubmit={sendMessage}
              onToggleChatActions={() => setChatActionsOpen((current) => !current)}
              onToggleFavoriteChat={() => togglePinnedChat(activeChat.id)}
              onUnpinMessage={() => unpinMessage(activeChat.id)}
            />

            {activeMessage ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть меню сообщения"
                  onClick={() => {
                    setMessageActionMessageId(null)
                    setMessageActionAnchor(null)
                  }}
                />
                {messageActionAnchor ? (
                  <div
                    ref={messageMenuRef}
                    className="message-menu"
                    style={messageMenuStyle}
                  >
                    <button type="button" className="message-menu-item" onClick={() => replyToMessage(activeMessage)}>
                      Ответить
                    </button>
                    <button
                      type="button"
                      className="message-menu-item"
                      onClick={() => copyMessageText(activeMessage.text)}
                    >
                      Копировать текст
                    </button>
                    <button
                      type="button"
                      className="message-menu-item"
                      onClick={() => pinMessage(activeChat.id, activeMessage.id)}
                    >
                      Закрепить
                    </button>
                    <button
                      type="button"
                      className="message-menu-item"
                      onClick={() => {
                        setForwardingMessageId(activeMessage.id)
                        setMessageActionMessageId(null)
                        setMessageActionAnchor(null)
                      }}
                    >
                      Переслать
                    </button>
                    <button
                      type="button"
                      className="message-menu-item danger"
                      onClick={() => {
                        setConfirmingDeleteMessageId(activeMessage.id)
                        setMessageActionMessageId(null)
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {forwardingMessage ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть пересылку"
                  onClick={() => setForwardingMessageId(null)}
                />
                <div className="room-confirm room-forward">
                  <p className="room-confirm-copy">Кому переслать сообщение?</p>
                  <div className="room-forward-list">
                    {availableChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        className="room-forward-item"
                        onClick={() => forwardMessageToChat(chat.id, forwardingMessage)}
                      >
                        <span className="avatar" style={{ backgroundColor: chat.accent }}>
                          {chat.title.slice(0, 1)}
                        </span>
                        <span>{chat.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {confirmingDeleteHistoryChatId !== null ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть подтверждение"
                  onClick={() => setConfirmingDeleteHistoryChatId(null)}
                />
                <div className="room-confirm">
                  <p className="room-confirm-copy">
                    Вы точно хотите удалить всю переписку с этим контактом?
                  </p>
                  <div className="room-confirm-actions">
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => deleteChatHistory(confirmingDeleteHistoryChatId)}
                    >
                      Удалить у меня
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => deleteChatHistory(confirmingDeleteHistoryChatId)}
                    >
                      Удалить у всех
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button"
                      onClick={() => setConfirmingDeleteHistoryChatId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {confirmingDeleteMessageId !== null ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть подтверждение удаления сообщения"
                  onClick={() => setConfirmingDeleteMessageId(null)}
                />
                <div className="room-confirm">
                  <p className="room-confirm-copy">Удалить это сообщение?</p>
                  <div className="room-confirm-actions">
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => deleteMessage(activeChat.id, confirmingDeleteMessageId)}
                    >
                      Удалить у меня
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => deleteMessage(activeChat.id, confirmingDeleteMessageId)}
                    >
                      Удалить у всех
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button"
                      onClick={() => setConfirmingDeleteMessageId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {confirmingDeleteContactChatId !== null ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть подтверждение удаления контакта"
                  onClick={() => setConfirmingDeleteContactChatId(null)}
                />
                <div className="room-confirm">
                  <p className="room-confirm-copy">
                    {`Удалить контакт ${
                      chats.find((chat) => chat.id === confirmingDeleteContactChatId)?.title ?? ''
                    } и всю переписку с ним?`}
                  </p>
                  <div className="room-confirm-actions">
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => blockThenDeleteChat(confirmingDeleteContactChatId)}
                    >
                      Удалить и заблокировать
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button room-confirm-danger"
                      onClick={() => deleteContact(confirmingDeleteContactChatId)}
                    >
                      Да, удалить
                    </button>
                    <button
                      type="button"
                      className="room-confirm-button"
                      onClick={() => setConfirmingDeleteContactChatId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {confirmingDeleteChannelId !== null ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть подтверждение удаления канала"
              onClick={() => setConfirmingDeleteChannelId(null)}
            />
            <div className="room-confirm room-confirm-compact">
              <p className="room-confirm-copy">
                {`Удалить канал ${
                  channels.find((channel) => channel.id === confirmingDeleteChannelId)?.title ?? ''
                }?`}
              </p>
              <div className="room-confirm-actions room-confirm-actions-dual">
                <button
                  type="button"
                  className="room-confirm-button room-confirm-danger"
                  onClick={() => deleteChannel(confirmingDeleteChannelId)}
                >
                  Удалить канал
                </button>
                <button
                  type="button"
                  className="room-confirm-button"
                  onClick={() => setConfirmingDeleteChannelId(null)}
                >
                  Отмена
                </button>
              </div>
            </div>
          </>
        ) : null}

        {transferringChannel ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть передачу канала"
              onClick={closeChannelTransfer}
            />
            {channelTransferTarget ? (
              <div className="room-confirm room-transfer-confirm">
                <p className="room-confirm-copy">
                  {`Подтвердите передачу канала ${transferringChannel.title} контакту ${channelTransferTarget.title}.`}
                </p>
                <div className="auth-code-note room-transfer-note">
                  <span className="settings-label">SMS отправлена на номер</span>
                  <strong>{channelTransferTarget.phone}</strong>
                </div>
                <label className="auth-field">
                  <span>Код из SMS</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Например, 4821"
                    value={channelTransferCode}
                    onChange={(event) =>
                      setChannelTransferCode(event.target.value.replace(/[^\d]/g, ''))
                    }
                  />
                </label>
                {channelTransferError ? <p className="auth-error">{channelTransferError}</p> : null}
                <div className="room-confirm-actions room-confirm-actions-dual">
                  <button
                    type="button"
                    className="room-confirm-button room-confirm-danger"
                    onClick={submitChannelTransfer}
                  >
                    Подтвердить передачу
                  </button>
                  <button
                    type="button"
                    className="room-confirm-button"
                    onClick={() => {
                      setChannelTransferTargetChatId(null)
                      setChannelTransferCode('')
                      setChannelTransferError('')
                    }}
                  >
                    Назад к списку
                  </button>
                </div>
              </div>
            ) : (
              <div className="room-confirm room-forward room-transfer-list">
                <p className="room-confirm-copy">Кому передать этот канал?</p>
                <label className="search room-transfer-search">
                  <span className="search-label">Поиск контакта</span>
                  <input
                    type="search"
                    placeholder="Имя, @handle или номер"
                    value={channelTransferSearch}
                    onChange={(event) => setChannelTransferSearch(event.target.value)}
                  />
                </label>
                <div className="room-forward-list">
                  {channelTransferResults.length > 0 ? (
                    channelTransferResults.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        className="room-forward-item"
                        onClick={() => selectChannelTransferTarget(chat.id)}
                      >
                        <span className="avatar" style={{ backgroundColor: chat.accent }}>
                          {chat.title.slice(0, 1)}
                        </span>
                        <span>{chat.title}</span>
                      </button>
                    ))
                  ) : (
                    <article className="settings-item room-transfer-empty">
                      <p className="settings-text">Контакт не найден. Попробуйте другой ник или номер.</p>
                    </article>
                  )}
                </div>
                <button
                  type="button"
                  className="room-confirm-button"
                  onClick={closeChannelTransfer}
                >
                  Назад
                </button>
              </div>
            )}
          </>
        ) : null}

        {editingChannelTitleId !== null ? (
          <>
            <button
              type="button"
              className="room-confirm-scrim"
              aria-label="Закрыть редактирование названия канала"
              onClick={() => {
                setEditingChannelTitleId(null)
                setEditingChannelTitleValue('')
              }}
            />
            <div className="channel-title-popover">
              <p className="settings-label">Название канала</p>
              <input
                type="text"
                className="settings-input"
                maxLength={channelTitleMaxLength}
                value={editingChannelTitleValue}
                onChange={(event) =>
                  setEditingChannelTitleValue(event.target.value.slice(0, channelTitleMaxLength))
                }
              />
              <div className="channel-title-popover-actions">
                <button type="button" className="soft-button" onClick={submitChannelTitleEdit}>
                  Сохранить
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setEditingChannelTitleId(null)
                    setEditingChannelTitleValue('')
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          </>
        ) : null}

        <input
          ref={channelAvatarInputRef}
          type="file"
          accept="image/*"
          className="composer-attachment-input"
          onChange={handleChannelAvatarChange}
        />
        {copyHintText ? <div className="copy-hint">{copyHintText}</div> : null}
      </section>
      </main>
      {cookieConsentBanner}
    </>
  )
}

export default App
