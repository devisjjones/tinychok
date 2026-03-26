export type AnalyticsScalar = string | number | boolean | null

export type AnalyticsEventName =
  | 'analytics_consent_granted'
  | 'auth_captcha_completed'
  | 'auth_code_request_succeeded'
  | 'auth_code_request_failed'
  | 'auth_code_verify_succeeded'
  | 'auth_code_verify_failed'
  | 'auth_registration_succeeded'
  | 'auth_registration_failed'
  | 'auth_support_email_clicked'
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
  | 'profile_settings_saved'
  | 'group_settings_saved'
  | 'channel_settings_saved'
  | 'gif_uploaded'
  | 'gif_deleted'
  | 'gif_search_used'
  | 'gif_added_from_viewer'
  | 'photo_attachment_selected'
  | 'photo_upload_failed'
  | 'image_viewer_opened'
  | 'browser_notifications_enabled'
  | 'browser_notifications_disabled'
  | 'browser_notifications_prompt_dismissed'
  | 'premium_screen_opened'
  | 'premium_purchase_started'
  | 'premium_purchase_started_month'
  | 'premium_purchase_started_year'
  | 'premium_purchase_succeeded'
  | 'premium_purchase_succeeded_month'
  | 'premium_purchase_succeeded_year'
  | 'premium_purchase_failed'
  | 'premium_purchase_failed_month'
  | 'premium_purchase_failed_year'
  | 'group_created'
  | 'channel_created'
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
    category:
      | 'auth'
      | 'messaging'
      | 'moderation'
      | 'realtime'
      | 'settings'
      | 'consent'
  | 'media'
  | 'notifications'
  | 'support'
  | 'premium'
    description: string
  }
> = {
  analytics_consent_granted: {
    category: 'consent',
    description: 'Пользователь явно разрешил аналитику через cookie banner.',
  },
  auth_captcha_completed: {
    category: 'auth',
    description: 'Пользователь успешно прошёл captcha перед запросом кода.',
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
  auth_support_email_clicked: {
    category: 'support',
    description: 'Пользователь нажал на email поддержки на auth-экране.',
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
  profile_settings_saved: {
    category: 'settings',
    description: 'Пользователь успешно сохранил настройки профиля.',
  },
  group_settings_saved: {
    category: 'settings',
    description: 'Настройки группы были сохранены пользователем.',
  },
  channel_settings_saved: {
    category: 'settings',
    description: 'Настройки канала были сохранены пользователем.',
  },
  gif_uploaded: {
    category: 'media',
    description: 'GIF успешно загружена в личную библиотеку.',
  },
  gif_deleted: {
    category: 'media',
    description: 'GIF удалена из личной библиотеки.',
  },
  gif_search_used: {
    category: 'media',
    description: 'Пользователь воспользовался поиском по GIF-библиотеке Tinychok.',
  },
  gif_added_from_viewer: {
    category: 'media',
    description: 'Пользователь добавил GIF себе из fullscreen viewer.',
  },
  photo_attachment_selected: {
    category: 'media',
    description: 'Пользователь выбрал фотографию для вложения в composer.',
  },
  photo_upload_failed: {
    category: 'media',
    description: 'Загрузка фотографии завершилась ошибкой до отправки сообщения.',
  },
  image_viewer_opened: {
    category: 'media',
    description: 'Пользователь открыл fullscreen viewer для изображения или GIF.',
  },
  browser_notifications_enabled: {
    category: 'notifications',
    description: 'Браузерные уведомления включены для текущего браузера.',
  },
  browser_notifications_disabled: {
    category: 'notifications',
    description: 'Браузерные уведомления выключены для текущего браузера.',
  },
  browser_notifications_prompt_dismissed: {
    category: 'notifications',
    description: 'Пользователь скрыл promo-card включения браузерных уведомлений.',
  },
  premium_screen_opened: {
    category: 'premium',
    description: 'Пользователь открыл экран премиума.',
  },
  premium_purchase_started: {
    category: 'premium',
    description: 'Пользователь начал покупку премиума.',
  },
  premium_purchase_started_month: {
    category: 'premium',
    description: 'Пользователь начал покупку месячного премиума.',
  },
  premium_purchase_started_year: {
    category: 'premium',
    description: 'Пользователь начал покупку годового премиума.',
  },
  premium_purchase_succeeded: {
    category: 'premium',
    description: 'Покупка или debug-активация премиума завершилась успешно.',
  },
  premium_purchase_succeeded_month: {
    category: 'premium',
    description: 'Месячный премиум был успешно активирован.',
  },
  premium_purchase_succeeded_year: {
    category: 'premium',
    description: 'Годовой премиум был успешно активирован.',
  },
  premium_purchase_failed: {
    category: 'premium',
    description: 'Покупка премиума завершилась ошибкой.',
  },
  premium_purchase_failed_month: {
    category: 'premium',
    description: 'Попытка покупки месячного премиума завершилась ошибкой.',
  },
  premium_purchase_failed_year: {
    category: 'premium',
    description: 'Попытка покупки годового премиума завершилась ошибкой.',
  },
  group_created: {
    category: 'messaging',
    description: 'Пользователь создал новую группу.',
  },
  channel_created: {
    category: 'messaging',
    description: 'Пользователь создал новый канал.',
  },
  blacklist_add_confirmed: {
    category: 'moderation',
    description: 'Пользователь подтверждённо добавлен в чёрный список комнаты.',
  },
}
