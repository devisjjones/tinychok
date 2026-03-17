import { useEffect, useRef, useState } from 'react'
import './App.css'

type Message = {
  id: number
  author: 'me' | 'them'
  text: string
  time: string
}

type Chat = {
  id: number
  title: string
  handle: string
  accent: string
  mood: string
  status: string
  typing?: boolean
  unread: number
  pinned?: boolean
  messages: Message[]
}

type SearchResult = {
  id: number
  title: string
  handle: string
  accent: string
  subtitle: string
}

type AuthMode = 'login' | 'register'

type Account = {
  identifier: string
  password: string
  displayName: string
  surname?: string
  nickname?: string
  createdAt: string
}

type Session = {
  identifier: string
  displayName: string
  surname?: string
  nickname?: string
}

type StageView = 'main' | 'settings'

const initialChats: Chat[] = [
  {
    id: 1,
    title: 'Мира',
    handle: '@mira_night',
    accent: '#ff8a5b',
    mood: 'Вайбит',
    status: 'печатает ответ в тайник',
    typing: true,
    unread: 2,
    pinned: true,
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
    accent: '#66d9b8',
    mood: 'На месте',
    status: 'была в сети 8 мин назад',
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
    accent: '#8aa6ff',
    mood: 'Собирает билд',
    status: 'отправил прототип тем',
    unread: 4,
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
]

const quickFilters = ['Все', '★', 'Новые', 'Поиск']
const discoveryResults: SearchResult[] = [
  {
    id: 101,
    title: 'Ася',
    handle: '@asya.echo',
    accent: '#f29f67',
    subtitle: 'дизайн-система и тихие интерфейсы',
  },
  {
    id: 102,
    title: 'Никита',
    handle: '@nikita.wave',
    accent: '#6eb6ff',
    subtitle: 'ищет собеседников для night shift',
  },
  {
    id: 103,
    title: 'Полина',
    handle: '@poly.secret',
    accent: '#82c9a3',
    subtitle: 'любит voice notes и приватные комнаты',
  },
]
const accountsStorageKey = 'tinychok.accounts'
const sessionStorageKey = 'tinychok.session'

function formatPreview(chat: Chat) {
  const latest = chat.messages.at(-1)
  return latest ? latest.text : 'Пока пусто'
}

function normalizeIdentifier(value: string) {
  const trimmed = value.trim()

  if (trimmed.includes('@')) {
    return trimmed.toLowerCase()
  }

  const digits = trimmed.replace(/[^\d+]/g, '')
  return digits
}

function matchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase())
}

function formatSessionName(session: Session) {
  return [session.displayName, session.surname ?? ''].filter(Boolean).join(' ')
}

function normalizeNickname(value: string) {
  return value.replace(/@/g, '').replace(/\s+/g, '')
}

function loadAccounts() {
  if (typeof window === 'undefined') return [] as Account[]

  const raw = window.localStorage.getItem(accountsStorageKey)
  if (!raw) return []

  try {
    return JSON.parse(raw) as Account[]
  } catch {
    return []
  }
}

