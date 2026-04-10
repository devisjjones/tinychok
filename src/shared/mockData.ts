import type {
  Channel,
  Chat,
  GroupParticipant,
  GroupPreview,
  SearchResult,
  SubscriptionChannel,
  ThreadComment,
} from './types'
import { makeDraftChannel } from './utils'

const fixtureBaseDate = new Date('2026-03-23T00:00:00+03:00')

function buildFixtureCreatedAt(dayOffset: number, time: string) {
  const [hoursText = '0', minutesText = '0'] = time.split(':')
  const date = new Date(fixtureBaseDate)
  date.setDate(date.getDate() - dayOffset)
  date.setHours(Number(hoursText), Number(minutesText), 0, 0)
  return date.toISOString()
}

const initialChatFixtures: Chat[] = [
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
      { id: 2, author: 'me', text: 'Делаем. Только свои люди и приватные комментарии.', time: '21:05' },
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
    messages: [{ id: 1, author: 'them', text: 'Оставим интерфейс тихим и светлым.', time: '17:52' }],
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
      {
        id: 1,
        author: 'me',
        text: 'Проверь, как список ведёт себя на маленькой высоте.',
        time: '17:31',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'Хочу больше воздуха между карточками и мягче тени.',
        time: '17:08',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'Проверь скролл и обрезание бейджей сверху.',
        time: '16:54',
      },
    ],
  },
  {
    id: 8,
    title: 'Варя',
    handle: '@varya.north',
    phone: '+79214445566',
    accent: '#ff9db1',
    mood: 'Смотрит макет',
    status: 'сохранила комментарий',
    online: true,
    unread: 5,
    messages: [
      {
        id: 1,
        author: 'them',
        text: 'Карточки уже почти идеальны, но хочется больше ритма.',
        time: '16:40',
      },
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
      {
        id: 1,
        author: 'me',
        text: 'Добавил двадцать контактов, чтобы гонять список.',
        time: '16:21',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'Можно ещё проверить поведение при печати на длинных именах.',
        time: '16:07',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'Тут хорошо бы посмотреть, как ведут себя фильтры со скроллом.',
        time: '15:49',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'Сделай кнопку настроек чуть компактнее, но не мелкой.',
        time: '15:36',
      },
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
      {
        id: 1,
        author: 'me',
        text: 'Список уже выглядит убедительно, нужно ещё больше разных состояний.',
        time: '15:18',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'Мне нравится, что бейджи теперь сидят как наклейки.',
        time: '15:02',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'Я бы ещё погонял список на старом ноутбуке.',
        time: '14:47',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'В поиске по номеру всё должно выглядеть так же спокойно.',
        time: '14:30',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'Можем потом проверить и тёмную подложку, но не сейчас.',
        time: '14:11',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'Проверь, не устаёт ли глаз от плотных повторяющихся карточек.',
        time: '13:55',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'Если хочешь, потом добавим ещё больше людей для stress-теста.',
        time: '13:33',
      },
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
      {
        id: 1,
        author: 'them',
        text: 'У верхних и нижних карточек теперь достаточно воздуха для бейджей.',
        time: '13:20',
      },
    ],
  },
]

export const initialChats: Chat[] = initialChatFixtures.map((chat) => ({
  ...chat,
  isTestEntity: true,
  messages: chat.messages.map((message, messageIndex) => ({
    ...message,
    createdAt: buildFixtureCreatedAt((chat.id - 1) * 2 + (chat.messages.length - messageIndex - 1), message.time),
  })),
  mood: 'Тестовый аккаунт',
  status: chat.status ? `Тестовый аккаунт · ${chat.status}` : 'Тестовый аккаунт',
}))

