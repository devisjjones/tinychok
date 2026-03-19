import { type ChangeEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './App.css'

type Message = {
  id: number
  author: 'me' | 'them'
  text: string
  time: string
  replyTo?: {
    text: string
    author: 'me' | 'them'
  }
  forwarded?: boolean
}

type Chat = {
  id: number
  title: string
  handle: string
  phone: string
  accent: string
  mood: string
  status: string
  online?: boolean
  lastSeen?: string
  typing?: boolean
  unread: number
  pinned?: boolean
  premium?: boolean
  pinnedMessageId?: number
  messages: Message[]
}

type SearchResult = {
  id: number
  title: string
  handle: string
  phone: string
  accent: string
  subtitle: string
}

type SubscriptionChannel = {
  id: number
  title: string
  handle: string
  accent: string
  preview: string
  time: string
  unread: number
  draft?: boolean
  visibility: 'private' | 'public' | 'closed'
  posts: Array<{
    id: number
    text: string
    time: string
  }>
}

type GroupPreview = {
  id: number
  title: string
  handle: string
  accent: string
  preview: string
  time: string
  unread: number
  members: number
}

type ActionAnchor = {
  top: number
  bottom: number
  left: number
  width: number
}

type Channel = {
  id: number
  title: string
  directLink: string
  description: string
  avatarTone: string
  avatarImage?: string
  status: 'draft' | 'active'
  visibility: 'private' | 'public' | 'closed'
}

type ChannelsView = 'list' | 'create' | 'detail'
type TopListView = 'none' | 'channels' | 'groups'

type AuthStep = 'phone' | 'code' | 'profile'

type Account = {
  identifier: string
  displayName: string
  surname?: string
  nickname?: string
  status?: string
  premium?: boolean
  premiumExpiresAt?: string
  blockedContactIds?: number[]
  createdAt: string
}

type Session = {
  identifier: string
  displayName: string
  surname?: string
  nickname?: string
  status?: string
  premium?: boolean
  premiumExpiresAt?: string
  blockedContactIds?: number[]
}

type StageView = 'main' | 'settings' | 'premium' | 'channels'
type SettingsView = 'profile' | 'management' | 'blocked'

const displayNameFieldMaxLength = 24
const surnameFieldMaxLength = 32
const nicknameFieldMaxLength = 16
const statusFieldMaxLength = 80
const accountStatusMaxFontSize = 15
const accountStatusMinFontSize = 10.5
const channelTitleMaxLength = 30
const channelDescriptionMaxLength = 160
const channelActionMenuWidth = 280
const channelActionMenuHeight = 132
const channelBlockedMenuHeight = 146
const chatActionMenuWidth = 320
const chatActionMenuHeight = 290

const initialChats: Chat[] = [
  {
    id: 1,
    title: 'Мира',
    handle: '@mira_night',
    phone: '+79673215453',
    accent: '#ff8a5b',
    mood: 'Вайбит',
    status: 'печатает ответ в тайник',
    online: true,
    typing: true,
    unread: 2,
    pinned: true,
    premium: true,
    messages: [
      { id: 1, author: 'them', text: 'Нужен мессенджер без лишнего шума.', time: '21:03' },
      { id: 2, author: 'me', text: 'Делаем. Только свои люди и приватные треды.', time: '21:05' },
      {
        id: 3,
        author: 'them',
        text: 'И чтобы чат ощущался как личный тайник, не как очередной work app.',
        time: '21:08',
      },
    ],
  },
  {
    id: 2,
    title: 'Соня',
    handle: '@sonya.jpeg',
    phone: '+79885551212',
    accent: '#66d9b8',
    mood: 'На месте',
    status: 'На месте',
    lastSeen: 'была в сети 8 мин назад',
    unread: 0,
    messages: [
      {
        id: 1,
        author: 'them',
        text: 'Я за тихие уведомления и большие карточки голосовых.',
        time: '19:40',
      },
      {
        id: 2,
        author: 'me',
        text: 'Тогда закладываем спокойный интерфейс и мягкий свет.',
        time: '19:47',
      },
    ],
  },
  {
    id: 3,
    title: 'Лев',
    handle: '@lev.codes',
    phone: '+79997778811',
    accent: '#8aa6ff',
    mood: 'Собирает билд',
    status: 'отправил прототип тем',
    lastSeen: 'был в сети 12 мин назад',
    unread: 4,
    premium: true,
    messages: [
      {
        id: 1,
        author: 'them',
        text: 'Лента должна быть широкой, а bubbles почти бумажные.',
        time: '18:15',
      },
      {
        id: 2,
        author: 'me',
        text: 'Сделаю. Ещё добавлю переключатель режима "Тихо".',
        time: '18:17',
      },
    ],
  },
  {
    id: 4,
    title: 'Ася',
    handle: '@asya.echo',
    phone: '+79261239876',
    accent: '#f29f67',
    mood: 'Слушает',
    status: 'Слушает',
    lastSeen: 'была в сети 3 мин назад',
    unread: 1,
    messages: [
      { id: 1, author: 'them', text: 'Оставим интерфейс тихим и светлым.', time: '17:52' },
    ],
  },
  {
    id: 5,
    title: 'Никита',
    handle: '@nikita.wave',
    phone: '+79035554422',
    accent: '#6eb6ff',
    mood: 'В дороге',
    status: 'открыл чат с телефона',
    online: true,
    unread: 0,
    messages: [
      { id: 1, author: 'me', text: 'Проверь, как список ведёт себя на маленькой высоте.', time: '17:31' },
    ],
  },
  {
    id: 6,
    title: 'Полина',
    handle: '@poly.secret',
    phone: '+79161234567',
    accent: '#82c9a3',
    mood: 'На связи',
    status: 'отправила голосовое',
    online: true,
    unread: 3,
    pinned: true,
    premium: true,
    messages: [
      { id: 1, author: 'them', text: 'Хочу больше воздуха между карточками и мягче тени.', time: '17:08' },
    ],
  },
  {
    id: 7,
    title: 'Илья',
    handle: '@ilya.grid',
    phone: '+79001112233',
    accent: '#d18fff',
    mood: 'Рядом',
    status: 'ждёт ответ',
    lastSeen: 'был в сети 5 мин назад',
    unread: 0,
    messages: [
      { id: 1, author: 'them', text: 'Проверь скролл и обрезание бейджей сверху.', time: '16:54' },
    ],
  },
  {
    id: 8,
    title: 'Варя',
    handle: '@varya.north',
    phone: '+79214445566',
    accent: '#ff9db1',
    mood: 'Смотрит макет',
    status: 'сохранила тред',
    online: true,
    unread: 5,
    messages: [
      { id: 1, author: 'them', text: 'Карточки уже почти идеальны, но хочется больше ритма.', time: '16:40' },
    ],
  },
  {
    id: 9,
    title: 'Гриша',
    handle: '@grisha.loop',
    phone: '+79524443322',
    accent: '#ffd166',
    mood: 'Тестирует',
    status: 'был здесь только что',
    online: true,
    unread: 0,
    messages: [
      { id: 1, author: 'me', text: 'Добавил двадцать контактов, чтобы гонять список.', time: '16:21' },
    ],
  },
  {
    id: 10,
    title: 'Лада',
    handle: '@lada.bloom',
    phone: '+79995556677',
    accent: '#7dd3fc',
    mood: 'Пишет заметки',
    status: 'набрасывает идеи',
    online: true,
    typing: true,
    unread: 2,
    messages: [
      { id: 1, author: 'them', text: 'Можно ещё проверить поведение при печати на длинных именах.', time: '16:07' },
    ],
  },
  {
    id: 11,
    title: 'Марк',
    handle: '@mark.signal',
    phone: '+79117778899',
    accent: '#9ad0c2',
    mood: 'В сети',
    status: 'ответил на сообщение',
    unread: 0,
    messages: [
      { id: 1, author: 'them', text: 'Тут хорошо бы посмотреть, как ведут себя фильтры со скроллом.', time: '15:49' },
    ],
  },
  {
    id: 12,
    title: 'Юля',
    handle: '@julia.soft',
    phone: '+79038889900',
    accent: '#fca5a5',
    mood: 'Молчит',
    status: 'без новых сообщений',
    unread: 1,
    messages: [
      { id: 1, author: 'them', text: 'Сделай кнопку настроек чуть компактнее, но не мелкой.', time: '15:36' },
    ],
  },
  {
    id: 13,
    title: 'Руслан',
    handle: '@rus_frame',
    phone: '+79650001122',
    accent: '#c4b5fd',
    mood: 'У окна',
    status: 'последний онлайн 12 мин назад',
    unread: 0,
    messages: [
      { id: 1, author: 'me', text: 'Список уже выглядит убедительно, нужно ещё больше разных состояний.', time: '15:18' },
    ],
  },
  {
    id: 14,
    title: 'Ева',
    handle: '@eva.silent',
    phone: '+79100001234',
    accent: '#86efac',
    mood: 'Тихо',
    status: 'включила беззвучный режим',
    unread: 7,
    messages: [
      { id: 1, author: 'them', text: 'Мне нравится, что бейджи теперь сидят как наклейки.', time: '15:02' },
    ],
  },
  {
    id: 15,
    title: 'Тимур',
    handle: '@timur.draft',
    phone: '+79250002211',
    accent: '#fdba74',
    mood: 'Черновик',
    status: 'собирает сценарий',
    unread: 0,
    messages: [
      { id: 1, author: 'them', text: 'Я бы ещё погонял список на старом ноутбуке.', time: '14:47' },
    ],
  },
  {
    id: 16,
    title: 'Надя',
    handle: '@nadya.line',
    phone: '+79332221100',
    accent: '#93c5fd',
    mood: 'Читает',
    status: 'читала 1 мин назад',
    unread: 2,
    messages: [
      { id: 1, author: 'them', text: 'В поиске по номеру всё должно выглядеть так же спокойно.', time: '14:30' },
    ],
  },
  {
    id: 17,
    title: 'Стас',
    handle: '@stas.cloud',
    phone: '+79001239988',
    accent: '#f0abfc',
    mood: 'В эфире',
    status: 'отправил стикер',
    unread: 0,
    messages: [
      { id: 1, author: 'them', text: 'Можем потом проверить и тёмную подложку, но не сейчас.', time: '14:11' },
    ],
  },
  {
    id: 18,
    title: 'Оля',
    handle: '@olya.mint',
    phone: '+79550004466',
    accent: '#5eead4',
    mood: 'Утро',
    status: 'сохранила сообщение',
    unread: 4,
    premium: true,
    messages: [
      { id: 1, author: 'them', text: 'Проверь, не устаёт ли глаз от плотных повторяющихся карточек.', time: '13:55' },
    ],
  },
  {
    id: 19,
    title: 'Дима',
    handle: '@dima.room',
    phone: '+79039997755',
    accent: '#fda4af',
    mood: 'Скроллит',
    status: 'открыл поиск',
    unread: 0,
    messages: [
      { id: 1, author: 'them', text: 'Если хочешь, потом добавим ещё больше людей для stress-теста.', time: '13:33' },
    ],
  },
  {
    id: 20,
    title: 'Карина',
    handle: '@karina.fold',
    phone: '+79217773311',
    accent: '#a7f3d0',
    mood: 'Спокойно',
    status: 'последний онлайн 21 мин назад',
    unread: 6,
    messages: [
      { id: 1, author: 'them', text: 'У верхних и нижних карточек теперь достаточно воздуха для бейджей.', time: '13:20' },
    ],
  },
]

const quickFilters = ['Все', '★']
const discoveryResults: SearchResult[] = [
  {
    id: 101,
    title: 'Ася',
    handle: '@asya.echo',
    phone: '+79261239876',
    accent: '#f29f67',
    subtitle: 'дизайн-система и тихие интерфейсы',
  },
  {
    id: 102,
    title: 'Никита',
    handle: '@nikita.wave',
    phone: '+79035554422',
    accent: '#6eb6ff',
    subtitle: 'ищет собеседников для night shift',
  },
  {
    id: 103,
    title: 'Полина',
    handle: '@poly.secret',
    phone: '+79161234567',
    accent: '#82c9a3',
    subtitle: 'любит voice notes и приватные комнаты',
  },
]
const initialSubscribedChannels: SubscriptionChannel[] = [
  {
    id: 1,
    title: 'Ночной архив',
    handle: '@night_archive',
    accent: '#8c5738',
    preview: 'Черновик публикации: тихие заметки и закрытые анонсы.',
    time: '22:14',
    unread: 3,
    draft: true,
    visibility: 'private',
    posts: [
      { id: 1, text: 'Первый драфтовый пост про тихие ночные заметки и редкие личные публикации.', time: '22:14' },
      { id: 2, text: 'Сюда можно складывать анонсы, которые увидят только свои люди без лишнего шума.', time: '21:48' },
      { id: 3, text: 'Визуально канал должен оставаться спокойным: много воздуха, короткие тексты и чистый ритм.', time: '21:02' },
    ],
  },
  {
    id: 2,
    title: 'Тихие релизы',
    handle: '@quiet_releases',
    accent: '#6eb6ff',
    preview: 'Новый выпуск: обновили premium flow и экран каналов.',
    time: '20:06',
    unread: 0,
    draft: true,
    visibility: 'public',
    posts: [
      { id: 1, text: 'Драфт релиза: добавлены экраны управления каналами и передача канала через SMS-подтверждение.', time: '20:06' },
      { id: 2, text: 'Следом планируется добрать больше сценариев для подписок и отдельного канального просмотра.', time: '19:34' },
    ],
  },
  {
    id: 3,
    title: 'Клуб сигналов',
    handle: '@signal_club',
    accent: '#82c9a3',
    preview: '3 новых сигнала за вечер и подборка коротких постов.',
    time: '18:42',
    unread: 5,
    draft: true,
    visibility: 'closed',
    posts: [
      { id: 1, text: 'Сигнал 01: короткие посты лучше читаются, когда у канала есть спокойная шапка и стабильный ритм.', time: '18:42' },
      { id: 2, text: 'Сигнал 02: непрочитанные публикации должны считываться мгновенно, без перегруза интерфейса.', time: '18:09' },
      { id: 3, text: 'Сигнал 03: даже черновой канал уже должен ощущаться как законченный продуктовый экран.', time: '17:27' },
    ],
  },
  {
    id: 4,
    title: 'Newsroom',
    handle: '@tiny_newsroom',
    accent: '#ff8a5b',
    preview: 'Запустили тихий режим уведомлений для каналов.',
    time: '16:11',
    unread: 2,
    visibility: 'public',
    posts: [
      { id: 1, text: 'Сегодняшний драфт: каналам добавили отдельную кнопку в верхнем меню и счётчик новых публикаций.', time: '16:11' },
      { id: 2, text: 'Следующее обновление посвятим полировке чтения постов и стабильной навигации между каналами.', time: '15:38' },
    ],
  },
]
const initialGroups: GroupPreview[] = [
  {
    id: 1,
    title: 'Ночной круг',
    handle: '@night_circle',
    accent: '#8c5738',
    preview: 'Группа для спокойных ночных обсуждений продукта и интерфейса.',
    time: '21:24',
    unread: 4,
    members: 8,
  },
  {
    id: 2,
    title: 'Тихий релиз-комитет',
    handle: '@quiet_release_committee',
    accent: '#6eb6ff',
    preview: 'Смотрим свежие сборки, правим тексты и добираем мелкие баги.',
    time: '19:16',
    unread: 0,
    members: 5,
  },
  {
    id: 3,
    title: 'Сигнальная мастерская',
    handle: '@signal_workshop',
    accent: '#82c9a3',
    preview: 'Внутренняя группа по каналам, уведомлениям и сценариям чтения.',
    time: '17:42',
    unread: 2,
    members: 11,
  },
]
const channelAvatarTones = ['#8c5738', '#6eb6ff', '#ff8a5b', '#82c9a3', '#f29f67', '#d18fff']
const initialChannels: Channel[] = [
  makeDraftChannel(1, 1),
  makeDraftChannel(2, 2),
  makeDraftChannel(3, 3),
]
const accountsStorageKey = 'tinychok.accounts'
const sessionStorageKey = 'tinychok.session'

function formatPreview(chat: Chat) {
  const latest = chat.messages.at(-1)
  return latest ? latest.text : 'Пока пусто'
}

function formatMessageAuthor(author: Message['author'], chatTitle: string) {
  return author === 'me' ? 'Вы' : chatTitle
}

function formatContactStatus(chat: Chat) {
  return chat.status.trim() || '\u00A0'
}

function formatRoomPresence(chat: Chat) {
  const parts = []
  const status = chat.status.trim()

  if (status) {
    parts.push(status)
  } else if (chat.online) {
    parts.push('в сети')
  }

  if (!chat.online && chat.lastSeen?.trim()) {
    parts.push(chat.lastSeen.trim())
  }

  return parts.join(' · ')
}

function normalizeIdentifier(value: string) {
  const trimmed = value.trim()
  const digits = trimmed.replace(/[^\d]/g, '')

  if (digits === '') return ''

  return `+${digits}`
}

function matchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase())
}

