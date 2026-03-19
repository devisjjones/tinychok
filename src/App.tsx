import { useEffect, useRef, useState } from 'react'
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

type AuthStep = 'phone' | 'code' | 'profile'
type AuthView = 'form' | 'privacy'

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

type StageView = 'main' | 'settings' | 'premium'
type SettingsView = 'profile' | 'management' | 'blocked'

const profileFieldMaxLength = 16
const statusFieldMaxLength = 32

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

const quickFilters = ['Все', '★', 'Новые']
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
const accountsStorageKey = 'tinychok.accounts'
const sessionStorageKey = 'tinychok.session'
const privacyPolicyPdfPath = '/privacy-policy.pdf'
const privacyPolicySections = [
  {
    title: '1. Общие положения',
    paragraphs: [
      'Настоящая Политика конфиденциальности и обработки персональных данных сервиса «Тайничок» подготовлена с учетом требований Федерального закона РФ от 27.07.2006 № 152-ФЗ «О персональных данных», Федерального закона РФ от 27.07.2006 № 149-ФЗ «Об информации, информационных технологиях и о защите информации» и разъяснений Роскомнадзора.',
      'Политика определяет порядок обработки персональных данных пользователей сервиса, меры по их защите, а также права пользователей как субъектов персональных данных.',
    ],
  },
  {
    title: '2. Оператор персональных данных',
    paragraphs: [
      'Оператором персональных данных является лицо, осуществляющее эксплуатацию сервиса «Тайничок». До публичного запуска коммерческой версии сервиса подлежат заполнению полные реквизиты оператора: наименование или ФИО, адрес, ИНН или ОГРН при наличии, контактный адрес для обращений субъектов персональных данных.',
    ],
  },
  {
    title: '3. Какие данные могут обрабатываться',
    paragraphs: [
      'В рамках работы сервиса могут обрабатываться: номер телефона, имя, фамилия, никнейм, статус профиля, сведения о премиум-подписке, список контактов, переписка, файлы и фотографии, технические данные об использовании сервиса, сведения о времени авторизации, IP-адресе, устройстве и сессии.',
    ],
  },
  {
    title: '4. Цели обработки персональных данных',
    paragraphs: [
      'Персональные данные обрабатываются для регистрации и авторизации пользователя, обеспечения обмена сообщениями и файлами, управления контактами и настройками приватности, поддержки премиум-функций, защиты сервиса от злоупотреблений, исполнения требований законодательства РФ и обработки обращений пользователей.',
    ],
  },
  {
    title: '5. Правовые основания обработки',
    paragraphs: [
      'Оператор обрабатывает персональные данные на основании согласия пользователя, необходимости исполнения пользовательского соглашения и предоставления функциональности сервиса, а также в случаях, когда такая обработка требуется законодательством Российской Федерации.',
    ],
  },
  {
    title: '6. Хранение и локализация данных',
    paragraphs: [
      'Персональные данные пользователей подлежат записи, систематизации, накоплению, хранению, уточнению и извлечению с использованием баз данных, находящихся на территории Российской Федерации, если иное не допускается законодательством РФ.',
      'Срок хранения данных определяется целями обработки, требованиями законодательства, сроком действия пользовательской учетной записи и необходимостью защиты прав и законных интересов оператора и пользователей.',
    ],
  },
  {
    title: '7. Передача данных третьим лицам',
    paragraphs: [
      'Оператор не раскрывает персональные данные третьим лицам без достаточного правового основания, за исключением случаев, предусмотренных законодательством РФ, исполнения поручений пользователя, а также привлечения подрядчиков и сервисов, обеспечивающих работу платформы, при условии соблюдения ими требований конфиденциальности и безопасности.',
    ],
  },
  {
    title: '8. Права пользователя',
    paragraphs: [
      'Пользователь вправе получать сведения об обработке своих персональных данных, требовать их уточнения, блокирования или удаления, если данные являются неполными, неточными, устаревшими, незаконно полученными или не нужны для заявленной цели обработки, а также вправе отозвать согласие на обработку персональных данных.',
    ],
  },
  {
    title: '9. Отзыв согласия',
    paragraphs: [
      'Отзыв согласия на обработку персональных данных может повлечь невозможность дальнейшего предоставления части или всего функционала сервиса, включая авторизацию, доставку сообщений, хранение файлов и использование премиум-возможностей.',
      'После отзыва согласия оператор прекращает обработку персональных данных или обеспечивает ее прекращение в пределах и в сроки, установленные законодательством РФ, если сохранение отдельных данных не требуется по закону.',
    ],
  },
  {
    title: '10. Защита персональных данных',
    paragraphs: [
      'Оператор принимает правовые, организационные и технические меры для защиты персональных данных от неправомерного или случайного доступа, уничтожения, изменения, блокирования, копирования, предоставления, распространения и иных неправомерных действий.',
    ],
  },
  {
    title: '11. Обратная связь',
    paragraphs: [
      'Обращения по вопросам обработки персональных данных, реализации прав субъекта персональных данных и отзыва согласия подаются оператору по опубликованным контактным реквизитам. До публичного запуска сервиса эти реквизиты должны быть дополнены и размещены в актуальной редакции политики.',
    ],
  },
] as const

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
  return [session.displayName, session.surname ?? ''].filter(Boolean).join(' ')
}

