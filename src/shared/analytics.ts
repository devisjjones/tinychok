export type AnalyticsScalar = string | number | boolean | null

export type AnalyticsEventName =
  | 'analytics_consent_granted'
  | 'auth_code_request_succeeded'
  | 'auth_code_request_failed'
  | 'auth_code_verify_succeeded'
  | 'auth_code_verify_failed'
  | 'auth_registration_succeeded'
  | 'auth_registration_failed'
  | 'direct_message_send_succeeded'
  | 'direct_message_send_failed'
  | 'direct_message_retry_started'
  | 'direct_message_retry_failed'
  | 'group_message_send_succeeded'
  | 'group_message_send_failed'
  | 'group_message_retry_started'
  | 'group_message_retry_failed'
  | 'channel_post_send_succeeded'
  | 'channel_post_send_failed'
  | 'thread_comment_send_succeeded'
  | 'thread_comment_send_failed'
  | 'realtime_connected'
  | 'realtime_disconnected'
  | 'realtime_error'
  | 'group_settings_saved'
  | 'blacklist_add_confirmed'

export type AnalyticsEventProperties = Record<string, AnalyticsScalar>

export type AnalyticsEvent = {
  name: AnalyticsEventName
  occurredAt: string
  properties: AnalyticsEventProperties
  source: 'web'
}

export type AnalyticsBatchBody = {
  events: AnalyticsEvent[]
}

export const analyticsEventCatalog: Record<
  AnalyticsEventName,
  {
    category: 'auth' | 'messaging' | 'moderation' | 'realtime' | 'settings' | 'consent'
    description: string
  }
> = {
  analytics_consent_granted: {
    category: 'consent',
    description: 'Пользователь явно разрешил аналитику через cookie banner.',
  },
  auth_code_request_succeeded: {
    category: 'auth',
    description: 'Код подтверждения успешно запрошен.',
  },
  auth_code_request_failed: {
    category: 'auth',
    description: 'Запрос кода подтверждения завершился ошибкой.',
  },
  auth_code_verify_succeeded: {
    category: 'auth',
    description: 'Код подтверждения успешно принят сервером.',
  },
  auth_code_verify_failed: {
    category: 'auth',
    description: 'Проверка кода подтверждения завершилась ошибкой.',
  },
  auth_registration_succeeded: {
    category: 'auth',
    description: 'Регистрация нового пользователя завершилась успешно.',
  },
  auth_registration_failed: {
    category: 'auth',
    description: 'Регистрация нового пользователя завершилась ошибкой.',
  },
  direct_message_send_succeeded: {
    category: 'messaging',
    description: 'Личное сообщение подтверждено backend-ом.',
  },
  direct_message_send_failed: {
    category: 'messaging',
    description: 'Личное сообщение не подтвердилось backend-ом.',
  },
  direct_message_retry_started: {
    category: 'messaging',
    description: 'Запущена повторная отправка личного сообщения из outbox.',
  },
  direct_message_retry_failed: {
    category: 'messaging',
    description: 'Повторная отправка личного сообщения завершилась ошибкой.',
  },
  group_message_send_succeeded: {
    category: 'messaging',
    description: 'Сообщение в группе подтверждено backend-ом.',
  },
  group_message_send_failed: {
    category: 'messaging',
    description: 'Сообщение в группе не подтвердилось backend-ом.',
  },
  group_message_retry_started: {
    category: 'messaging',
    description: 'Запущена повторная отправка сообщения в группе из outbox.',
  },
  group_message_retry_failed: {
    category: 'messaging',
    description: 'Повторная отправка сообщения в группе завершилась ошибкой.',
  },
  channel_post_send_succeeded: {
    category: 'messaging',
    description: 'Пост канала опубликован успешно.',
  },
  channel_post_send_failed: {
    category: 'messaging',
    description: 'Публикация поста в канал завершилась ошибкой.',
  },
  thread_comment_send_succeeded: {
    category: 'messaging',
    description: 'Комментарий в треде подтверждён backend-ом.',
  },
  thread_comment_send_failed: {
    category: 'messaging',
    description: 'Комментарий в треде не подтвердился backend-ом.',
  },
  realtime_connected: {
    category: 'realtime',
    description: 'WebSocket realtime-соединение установлено.',
  },
  realtime_disconnected: {
    category: 'realtime',
    description: 'WebSocket realtime-соединение закрыто.',
  },
  realtime_error: {
    category: 'realtime',
    description: 'WebSocket realtime-соединение дало ошибку.',
  },
  group_settings_saved: {
    category: 'settings',
    description: 'Настройки группы были сохранены пользователем.',
  },
  blacklist_add_confirmed: {
    category: 'moderation',
    description: 'Пользователь подтверждённо добавлен в чёрный список комнаты.',
  },
}