function loadSession() {
  if (typeof window === 'undefined') return null as Session | null

  const raw = window.localStorage.getItem(sessionStorageKey)
  if (!raw) return null

  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

function App() {
  const messageFeedRef = useRef<HTMLDivElement | null>(null)
  const [chats, setChats] = useState(initialChats)
  const [activeChatId, setActiveChatId] = useState<number | null>(null)
  const [stageView, setStageView] = useState<StageView>('main')
  const [query, setQuery] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [activeFilter, setActiveFilter] = useState('Все')
  const [searchOpen, setSearchOpen] = useState(false)
  const [quietMode, setQuietMode] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('register')
  const [displayName, setDisplayName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [session, setSession] = useState<Session | null>(() => loadSession())

  const visibleChats = chats.filter((chat) => {
    if (searchOpen) return true
    if (activeFilter === '★') return Boolean(chat.pinned)
    if (activeFilter === 'Новые') return chat.unread > 0

    return true
  })

  const myContactsResults = chats.filter((chat) => {
    if (query.trim() === '') return false

    return matchesQuery(chat.title, query) || matchesQuery(chat.handle, query)
  })

  const searchResults = discoveryResults.filter((result) => {
    if (query.trim() === '') return true

    return matchesQuery(result.title, query) || matchesQuery(result.handle, query)
  })

  const activeChat =
    activeChatId === null ? null : chats.find((chat) => chat.id === activeChatId) ?? null
  const activeChatMessageCount = activeChat?.messages.length ?? 0
  const isSettingsView = stageView === 'settings'
  const isChatOpen = stageView === 'main' && activeChat !== null

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

  function submitAuth() {
    const normalized = normalizeIdentifier(identifier)
    const trimmedPassword = password.trim()
    const trimmedName = displayName.trim()

    if (!normalized) {
      setAuthError('Введи почту или номер телефона.')
      return
    }

    if (trimmedPassword.length < 4) {
      setAuthError('Пароль слишком короткий. Минимум 4 символа.')
      return
    }

    const accounts = loadAccounts()
    const existingAccount = accounts.find((account) => account.identifier === normalized)

    if (authMode === 'register') {
      if (!trimmedName) {
        setAuthError('Для регистрации нужен ник или имя.')
        return
      }

      if (existingAccount) {
        setAuthError('Такой контакт уже занят. Переключись на вход.')
        return
      }

      const nextAccount: Account = {
        identifier: normalized,
        password: trimmedPassword,
        displayName: trimmedName,
        surname: '',
        nickname: '',
        createdAt: new Date().toISOString(),
      }

      window.localStorage.setItem(
        accountsStorageKey,
        JSON.stringify([...accounts, nextAccount]),
      )
      persistSession({
        identifier: nextAccount.identifier,
        displayName: nextAccount.displayName,
        surname: nextAccount.surname,
        nickname: nextAccount.nickname,
      })
      setAuthError('')
      return
    }

    if (!existingAccount || existingAccount.password !== trimmedPassword) {
      setAuthError('Контакт не найден или пароль неверный.')
      return
    }

    persistSession({
      identifier: existingAccount.identifier,
      displayName: existingAccount.displayName,
      surname: existingAccount.surname ?? '',
      nickname: existingAccount.nickname ?? '',
    })
    setAuthError('')
  }

  function logout() {
    persistSession(null)
    setPassword('')
    setIdentifier('')
    setDisplayName('')
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
              time: new Date().toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
          ],
        }
      }),
    )

    setMessageDraft('')
  }

  function openChat(chatId: number) {
    setStageView('main')
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

    const nextSession: Session = {
      ...session,
      ...patch,
    }

    setSession(nextSession)
    window.localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession))

    const nextAccounts = loadAccounts().map((account) =>
      account.identifier === session.identifier
        ? {
            ...account,
            displayName: nextSession.displayName,
            surname: nextSession.surname ?? '',
            nickname: nextSession.nickname ?? '',
          }
        : account,
    )

    window.localStorage.setItem(accountsStorageKey, JSON.stringify(nextAccounts))
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="auth-panel auth-promo">
          <p className="eyebrow">Тайничок</p>
          <h1>Вход без кода подтверждения.</h1>
          <p className="auth-copy">
            Любая почта или любой номер могут стать логином. Пароль обязателен.
            Это удобно для MVP, но не доказывает, что контакт реально твой.
          </p>
          <div className="hero-stats">
            <div>
              <strong>1 поле</strong>
              <span>почта или телефон</span>
            </div>
            <div>
              <strong>0 кодов</strong>
              <span>без SMS и email-подтверждений</span>
            </div>
          </div>
        </section>

        <section className="auth-panel auth-card">
          <div className="auth-tabs" aria-label="Режим авторизации">
            <button
              type="button"
              className={authMode === 'register' ? 'filter active' : 'filter'}
              onClick={() => {
                setAuthMode('register')
                setAuthError('')
              }}
            >
              Регистрация
            </button>
            <button
              type="button"
              className={authMode === 'login' ? 'filter active' : 'filter'}
              onClick={() => {
                setAuthMode('login')
                setAuthError('')
              }}
            >
              Вход
            </button>
          </div>

          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              submitAuth()
            }}
          >
            {authMode === 'register' ? (
              <label className="auth-field">
                <span>Имя в Тайничке</span>
                <input
                  type="text"
                  placeholder="Например, Луна"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
            ) : null}

            <label className="auth-field">
              <span>Почта или телефон</span>
              <input
                type="text"
                placeholder="name@mail.com или +79990000000"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </label>

            <label className="auth-field">
              <span>Пароль</span>
              <input
                type="password"
                placeholder="Минимум 4 символа"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {authError ? <p className="auth-error">{authError}</p> : null}

            <button type="submit" className="send-button auth-submit">
              {authMode === 'register' ? 'Создать тайник' : 'Войти'}
            </button>
          </form>

          <p className="auth-note">
            Для production так делать рискованно: любой человек может занять чужую почту или номер,
            пока владелец не успел зарегистрироваться.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <aside className="rail">
        <div className="brand">
          <h1>Тайничок</h1>
          <button
            className={quietMode ? 'ghost-button active' : 'ghost-button'}
            type="button"
            onClick={() => setQuietMode((current) => !current)}
          >
            Тихо
          </button>
        </div>

        <div className="account-chip">
          <div>
            <strong>{formatSessionName(session)}</strong>
            <span>{session.identifier}</span>
          </div>
          <button
            type="button"
            className={isSettingsView ? 'soft-button active' : 'soft-button'}
            onClick={() => setStageView('settings')}
          >
            Настройки
          </button>
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
              {filter}
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
                        <strong>
                          {chat.title}
                          {chat.pinned ? <span className="chat-star"> ★</span> : null}
                        </strong>
                        <span>{quietMode ? '' : chat.messages.at(-1)?.time}</span>
                      </span>
                      <span className="chat-handle">{chat.handle}</span>
                      {!quietMode ? (
                        chat.typing ? (
                          <div className="chat-typing" aria-label={`${chat.title} печатает`}>
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="chat-typing-label">печатает...</span>
                          </div>
                        ) : (
                          <span className="chat-preview">{formatPreview(chat)}</span>
                        )
                      ) : null}
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
                      <strong>{result.title}</strong>
                    </span>
                    <span className="chat-handle">{result.handle}</span>
                    <span className="chat-preview">{result.subtitle}</span>
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
                    <strong>
                      {chat.title}
                      {chat.pinned ? <span className="chat-star"> ★</span> : null}
                    </strong>
                      <span>{quietMode ? '' : chat.messages.at(-1)?.time}</span>
                  </span>
                  <span className="chat-handle">{chat.handle}</span>
                  {!quietMode ? (
                    chat.typing ? (
                      <div className="chat-typing" aria-label={`${chat.title} печатает`}>
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="chat-typing-label">печатает...</span>
                      </div>
                    ) : (
                      <span className="chat-preview">{formatPreview(chat)}</span>
                    )
                  ) : null}
                </span>
                  {!quietMode && chat.unread > 0 ? <span className="badge">{chat.unread}</span> : null}
              </button>
            ))}
          </div>
        )}
      </aside>

      <section
        className={
          isSettingsView ? 'stage settings-open' : isChatOpen ? 'stage chat-open' : 'stage'
        }
      >
        {!isSettingsView && !activeChat ? (
          <div className="hero-panel hero-panel-idle">
            <div>
              <p className="eyebrow">Личный канал</p>
              <h2>Мессенджер для тихих разговоров и маленьких секретов.</h2>
            </div>
            <div className="hero-stats">
              <div>
                <strong>03</strong>
                <span>режима приватности</span>
              </div>
              <div>
                <strong>Local first</strong>
                <span>сессия живёт в браузере</span>
              </div>
            </div>
          </div>
        ) : null}

        {isSettingsView ? (
          <section className="settings-view">
            <div className="settings-panel">
              <div className="settings-heading">
                <p className="eyebrow">Настройки</p>
                <h2>{formatSessionName(session)}</h2>
              </div>

              <div className="settings-stack">
                <article className="settings-item">
                  <span className="settings-label">Имя</span>
                  <input
                    type="text"
                    className="settings-input"
                    value={session.displayName}
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
                    onChange={(event) =>
                      updateSessionProfile({ surname: event.target.value })
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
                      onChange={(event) =>
                        updateSessionProfile({
                          nickname: normalizeNickname(event.target.value),
                        })
                      }
                    />
                  </label>
                </article>
                <article className="settings-item">
                  <span className="settings-label">Логин</span>
                  <strong>{session.identifier}</strong>
                </article>
              </div>

              <div className="settings-actions">
                <button type="button" className="soft-button" onClick={() => setStageView('main')}>
                  К чатам
                </button>
                <button type="button" className="ghost-button" onClick={logout}>
                  Выйти
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isChatOpen ? (
          <section className="chat-room">
            <header className="room-header">
              <div className="room-id">
                <span className="avatar large" style={{ backgroundColor: activeChat.accent }}>
                  {activeChat.title.slice(0, 1)}
                </span>
                <div>
                  <div className="room-title">
                    <h3>{activeChat.title}</h3>
                    <button
                      type="button"
                      className={activeChat.pinned ? 'soft-button active room-star' : 'soft-button room-star'}
                      onClick={() => togglePinnedChat(activeChat.id)}
                    >
                      ★
                    </button>
                  </div>
                  <p>
                    {quietMode ? `${activeChat.mood} · без уведомлений` : `${activeChat.mood} · ${activeChat.status}`}
                  </p>
                </div>
              </div>
            </header>

            <div className="message-feed" ref={messageFeedRef}>
              {activeChat.messages.map((message) => (
                <article
                  key={message.id}
                  className={message.author === 'me' ? 'bubble mine' : 'bubble'}
                >
                  <p>{message.text}</p>
                  <time>{message.time}</time>
                </article>
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
                <textarea
                  rows={3}
                  placeholder="Напиши сообщение в тайник..."
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                />
                <button type="submit" className="send-button composer-send">
                  Отправить
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default App