function formatAccountName(account: Pick<Account, 'displayName' | 'surname'>) {
  return [account.displayName, account.surname ?? ''].filter(Boolean).join(' ')
}

function sanitizePersonField(value: string) {
  return value
    .replace(/[^A-Za-zА-Яа-яЁё -]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, profileFieldMaxLength)
}

function normalizeNickname(value: string) {
  return value.replace(/[^A-Za-z0-9_]/g, '').slice(0, profileFieldMaxLength)
}

function sanitizeStatusField(value: string) {
  return value
    .replace(/[^A-Za-zА-Яа-яЁё0-9 .,!?():;-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, statusFieldMaxLength)
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
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const [chats, setChats] = useState(initialChats)
  const [activeChatId, setActiveChatId] = useState<number | null>(null)
  const [stageView, setStageView] = useState<StageView>('main')
  const [settingsView, setSettingsView] = useState<SettingsView>('profile')
  const [query, setQuery] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [selectedAttachmentName, setSelectedAttachmentName] = useState('')
  const [activeFilter, setActiveFilter] = useState('Все')
  const [searchOpen, setSearchOpen] = useState(false)
  const [quietMode, setQuietMode] = useState(false)
  const [authStep, setAuthStep] = useState<AuthStep>('phone')
  const [authView, setAuthView] = useState<AuthView>('form')
  const [displayName, setDisplayName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const [confirmingConsentWithdrawal, setConfirmingConsentWithdrawal] = useState(false)
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

  const blockedContactIds = session?.blockedContactIds ?? []
  const availableChats = chats.filter((chat) => !blockedContactIds.includes(chat.id))
  const blockedChats = chats.filter((chat) => blockedContactIds.includes(chat.id))

  const visibleChats = availableChats.filter((chat) => {
    if (searchOpen) return true
    if (bottomSection === 'contacts') return true
    if (activeFilter === '★') return Boolean(chat.pinned)
    if (activeFilter === 'Новые') return chat.unread > 0

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
  const activeChatMessageCount = activeChat?.messages.length ?? 0
  const isSettingsView = stageView === 'settings'
  const isPremiumView = stageView === 'premium'
  const isChatOpen = stageView === 'main' && activeChat !== null
  const searchShowsPhone = isPhoneQuery(query)
  const totalUnreadCount = availableChats.reduce((sum, chat) => sum + chat.unread, 0)
  const sessionHasPremium = session?.premium ?? true
  const premiumDaysLeft = getPremiumDaysLeft(sessionHasPremium, session?.premiumExpiresAt)
  const authExistingAccount = normalizeIdentifier(identifier)
    ? loadAccounts().find((account) => account.identifier === normalizeIdentifier(identifier)) ?? null
    : null

  useEffect(() => {
    if (!isChatOpen || activeChatId === null || !messageFeedRef.current) return

    messageFeedRef.current.scrollTop = messageFeedRef.current.scrollHeight
  }, [activeChatId, activeChatMessageCount, isChatOpen])

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
    const trimmedName = sanitizePersonField(displayName)

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
    setAuthView('form')
    setConfirmingLogout(false)
    setConfirmingConsentWithdrawal(false)
    setChatActionsOpen(false)
    setBlockedActionChatId(null)
    setPremiumGiftChatId(null)
    setMessageActionMessageId(null)
    setForwardingMessageId(null)
    setReplyTarget(null)
    setConfirmingDeleteHistoryChatId(null)
    setConfirmingDeleteContactChatId(null)
    setConfirmingDeleteMessageId(null)
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

  function openChat(chatId: number) {
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
        ? sanitizePersonField(patch.displayName)
        : session.displayName
    const nextSurname =
      patch.surname !== undefined
        ? sanitizePersonField(patch.surname)
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
    } catch {
      // Ignore clipboard failures in demo mode.
    }

    setMessageActionMessageId(null)
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
                  text: message.text,
                  time: formatNowTime(),
                  forwarded: true,
                },
              ],
            }
          : chat,
      ),
    )

    setForwardingMessageId(null)
    setMessageActionMessageId(null)
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
  }

  if (!session) {
    if (authView === 'privacy') {
      return (
        <main className="policy-shell">
          <section className="policy-panel">
            <div className="policy-header">
              <p className="eyebrow">Политика</p>
              <h1>Политика конфиденциальности данных</h1>
              <p className="policy-copy">
                Политика описывает, какие данные могут обрабатываться в Тайничке, зачем они
                нужны и как пользователь может реализовать свои права в соответствии с
                законодательством Российской Федерации.
              </p>
            </div>

            <div className="policy-content">
              {privacyPolicySections.map((section) => (
                <article key={section.title} className="policy-section">
                  <h2>{section.title}</h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </article>
              ))}
            </div>

            <div className="policy-footer">
              <button type="button" className="soft-button" onClick={() => setAuthView('form')}>
                Назад
              </button>
              <div className="policy-actions">
                <a className="soft-button policy-download" href={privacyPolicyPdfPath} download>
                  Скачать
                </a>
                <button
                  type="button"
                  className="ghost-button policy-withdraw"
                  onClick={() => setConfirmingConsentWithdrawal(true)}
                >
                  Отозвать согласие
                </button>
              </div>
            </div>

            {confirmingConsentWithdrawal ? (
              <div
                className="policy-modal-backdrop"
                onClick={() => setConfirmingConsentWithdrawal(false)}
              >
                <section
                  className="confirm-card policy-confirm-card"
                  onClick={(event) => event.stopPropagation()}
                >
                  <p className="eyebrow">Отзыв согласия</p>
                  <h2>Отозвать согласие на обработку персональных данных?</h2>
                  <p className="confirm-copy">
                    После подтверждения вы выйдете из Тайничка. Для продолжения использования
                    сервиса потребуется новое согласие.
                  </p>
                  <div className="confirm-actions">
                    <button type="button" className="soft-button confirm-stay" onClick={() => logout()}>
                      Отозвать согласие
                    </button>
                    <button
                      type="button"
                      className="ghost-button confirm-exit"
                      onClick={() => setConfirmingConsentWithdrawal(false)}
                    >
                      Отмена
                    </button>
                  </div>
                </section>
              </div>
            ) : null}
          </section>
        </main>
      )
    }

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
                  onChange={(event) => setDisplayName(sanitizePersonField(event.target.value))}
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

          <button type="button" className="auth-note-link" onClick={() => setAuthView('privacy')}>
            Политика конфиденциальности
          </button>
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
          : isSettingsView
            ? 'shell shell-settings'
            : 'shell'
      }
    >
      {!isSettingsView && !isPremiumView ? (
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
              <p>{session.status}</p>
            </div>
          ) : null}
        </div>

        <div className="filters" aria-label="Фильтры чатов">
          {quickFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={filter === activeFilter ? 'filter active' : 'filter'}
              onClick={() => {
                if (filter === 'Поиск') {
                  setSearchOpen((current) => {
                    const next = !current
                    setActiveFilter(next ? 'Поиск' : 'Все')

                    if (!next) {
                      setQuery('')
                    }

                    return next
                  })
                  return
                }

                setActiveFilter(filter)
                setSearchOpen(false)
              }}
            >
              {filter === '★' ? (
                <img className="filter-icon" src="/icons/star100.png" alt="Избранное" />
              ) : filter === 'Поиск' ? (
                <img className="filter-icon" src="/icons/search100.svg" alt="Поиск" />
              ) : (
                <span>{filter}</span>
              )}
              {filter === 'Новые' && !quietMode && totalUnreadCount > 0 ? (
                <span className="filter-badge">{totalUnreadCount}</span>
              ) : null}
            </button>
          ))}
        </div>

        {searchOpen ? (
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

        {searchOpen ? (
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
        ) : (
          <div className="chat-list">
            {visibleChats.map((chat) => (
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
              setBottomSection('chats')
              setSearchOpen(false)
              setQuery('')
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
              setBottomSection('contacts')
              setSearchOpen(false)
              setQuery('')
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
              setSearchOpen(true)
              setActiveFilter('Поиск')
            }}
            aria-label="Поиск"
          >
            <img src="/icons/search100.svg" alt="" />
          </button>
          {!sessionHasPremium ? (
            <button
              type="button"
              className="soft-button icon-button"
              onClick={() => {
                setStageView('premium')
                setConfirmingLogout(false)
                setPremiumGiftChatId(null)
              }}
              aria-label="Премиум"
            >
              <img src="/icons/crown100.png" alt="" />
            </button>
          ) : null}
          <button
            type="button"
            className={isSettingsView ? 'soft-button icon-button active' : 'soft-button icon-button'}
            onClick={() => {
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
            : isChatOpen
              ? 'stage chat-open'
              : 'stage'
        }
      >
        {!isSettingsView && !isPremiumView && !activeChat ? (
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
                    maxLength={profileFieldMaxLength}
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
                    maxLength={profileFieldMaxLength}
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
                        maxLength={profileFieldMaxLength}
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
                  className={message.author === 'me' ? 'bubble bubble-button mine' : 'bubble bubble-button'}
                  onClick={() => setMessageActionMessageId(message.id)}
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
                  onClick={() => setMessageActionMessageId(null)}
                />
                <div className="message-menu">
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
      </section>
    </main>
  )
}

export default App