function formatSessionName(session: Session) {
  return [session.displayName, session.surname ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
}

function formatAccountName(account: Pick<Account, 'displayName' | 'surname'>) {
  return [account.displayName, account.surname ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
}

function sanitizePersonField(value: string, maxLength: number) {
  const normalizedWhitespace = value
    .replace(/[^\p{L}\p{M}\s\p{P}]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s+/g, '')

  const nextValue = /\s$/.test(normalizedWhitespace)
    ? normalizedWhitespace
    : normalizedWhitespace.trim()

  return nextValue.slice(0, maxLength)
}

function normalizeNickname(value: string) {
  return value.replace(/[^A-Za-z0-9_]/g, '').slice(0, nicknameFieldMaxLength)
}

function sanitizeStatusField(value: string) {
  return value
    .replace(/[^A-Za-zА-Яа-яЁё0-9 .,!?():;-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, statusFieldMaxLength)
}

function sanitizeChannelTitle(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, channelTitleMaxLength)
}

function sanitizeChannelDescription(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, channelDescriptionMaxLength)
}

function getActionAnchor(element: HTMLElement): ActionAnchor {
  const rect = element.getBoundingClientRect()

  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
  }
}

function getAnchoredMenuStyle(anchor: ActionAnchor, menuWidth: number, menuHeight: number) {
  const top =
    anchor.bottom + 12 + menuHeight <= window.innerHeight - 16
      ? anchor.bottom + 12
      : Math.max(16, anchor.top - menuHeight - 12)
  const left = Math.min(
    window.innerWidth - menuWidth - 16,
    Math.max(16, anchor.left + anchor.width - menuWidth),
  )

  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${menuWidth}px`,
  }
}

function makePremiumExpiry(days: number) {
  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + days)
  return expiryDate.toISOString()
}

function normalizePremiumExpiry(premium: boolean | undefined, premiumExpiresAt?: string) {
  if (!premium) return ''
  return premiumExpiresAt || makePremiumExpiry(30)
}

function getPremiumDaysLeft(premium: boolean | undefined, premiumExpiresAt?: string) {
  if (!premium || !premiumExpiresAt) return null

  const expiresAt = new Date(premiumExpiresAt).getTime()
  if (Number.isNaN(expiresAt)) return null

  const millisecondsLeft = expiresAt - Date.now()
  if (millisecondsLeft <= 0) return 0

  return Math.ceil(millisecondsLeft / (1000 * 60 * 60 * 24))
}

function isPhoneQuery(value: string) {
  return value.replace(/[^\d]/g, '').length >= 3
}

function formatNowTime() {
  return new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatChannelAvatarLabel(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function makeDraftChannel(channelNumber: number, channelId: number): Channel {
  const templates = [
    {
      title: 'Ночной архив',
      directLink: 'https://tinychok.app/c/night-archive',
      description:
        'Черновик тихого канала для личных заметок, редких анонсов и сохранённых сообщений.',
      avatarTone: '#8c5738',
    },
    {
      title: 'Тихие релизы',
      directLink: 'https://tinychok.app/c/quiet-releases',
      description: 'Канал для аккуратных обновлений продукта без шума, спама и лишних пингов.',
      avatarTone: '#6eb6ff',
    },
    {
      title: 'Клуб сигналов',
      directLink: 'https://tinychok.app/c/signal-club',
      description:
        'Подборка коротких сигналов, которые удобно публиковать для своей закрытой аудитории.',
      avatarTone: '#82c9a3',
    },
  ] as const

  const template = templates[channelNumber - 1]

  return {
    id: channelId,
    title: template?.title ?? `Новый канал ${channelNumber}`,
    directLink: template?.directLink ?? `https://tinychok.app/c/draft-${channelId}`,
    description:
      template?.description ??
      'Описание канала пока не заполнено. Здесь можно подготовить текст до публикации.',
    avatarTone: template?.avatarTone ?? channelAvatarTones[(channelNumber - 1) % channelAvatarTones.length],
    status: 'draft',
    visibility: 'private',
  }
}