export const discoveryResults: SearchResult[] = [
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

function buildGroupParticipant(chatId: number): GroupParticipant {
  const chat = initialChats.find((candidate) => candidate.id === chatId)

  if (!chat) {
    throw new Error(`Unknown group participant chat id: ${chatId}`)
  }

  return {
    accent: chat.accent,
    favorite: chat.pinned,
    id: chat.id,
    identifier: chat.phone,
    nickname: chat.handle.replace(/^@+/u, ''),
    online: chat.online,
    premium: chat.premium,
    status: chat.online ? 'в сети' : chat.lastSeen ?? chat.status,
    title: chat.title,
  }
}

function buildGroupParticipants(chatIds: number[]) {
  return chatIds.map((chatId) => buildGroupParticipant(chatId))
}

function buildChannelParticipants() {
  return initialChats.map((chat) => ({
    accent: chat.accent,
    favorite: chat.pinned,
    id: chat.id,
    identifier: chat.phone,
    nickname: chat.handle.replace(/^@+/u, ''),
    online: chat.online,
    premium: chat.premium,
    status: chat.online ? 'в сети' : chat.lastSeen ?? chat.status,
    title: chat.title,
  })) satisfies GroupParticipant[]
}

type SeededCommentMode = 'off' | 'all' | 'premium'

const channelCommentModes: Record<number, SeededCommentMode> = {
  1: 'all',
  2: 'premium',
  3: 'off',
  4: 'all',
  5: 'all',
  6: 'off',
  7: 'premium',
  8: 'all',
  9: 'off',
  10: 'premium',
}

const groupCommentModes: Record<number, SeededCommentMode> = {
  1: 'all',
  2: 'off',
  3: 'premium',
}

function buildThreadCommentFromChat(
  id: number,
  chatId: number,
  text: string,
  time: string,
  dayOffset = 0,
): ThreadComment {
  const chat = initialChats.find((candidate) => candidate.id === chatId)

  return {
    author: 'them',
    authorIdentifier: chat?.phone,
    createdAt: buildFixtureCreatedAt(dayOffset, time),
    displayAuthor: chat?.title ?? 'Участник',
    id,
    text,
    time,
  }
}

function buildMyThreadComment(id: number, text: string, time: string, dayOffset = 0): ThreadComment {
  return {
    author: 'me',
    createdAt: buildFixtureCreatedAt(dayOffset, time),
    id,
    text,
    time,
  }
}

function buildChannelThreadComments(
  channelId: number,
  title: string,
  postIndex: number,
): ThreadComment[] | undefined {
  const mode = channelCommentModes[channelId] ?? 'off'
  const dayOffset = (channelId - 1) * 3 + Math.floor(postIndex / 3)

  if (mode === 'all') {
    if (postIndex === 0) {
      return [
        buildThreadCommentFromChat(
          1,
          2,
          `Под этот пост удобно собирать короткие уточнения по каналу ${title}.`,
          '22:21',
          dayOffset,
        ),
        buildMyThreadComment(2, 'Оставим комментарии как тихую ветку без засорения основной ленты.', '22:24', dayOffset),
      ]
    }

    if (postIndex === 4) {
      return [
        buildThreadCommentFromChat(
          1,
          3,
          'Проверил: карточка комментариев читается спокойно и без визуального шума.',
          '20:53',
          dayOffset,
        ),
      ]
    }

    if (postIndex === 9) {
      return [
        buildThreadCommentFromChat(1, 1, 'Хорошо бы держать обсуждение именно под этим сообщением.', '18:58', dayOffset),
        buildThreadCommentFromChat(2, 5, 'Да, так основной канал не превращается в чат.', '19:02', dayOffset),
        buildMyThreadComment(3, 'Согласен. Для длинных обсуждений комментарии здесь самый понятный сценарий.', '19:07', dayOffset),
      ]
    }
  }

  if (mode === 'premium') {
    if (postIndex === 1) {
      return [
        buildThreadCommentFromChat(
          1,
          6,
          `Премиум-комментарии под ${title} уже выглядят как отдельная спокойная дискуссия.`,
          '21:33',
          dayOffset,
        ),
        buildThreadCommentFromChat(2, 3, 'Нормально: читать могут все, писать только премиум-участники.', '21:39', dayOffset),
      ]
    }

    if (postIndex === 6) {
      return [
        buildMyThreadComment(1, 'Этот комментарий оставлен как fixture для проверки premium-only режима.', '19:41', dayOffset),
      ]
    }
  }

  return undefined
}

const testChannelDefinitions = [
  {
    accent: '#8c5738',
    handle: '@night_archive',
    id: 1,
    readers: 148,
    title: 'Ночной архив',
    unread: 3,
    visibility: 'private' as const,
  },
  {
    accent: '#6eb6ff',
    handle: '@quiet_releases',
    id: 2,
    readers: 96,
    title: 'Тихие релизы',
    unread: 0,
    visibility: 'public' as const,
  },
  {
    accent: '#82c9a3',
    handle: '@signal_club',
    id: 3,
    readers: 214,
    title: 'Клуб сигналов',
    unread: 5,
    visibility: 'closed' as const,
  },
  {
    accent: '#ff8a5b',
    handle: '@tiny_newsroom',
    id: 4,
    readers: 327,
    title: 'Newsroom',
    unread: 2,
    visibility: 'public' as const,
  },
  {
    accent: '#d18fff',
    handle: '@moon_digest',
    id: 5,
    readers: 182,
    title: 'Лунный дайджест',
    unread: 4,
    visibility: 'public' as const,
  },
  {
    accent: '#ffd166',
    handle: '@silent_beta',
    id: 6,
    readers: 71,
    title: 'Silent Beta',
    unread: 1,
    visibility: 'private' as const,
  },
  {
    accent: '#7dd3fc',
    handle: '@warm_updates',
    id: 7,
    readers: 266,
    title: 'Тёплые апдейты',
    unread: 6,
    visibility: 'public' as const,
  },
  {
    accent: '#9ad0c2',
    handle: '@product_garden',
    id: 8,
    readers: 121,
    title: 'Product Garden',
    unread: 2,
    visibility: 'closed' as const,
  },
  {
    accent: '#fca5a5',
    handle: '@afterglow_notes',
    id: 9,
    readers: 199,
    title: 'Afterglow Notes',
    unread: 3,
    visibility: 'public' as const,
  },
  {
    accent: '#86efac',
    handle: '@tinychok_lab',
    id: 10,
    readers: 88,
    title: 'Tinychok Lab',
    unread: 5,
    visibility: 'private' as const,
  },
]

const testChannelTimes = [
  '22:14',
  '21:52',
  '21:28',
  '21:04',
  '20:46',
  '20:21',
  '19:58',
  '19:34',
  '19:12',
  '18:49',
  '18:27',
  '18:03',
  '17:41',
  '17:18',
  '16:56',
  '16:33',
  '16:09',
  '15:46',
  '15:24',
  '15:01',
]

const testChannelPostTemplates = [
  'Тестовый пост #{n}: фиксируем спокойный ритм публикаций и проверяем, как канал выглядит в длинной ленте.',
  'Тестовый пост #{n}: сюда удобно складывать короткие апдейты по интерфейсу, релизам и настройкам приватности.',
  'Тестовый пост #{n}: канал используется как fixture для staging, поэтому сообщения здесь специально оставлены для smoke-check.',
  'Тестовый пост #{n}: проверяем поведение unread-счётчиков, тишину уведомлений и открытие карточек канала.',
  'Тестовый пост #{n}: отдельная задача этого канала — дать стабильную тестовую выдачу для чтения и скролла.',
]

function buildTestChannelPosts(channelId: number, title: string) {
  return testChannelTimes.map((time, index) => {
    const threadComments = buildChannelThreadComments(channelId, title, index)
    const dayOffset = (channelId - 1) * 3 + Math.floor(index / 3)

    return {
      createdAt: buildFixtureCreatedAt(dayOffset, time),
      id: index + 1,
      text: testChannelPostTemplates[index % testChannelPostTemplates.length]
        .replace('#{n}', String(index + 1))
        .concat(` Канал: ${title}.`),
      threadComments,
      time,
    }
  })
}

export const initialSubscribedChannels: SubscriptionChannel[] = testChannelDefinitions.map((channel) => {
  const posts = buildTestChannelPosts(channel.id, channel.title)
  const seededBlacklist = channel.id === 1 || channel.id === 5 ? ['+79673215453'] : []
  const commentMode = channelCommentModes[channel.id] ?? 'off'

  return {
    ...channel,
    commentBlacklistIdentifiers: seededBlacklist,
    commentsEnabledForAll: commentMode === 'all',
    commentsEnabledForPremium: commentMode === 'premium',
    draft: channel.visibility !== 'public',
    isTestEntity: true,
    participants: buildChannelParticipants(),
    posts,
    preview: `Тестовый канал Tinychok: ${channel.title}. Внутри ${posts.length} сообщений для проверки чтения и скролла.`,
    time: posts[0]?.time ?? '',
  }
})

const initialGroupFixtures: GroupPreview[] = [
  {
    id: 1,
    title: 'Ночной круг',
    handle: '@night_circle',
    accent: '#8c5738',
    commentBlacklistIdentifiers: ['+79673215453'],
    commentsEnabledForAll: groupCommentModes[1] === 'all',
    commentsEnabledForPremium: groupCommentModes[1] === 'premium',
    preview: 'Группа для спокойных ночных обсуждений продукта и интерфейса.',
    time: '21:24',
    unread: 4,
    members: 8,
    participants: buildGroupParticipants([1, 3, 6, 14, 18, 5, 20, 4]),
    messages: [
      {
        id: 1,
        author: 'them',
        displayAuthor: 'Мира',
        groupParticipantId: 1,
        text: 'Соберём в этой группе спокойные обсуждения интерфейса и приватных сценариев.',
        threadComments: [
          buildThreadCommentFromChat(1, 2, 'Поддерживаю: основную ленту лучше оставить максимально чистой.', '20:55', 1),
          buildMyThreadComment(2, 'Да, детали лучше обсуждать прямо под нужным сообщением.', '20:58', 1),
        ],
        time: '20:48',
      },
      {
        id: 2,
        author: 'me',
        text: 'Да, и без лишнего шума. Только короткие сообщения и понятные решения.',
        time: '21:02',
      },
      {
        id: 3,
        author: 'them',
        displayAuthor: 'Лев',
        groupParticipantId: 3,
        text: 'Тогда здесь же проверим, как ведёт себя меню действий у сообщений в групповом потоке.',
        threadComments: [
          buildThreadCommentFromChat(1, 6, 'Я бы ещё сразу смотрела на unread и тихие нотификации комментариев.', '21:28', 0),
          buildMyThreadComment(2, 'И на то, как аккуратно выглядит счётчик комментариев под сообщением.', '21:31', 0),
        ],
        time: '21:24',
      },
    ],
  },
  {
    id: 2,
    title: 'Тихий релиз-комитет',
    handle: '@quiet_release_committee',
    accent: '#6eb6ff',
    commentsEnabledForAll: groupCommentModes[2] === 'all',
    commentsEnabledForPremium: groupCommentModes[2] === 'premium',
    preview: 'Смотрим свежие сборки, правим тексты и добираем мелкие баги.',
    time: '19:16',
    unread: 0,
    members: 5,
    participants: buildGroupParticipants([6, 2, 5, 16, 18]),
    messages: [
      {
        id: 1,
        author: 'them',
        displayAuthor: 'Полина',
        groupParticipantId: 6,
        text: 'В эту группу складываем короткие заметки по сборкам, текстам и мелким визуальным багам.',
        time: '18:40',
      },
      {
        id: 2,
        author: 'me',
        text: 'Хорошо. Ещё удобно обсуждать здесь статусы релизов и мелкие правки перед пушем.',
        time: '19:16',
      },
    ],
  },
  {
    id: 3,
    title: 'Сигнальная мастерская',
    handle: '@signal_workshop',
    accent: '#82c9a3',
    commentsEnabledForAll: groupCommentModes[3] === 'all',
    commentsEnabledForPremium: groupCommentModes[3] === 'premium',
    preview: 'Внутренняя группа по каналам, уведомлениям и сценариям чтения.',
    time: '17:42',
    unread: 2,
    members: 11,
    participants: buildGroupParticipants([2, 5, 6, 1, 3, 4, 14, 18, 20, 16, 17]),
    messages: [
      {
        id: 1,
        author: 'them',
        displayAuthor: 'Соня',
        groupParticipantId: 2,
        text: 'Нужно накидать несколько черновых сообщений, чтобы группа ощущалась живой, а не пустой.',
        threadComments: [
          buildThreadCommentFromChat(1, 18, 'Оставляю это как fixture для premium-only комментариев в группе.', '17:16', 4),
          buildThreadCommentFromChat(2, 3, 'Хорошо: читать могут все, писать могут только премиум-участники.', '17:21', 4),
        ],
        time: '17:11',
      },
      {
        id: 2,
        author: 'them',
        displayAuthor: 'Никита',
        groupParticipantId: 5,
        text: 'И сразу проверить, что копирование и пересылка из группы работают так же стабильно, как в обычном чате.',
        time: '17:42',
      },
    ],
  },
]

export const initialGroups: GroupPreview[] = initialGroupFixtures.map((group) => ({
  ...group,
  isTestEntity: true,
  messages: group.messages.map((message, messageIndex) => ({
    ...message,
    createdAt: buildFixtureCreatedAt((group.id - 1) * 2 + (group.messages.length - messageIndex - 1), message.time),
    threadComments: message.threadComments?.map((comment, commentIndex) => ({
      ...comment,
      createdAt:
        comment.createdAt ??
        buildFixtureCreatedAt((group.id - 1) * 2 + (group.messages.length - messageIndex - 1), comment.time),
      id: commentIndex + 1,
    })),
  })),
}))

export const initialChannels: Channel[] = [
  makeDraftChannel(1, 1),
  makeDraftChannel(2, 2),
  makeDraftChannel(3, 3),
]