function getChannelVisibilityLabel(visibility: Channel['visibility']) {
  if (visibility === 'public') return 'Публичный'
  if (visibility === 'closed') return 'Закрытый'
  return 'Приватный'
}

function getChannelVisibilityDescription(visibility: Channel['visibility']) {
  if (visibility === 'public') {
    return 'Канал можно показывать и распространять публично.'
  }

  if (visibility === 'closed') {
    return 'В канал можно попасть только по прямому приглашению от создателя.'
  }

  return 'Канал доступен только по прямой ссылке.'
}

function getNextChannelVisibility(visibility: Channel['visibility']) {
  if (visibility === 'private') return 'public'
  if (visibility === 'public') return 'closed'
  return 'private'
}

function moveUnreadItemsFirst<T extends { id: number; unread: number }>(
  items: T[],
  retainedItemId?: number | null,
) {
  const unreadItems = items.filter((item) => item.unread > 0 || item.id === retainedItemId)
  const readItems = items.filter((item) => item.unread <= 0 && item.id !== retainedItemId)

  return [...unreadItems, ...readItems]
}

function loadAccounts() {
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

function loadSession() {
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

function App() {
  const messageFeedRef = useRef<HTMLDivElement | null>(null)
  const accountStatusRef = useRef<HTMLParagraphElement | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const channelsPanelRef = useRef<HTMLDivElement | null>(null)
  const channelAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const channelAvatarObjectUrlsRef = useRef(new Set<string>())
  const [chats, setChats] = useState(initialChats)
  const [channels, setChannels] = useState(initialChannels)
  const [activeChatId, setActiveChatId] = useState<number | null>(null)
  const [retainedAllChatId, setRetainedAllChatId] = useState<number | null>(null)
  const [retainedNewChatId, setRetainedNewChatId] = useState<number | null>(null)
  const [retainedFavoriteChatId, setRetainedFavoriteChatId] = useState<number | null>(null)
  const [retainedSubscriptionChannelId, setRetainedSubscriptionChannelId] = useState<number | null>(
    null,
  )
  const [activeChannelId, setActiveChannelId] = useState<number | null>(initialChannels[0]?.id ?? null)
  const [stageView, setStageView] = useState<StageView>('main')
  const [channelsView, setChannelsView] = useState<ChannelsView>('list')
  const [settingsView, setSettingsView] = useState<SettingsView>('profile')
  const [query, setQuery] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [selectedAttachmentName, setSelectedAttachmentName] = useState('')
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
  const [replyTarget, setReplyTarget] = useState<{
    id: number
    text: string
    author: Message['author']
  } | null>(null)
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
  const [groups] = useState(initialGroups)
  const [activeSubscriptionChannelId, setActiveSubscriptionChannelId] = useState<number | null>(null)
  const [activeSubscriptionPostId, setActiveSubscriptionPostId] = useState<number | null>(null)
  const [forwardingSubscriptionPostText, setForwardingSubscriptionPostText] = useState('')
  const [messageActionAnchor, setMessageActionAnchor] = useState<ActionAnchor | null>(null)
  const [subscriptionPostActionAnchor, setSubscriptionPostActionAnchor] = useState<ActionAnchor | null>(
    null,
  )

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
  const visibleRetainedNewChatId =
    activeFilter === 'Новые' &&
    stageView === 'main' &&
    bottomSection === 'chats' &&
    topListView === 'none' &&
    !searchOpen &&
    activeChatId === retainedNewChatId
      ? retainedNewChatId
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

  const visibleChats = availableChats.filter((chat) => {
    if (searchOpen) return true
    if (bottomSection === 'contacts') return true
    if (activeFilter === '★') return Boolean(chat.pinned)
    if (activeFilter === 'Новые') return chat.unread > 0 || chat.id === visibleRetainedNewChatId

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
  const isSettingsView = stageView === 'settings'
  const isPremiumView = stageView === 'premium'
  const isChannelsView = stageView === 'channels'
  const isChannelsListView = isChannelsView && channelsView === 'list'
  const isChannelCreateView = isChannelsView && channelsView === 'create'
  const isChannelDetailView = isChannelsView && channelsView === 'detail'
  const isChatOpen = stageView === 'main' && activeChat !== null
  const isSubscriptionChannelOpen = stageView === 'main' && activeSubscriptionChannel !== null
  const isChannelsTopListOpen = topListView === 'channels'
  const isGroupsTopListOpen = topListView === 'groups'
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
  const orderedGroups = sortByUnreadEnabled ? moveUnreadItemsFirst(groups) : groups
  const totalChannelNotifications = subscriptionChannels.reduce((sum, channel) => sum + channel.unread, 0)
  const totalGroupNotifications = groups.reduce((sum, group) => sum + group.unread, 0)
  const sessionHasPremium = session?.premium ?? true
  const premiumDaysLeft = getPremiumDaysLeft(sessionHasPremium, session?.premiumExpiresAt)
  const authExistingAccount = normalizeIdentifier(identifier)
    ? loadAccounts().find((account) => account.identifier === normalizeIdentifier(identifier)) ?? null
    : null

  useEffect(() => {
    if ((!isChatOpen && !isSubscriptionChannelOpen) || !messageFeedRef.current) return

    messageFeedRef.current.scrollTop = messageFeedRef.current.scrollHeight
  }, [activeChatId, activeChatMessageCount, activeSubscriptionChannelId, isChatOpen, isSubscriptionChannelOpen])

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
    adjustAccountStatusFontSize()
  }, [adjustAccountStatusFontSize])

  useEffect(() => {
    if (!session?.status?.trim()) return

    const handleResize = () => adjustAccountStatusFontSize()
    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [adjustAccountStatusFontSize, session?.status])

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
    setRetainedNewChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedSubscriptionChannelId(null)
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
    setMessageActionAnchor(null)
    setSubscriptionPostActionAnchor(null)
  }

  function sendMessage() {
    const text = messageDraft.trim()
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

    setMessageDraft('')
    setSelectedAttachmentName('')
    setReplyTarget(null)
  }

  function openAttachmentPicker() {
    attachmentInputRef.current?.click()
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
    setRetainedNewChatId(null)
    setRetainedFavoriteChatId(null)
    setActiveChatId(null)
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

  function openChat(chatId: number) {
    const shouldRetainChatInAllFilter =
      activeFilter === 'Все' &&
      availableChats.some((chat) => chat.id === chatId && (chat.unread > 0 || chat.id === retainedAllChatId))
    const shouldRetainChatInNewFilter =
      activeFilter === 'Новые' &&
      availableChats.some((chat) => chat.id === chatId && (chat.unread > 0 || chat.id === retainedNewChatId))
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
    setRetainedNewChatId(shouldRetainChatInNewFilter ? chatId : null)
    setRetainedFavoriteChatId(shouldRetainChatInFavoritesFilter ? chatId : null)
    setRetainedSubscriptionChannelId(null)
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
    setMessageActionAnchor(null)
    setSubscriptionPostActionAnchor(null)
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
    setRetainedNewChatId(null)
    setRetainedFavoriteChatId(null)
    setRetainedSubscriptionChannelId(null)
    setStageView('channels')
    setChannelsView(nextView)
    setTopListView('none')
    setActiveSubscriptionChannelId(null)
    setActiveSubscriptionPostId(null)
    setForwardingSubscriptionPostText('')
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
      <main className="auth-shell">
        <section className="auth-panel auth-promo">
          <p className="eyebrow">Тайничок</p>
          <h1>Тихое общение без лишнего шума</h1>
          <p className="auth-copy">
            Тайничок создан для личных разговоров. Здесь по умолчанию включена тишина:
            без рекламных пушей, без баннеров, без навязчивых рассылок и случайных массовых сообщений.
          </p>
          <div className="hero-stats">
            <div>
              <strong>Тишина</strong>
              <span>включена по умолчанию</span>
            </div>
            <div>
              <strong>0 рекламы</strong>
              <span>никаких баннеров и рассылок</span>
            </div>
          </div>
        </section>

        <section className="auth-panel auth-card">
          <div className="auth-card-brand">
            <p className="eyebrow">Тайничок</p>
            <h2>Тихое общение без лишнего шума</h2>
          </div>

          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
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
          >
            {authStep === 'profile' ? (
              <label className="auth-field">
                <span>Имя в Тайничке</span>
                <input
                  type="text"
                  placeholder="Например, Луна"
                  value={displayName}
                  maxLength={displayNameFieldMaxLength}
                  onChange={(event) =>
                    setDisplayName(
                      sanitizePersonField(event.target.value, displayNameFieldMaxLength),
                    )
                  }
                />
              </label>
            ) : null}

            {authStep === 'phone' ? (
              <label className="auth-field">
                <span>Номер телефона</span>
                <input
                  type="tel"
                  placeholder="+79990000000"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
              </label>
            ) : null}

            {authStep === 'code' ? (
              <>
                {authExistingAccount ? (
                  <p className="auth-returning-title">
                    С возвращением, {formatAccountName(authExistingAccount)}
                  </p>
                ) : null}
                <div className="auth-code-note">
                  <span className="settings-label">Код отправлен на номер</span>
                  <strong>{identifier}</strong>
                </div>
                <label className="auth-field">
                  <span>Код из SMS</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Например, 4821"
                    value={smsCode}
                    onChange={(event) => setSmsCode(event.target.value.replace(/[^\d]/g, ''))}
                  />
                </label>
              </>
            ) : null}

            {authError ? <p className="auth-error">{authError}</p> : null}

            <button type="submit" className="send-button auth-submit">
              {authStep === 'phone'
                ? 'Получить код'
                : authStep === 'code'
                  ? authExistingAccount
                    ? 'Подтвердить вход'
                    : 'Подтвердить номер'
                  : 'Создать тайник'}
            </button>
          </form>

          <a className="auth-note-link" href="/privacy-policy.html">
            Политика в отношении обработки персональных данных
          </a>
        </section>
      </main>
    )
  }

  if (confirmingLogout) {
    return (
      <main className="confirm-shell">
        <section className="confirm-card">
          <p className="eyebrow">Выход</p>
          <h2>Вы точно хотите выйти из аккаунта?</h2>
          <p className="confirm-copy">
            Сессия закроется на этом устройстве. Чтобы вернуться, нужно будет снова войти по номеру телефона.
          </p>
          <div className="confirm-actions">
            <button
              type="button"
              className="send-button confirm-stay"
              onClick={() => setConfirmingLogout(false)}
            >
              Остаться
            </button>
            <button type="button" className="soft-button confirm-exit" onClick={logout}>
              Выйти
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main
      className={
        isPremiumView
          ? 'shell shell-settings shell-premium'
          : isSettingsView || isChannelsView
            ? 'shell shell-settings'
            : 'shell'
      }
    >
      {!isSettingsView && !isPremiumView && !isChannelsView ? (
        <aside className="rail">
        <div className="account-header">
          <div className="account-headline">
            <div className="account-name">
              <h2>{formatSessionName(session)}</h2>
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
                (filter === 'Все'
                  ? activeFilter === 'Все' || activeFilter === 'Новые'
                  : filter === activeFilter)
                  ? 'filter active'
                  : 'filter'
              }
              onClick={() => {
                if (filter === 'Все') {
                  setRetainedAllChatId(null)
                  setRetainedNewChatId(null)
                  setRetainedFavoriteChatId(null)
                  setRetainedSubscriptionChannelId(null)
                  setActiveFilter((current) => (current === 'Все' ? 'Новые' : 'Все'))
                  setSearchOpen(false)
                  setTopListView('none')
                  setActiveSubscriptionChannelId(null)
                  return
                }

                setRetainedAllChatId(null)
                setRetainedNewChatId(null)
                setRetainedFavoriteChatId(null)
                setRetainedSubscriptionChannelId(null)
                setActiveFilter(filter)
                setSearchOpen(false)
                setTopListView('none')
                setActiveSubscriptionChannelId(null)
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
                <span>{activeFilter === 'Новые' ? 'Новые' : 'Все'}</span>
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
              setRetainedNewChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setTopListView('channels')
              setActiveChatId(null)
              setActiveSubscriptionChannelId(null)
              setActiveSubscriptionPostId(null)
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
              setRetainedNewChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setTopListView('groups')
              setActiveChatId(null)
              setActiveSubscriptionChannelId(null)
              setActiveSubscriptionPostId(null)
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
              <article key={group.id} className="chat-card">
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
                    <span className="group-time">{group.time}</span>
                  </span>
                  <span className="chat-handle">{`${group.handle} · ${group.members} участников`}</span>
                  <span className="chat-preview">{group.preview}</span>
                </span>
                {!quietMode && group.unread > 0 ? <span className="badge">{group.unread}</span> : null}
              </article>
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
              setRetainedNewChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setActiveFilter('Все')
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
              setRetainedNewChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setActiveFilter('Все')
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
              setRetainedNewChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setActiveFilter('Поиск')
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
                setRetainedNewChatId(null)
                setRetainedFavoriteChatId(null)
                setRetainedSubscriptionChannelId(null)
                setStageView('premium')
                setConfirmingLogout(false)
                setPremiumGiftChatId(null)
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
              setRetainedNewChatId(null)
              setRetainedFavoriteChatId(null)
              setRetainedSubscriptionChannelId(null)
              setStageView('settings')
              setSettingsView('profile')
              setConfirmingLogout(false)
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
            : isChatOpen || isSubscriptionChannelOpen
              ? 'stage chat-open'
              : 'stage'
        }
      >
        {!isSettingsView && !isPremiumView && !isChannelsView && !activeChat && !activeSubscriptionChannel ? (
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

              <div className="settings-stack">
                <button
                  type="button"
                  className="send-button channels-create-button"
                  onClick={openChannelCreateView}
                >
                  Создать канал
                </button>

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

              <div className="settings-actions">
                <button type="button" className="soft-button" onClick={() => setStageView('main')}>
                  Назад
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
          <section className="chat-room channel-room">
            <header className="room-header">
              <div className="room-id">
                <span className="avatar large" style={{ backgroundColor: activeSubscriptionChannel.accent }}>
                  {activeSubscriptionChannel.title.slice(0, 1)}
                </span>
                <div>
                  <div className="room-title">
                    <div className="room-title-name">
                      <h3>{activeSubscriptionChannel.title}</h3>
                      <span className="chat-star">
                        <img src="/icons/news100.svg" alt="Канал" />
                      </span>
                    </div>
                  </div>
                  <p>{`${activeSubscriptionChannel.handle} · ${activeSubscriptionChannel.draft ? 'Черновики канала' : 'Публикации канала'}`}</p>
                </div>
              </div>
            </header>

            <div className="message-feed" ref={messageFeedRef}>
              {activeSubscriptionChannel.posts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  className={
                    activeSubscriptionPostId === post.id
                      ? 'bubble bubble-button channel-post selected'
                      : 'bubble bubble-button channel-post'
                  }
                  onClick={(event) => {
                    setActiveSubscriptionPostId(post.id)
                    setSubscriptionPostActionAnchor(getActionAnchor(event.currentTarget))
                    setForwardingSubscriptionPostText('')
                  }}
                >
                  <span className="bubble-meta">{activeSubscriptionChannel.draft ? 'Draft-пост' : 'Пост канала'}</span>
                  <p>{post.text}</p>
                  <time>{post.time}</time>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {isChatOpen ? (
          <section className={pinnedMessage ? 'chat-room has-pinned-message' : 'chat-room'}>
            <header className="room-header">
              <div className="room-id">
                <span className="avatar large" style={{ backgroundColor: activeChat.accent }}>
                  {activeChat.title.slice(0, 1)}
                </span>
                <div>
                  <div className="room-title">
                    <div className="room-title-name">
                      <h3>{activeChat.title}</h3>
                      {activeChat.premium ? (
                        <span className="premium-crown room-crown" aria-label="Премиум">
                          <img src="/icons/crown64.png" alt="" />
                        </span>
                      ) : null}
                      {activeChat.online ? <span className="room-online-label">В сети</span> : null}
                    </div>
                  </div>
                  <p>
                    {formatRoomPresence(activeChat)}
                  </p>
                </div>
              </div>
              <div className="room-actions">
                <button
                  type="button"
                  className={activeChat.pinned ? 'soft-button active room-star' : 'soft-button room-star'}
                  onClick={() => togglePinnedChat(activeChat.id)}
                  aria-label="Избранное"
                >
                  <img src="/icons/star100.png" alt="" />
                </button>
                <button
                  type="button"
                  className="soft-button room-menu-button"
                  onClick={() => setChatActionsOpen((current) => !current)}
                  aria-label="Меню контакта"
                >
                  ...
                </button>
                {chatActionsOpen ? (
                  <>
                    <button
                      type="button"
                      className="room-menu-scrim"
                      aria-label="Закрыть меню"
                      onClick={() => setChatActionsOpen(false)}
                    />
                    <div className="room-menu">
                      <button
                        type="button"
                        className="room-menu-item room-menu-item-premium"
                        onClick={() => {
                          setPremiumGiftChatId(activeChat.id)
                          setStageView('premium')
                          setChatActionsOpen(false)
                        }}
                      >
                        <span>Подарить</span>
                        <img src="/icons/crown100.png" alt="" />
                      </button>
                      <button
                        type="button"
                        className="room-menu-item danger"
                        onClick={() => blockChat(activeChat.id)}
                      >
                        Заблокировать
                      </button>
                      <button
                        type="button"
                        className="room-menu-item danger"
                        onClick={() => {
                          setConfirmingDeleteContactChatId(activeChat.id)
                          setChatActionsOpen(false)
                        }}
                      >
                        Удалить контакт
                      </button>
                      <button
                        type="button"
                        className="room-menu-item danger"
                        onClick={() => {
                          setConfirmingDeleteHistoryChatId(activeChat.id)
                          setChatActionsOpen(false)
                        }}
                      >
                        Удалить переписку
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </header>

            {pinnedMessage ? (
              <div className="pinned-message">
                <div className="pinned-message-content">
                  <img
                    className="pinned-message-icon"
                    src="/icons/pin100.png"
                    alt=""
                    aria-hidden="true"
                  />
                  <p>{pinnedMessage.text}</p>
                </div>
                <button
                  type="button"
                  className="soft-button pinned-message-close"
                  onClick={() => unpinMessage(activeChat.id)}
                >
                  Снять
                </button>
              </div>
            ) : null}

            <div className="message-feed" ref={messageFeedRef}>
              {activeChat.messages.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  className={
                    message.author === 'me'
                      ? messageActionMessageId === message.id
                        ? 'bubble bubble-button mine selected'
                        : 'bubble bubble-button mine'
                      : messageActionMessageId === message.id
                        ? 'bubble bubble-button selected'
                        : 'bubble bubble-button'
                  }
                  onClick={(event) => {
                    setMessageActionMessageId(message.id)
                    setMessageActionAnchor(getActionAnchor(event.currentTarget))
                  }}
                >
                  {message.forwarded ? <span className="bubble-meta">Переслано</span> : null}
                  {message.replyTo ? (
                    <div className="bubble-reply">
                      <span>{formatMessageAuthor(message.replyTo.author, activeChat.title)}</span>
                      <p>{message.replyTo.text}</p>
                    </div>
                  ) : null}
                  <p>{message.text}</p>
                  <time>{message.time}</time>
                </button>
              ))}

              {activeChat.typing && !quietMode ? (
                <div className="typing">
                  <span />
                  <span />
                  <span />
                  <p>{activeChat.title} печатает…</p>
                </div>
              ) : null}
            </div>

            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault()
                sendMessage()
              }}
            >
              <div className="composer-input">
                {replyTarget ? (
                  <div className="composer-reply">
                    <div>
                      <span className="settings-label">Ответ</span>
                      <p>{replyTarget.text}</p>
                    </div>
                    <button type="button" className="soft-button composer-reply-cancel" onClick={() => setReplyTarget(null)}>
                      Отмена
                    </button>
                  </div>
                ) : null}
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="composer-attachment-input"
                  onChange={(event) =>
                    setSelectedAttachmentName(event.target.files?.[0]?.name ?? '')
                  }
                />
                <textarea
                  rows={3}
                  placeholder="Напиши сообщение в тайник..."
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                />
                <div className="composer-tools">
                  <button
                    type="button"
                    className={selectedAttachmentName ? 'soft-button composer-tool active' : 'soft-button composer-tool'}
                    onClick={openAttachmentPicker}
                    aria-label="Добавить файл"
                    title={selectedAttachmentName || 'Добавить файл'}
                  >
                    <img src="/icons/attach100.png" alt="" />
                  </button>
                </div>
                <button type="submit" className="send-button composer-send">
                  Отправить
                </button>
              </div>
            </form>

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
                <div
                  className="message-menu"
                  style={
                    messageActionAnchor
                      ? getAnchoredMenuStyle(
                          messageActionAnchor,
                          chatActionMenuWidth,
                          chatActionMenuHeight,
                        )
                      : undefined
                  }
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
          </section>
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

            {activeSubscriptionPost ? (
              <>
                <button
                  type="button"
                  className="room-confirm-scrim"
                  aria-label="Закрыть действия с постом канала"
                  onClick={closeSubscriptionPostActions}
                />
                {activeSubscriptionChannel?.visibility === 'closed' ? (
                  <div
                    className="message-menu message-menu-note"
                    style={
                      subscriptionPostActionAnchor
                        ? getAnchoredMenuStyle(
                            subscriptionPostActionAnchor,
                            channelActionMenuWidth,
                            channelBlockedMenuHeight,
                          )
                        : undefined
                    }
                  >
                    <p className="room-confirm-copy">
                      Канал имеет тип "закрытый", копирование и пересылка сообщений запрещена
                    </p>
                  </div>
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
                ) : (
                  <div
                    className="message-menu"
                    style={
                      subscriptionPostActionAnchor
                        ? getAnchoredMenuStyle(
                            subscriptionPostActionAnchor,
                            channelActionMenuWidth,
                            channelActionMenuHeight,
                          )
                        : undefined
                    }
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
  )
}

export default App
