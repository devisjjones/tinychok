export type AnalyticsScalar = string | number | boolean | null

export type AnalyticsEventName =
  | 'analytics_consent_granted'
  | 'app_opened'
  | 'auth_captcha_completed'
  | 'auth_code_request_succeeded'
  | 'auth_code_request_failed'
  | 'auth_code_verify_succeeded'
  | 'auth_code_verify_failed'
  | 'auth_password_prompt_shown'
  | 'auth_password_login_requested'
  | 'auth_password_login_succeeded'
  | 'auth_password_login_failed'
  | 'auth_password_login_captcha_required'
  | 'auth_password_login_captcha_completed'
  | 'auth_password_login_rate_limited'
  | 'auth_password_login_blocked'
  | 'auth_password_forgot_started'
  | 'auth_password_reset_code_requested'
  | 'auth_password_reset_code_verified'
  | 'auth_password_set_succeeded'
  | 'auth_password_set_failed'
  | 'auth_password_reset_succeeded'
  | 'auth_password_reset_failed'
  | 'auth_password_change_requested'
  | 'auth_password_change_succeeded'
  | 'auth_password_change_failed'
  | 'account_deletion_requested'
  | 'account_deletion_succeeded'
  | 'account_deletion_failed'
  | 'auth_registration_succeeded'
  | 'auth_registration_failed'
  | 'auth_support_email_clicked'
  | 'support_ticket_created'
  | 'support_ticket_reply_sent'
  | 'support_ticket_resolved'
  | 'direct_message_send_succeeded'
  | 'direct_message_send_failed'
  | 'direct_message_deleted_me'
  | 'direct_message_deleted_everyone'
  | 'group_message_send_succeeded'
  | 'group_message_send_failed'
  | 'group_message_deleted'
  | 'channel_post_send_succeeded'
  | 'channel_post_send_failed'
  | 'channel_post_deleted'
  | 'thread_comment_send_succeeded'
  | 'thread_comment_send_failed'
  | 'thread_comment_deleted'
  | 'thread_inbox_opened'
  | 'thread_opened'
  | 'profile_settings_saved'
  | 'group_settings_saved'
  | 'channel_settings_saved'
  | 'theme_switched'
  | 'quiet_settings_opened'
  | 'quiet_settings_changed'
  | 'quiet_settings_locked_interaction'
  | 'quiet_mode_enabled'
  | 'quiet_mode_disabled'
  | 'forced_invisible_mode_enabled'
  | 'forced_invisible_mode_disabled'
  | 'storage_manager_opened'
  | 'storage_file_deleted'
  | 'gif_uploaded'
  | 'gif_deleted'
  | 'gif_search_used'
  | 'gif_added_from_viewer'
  | 'photo_attachment_selected'
  | 'photo_upload_failed'
  | 'video_attachment_selected'
  | 'video_upload_failed'
  | 'file_attachment_selected'
  | 'file_upload_failed'
  | 'video_note_record_started'
  | 'video_note_send_succeeded'
  | 'video_note_send_failed'
  | 'image_viewer_opened'
  | 'video_viewer_opened'
  | 'video_note_viewer_opened'
  | 'search_screen_opened'
  | 'contact_search_used'
  | 'contact_search_result_opened'
  | 'channel_search_used'
  | 'channel_search_result_opened'
  | 'search_empty_result_shown'
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
  | 'refund_processed'
  | 'group_created'
  | 'group_create_failed'
  | 'group_deleted'
  | 'channel_created'
  | 'channel_create_failed'
  | 'channel_deleted'
  | 'blacklist_add_confirmed'
  | 'legal_page_opened'
  | 'legal_pdf_opened'

export type AnalyticsEventProperties = Record<string, AnalyticsScalar>

export type AnalyticsEvent = {
  name: AnalyticsEventName
  occurredAt: string
  properties: AnalyticsEventProperties
  source: 'server' | 'web'
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
      | 'settings'
      | 'navigation'
      | 'consent'
      | 'media'
      | 'notifications'
      | 'support'
      | 'premium'
      | 'billing'
      | 'threads'
      | 'search'
      | 'storage'
      | 'legal'
    description: string
  }
> = {
  analytics_consent_granted: {
    category: 'consent',
    description: 'Пользователь явно разрешил аналитику через cookie banner.',
  },
  app_opened: {
    category: 'navigation',
    description: 'Пользователь открыл авторизованное приложение Tinychok на стартовой product-поверхности.',
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
  auth_password_prompt_shown: {
    category: 'auth',
    description: 'После ввода номера пользователю был показан шаг входа по паролю.',
  },
  auth_password_login_requested: {
    category: 'auth',
    description: 'Пользователь отправил попытку входа по паролю.',
  },
  auth_password_login_succeeded: {
    category: 'auth',
    description: 'Вход по паролю завершился успешно.',
  },
  auth_password_login_failed: {
    category: 'auth',
    description: 'Вход по паролю завершился ошибкой.',
  },
  auth_password_login_captcha_required: {
    category: 'auth',
    description: 'После серии неверных паролей вход по паролю потребовал SmartCaptcha.',
  },
  auth_password_login_captcha_completed: {
    category: 'auth',
    description: 'Пользователь прошёл SmartCaptcha на шаге входа по паролю.',
  },
  auth_password_login_rate_limited: {
    category: 'auth',
    description: 'Попытка входа по паролю упёрлась в новый rate limit из-за серии неверных паролей.',
  },
  auth_password_login_blocked: {
    category: 'auth',
    description: 'Попытка входа по паролю отклонена из-за уже активной временной блокировки.',
  },
  auth_password_forgot_started: {
    category: 'auth',
    description: 'Пользователь начал сценарий восстановления пароля.',
  },
  auth_password_reset_code_requested: {
    category: 'auth',
    description: 'Для восстановления пароля был успешно запрошен SMS-код.',
  },
  auth_password_reset_code_verified: {
    category: 'auth',
    description: 'SMS-код для восстановления пароля успешно подтверждён.',
  },
  auth_password_set_succeeded: {
    category: 'auth',
    description: 'Пароль для существующего аккаунта без пароля был успешно задан.',
  },
  auth_password_set_failed: {
    category: 'auth',
    description: 'Установка пароля для существующего аккаунта без пароля завершилась ошибкой.',
  },
  auth_password_reset_succeeded: {
    category: 'auth',
    description: 'Сброс пароля завершился успешно.',
  },
  auth_password_reset_failed: {
    category: 'auth',
    description: 'Сброс пароля завершился ошибкой.',
  },
  auth_password_change_requested: {
    category: 'auth',
    description: 'Пользователь начал смену пароля в настройках аккаунта.',
  },
  auth_password_change_succeeded: {
    category: 'auth',
    description: 'Смена пароля в настройках завершилась успешно.',
  },
  auth_password_change_failed: {
    category: 'auth',
    description: 'Смена пароля в настройках завершилась ошибкой.',
  },
  account_deletion_requested: {
    category: 'auth',
    description: 'Пользователь начал self-service удаление аккаунта из настроек.',
  },
  account_deletion_succeeded: {
    category: 'auth',
    description: 'Self-service удаление аккаунта завершилось успешно.',
  },
  account_deletion_failed: {
    category: 'auth',
    description: 'Self-service удаление аккаунта завершилось ошибкой.',
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
  support_ticket_created: {
    category: 'support',
    description: 'Пользователь создал новое обращение в поддержку внутри приложения.',
  },
  support_ticket_reply_sent: {
    category: 'support',
    description: 'Пользователь отправил ответ в уже существующий тикет поддержки.',
  },
  support_ticket_resolved: {
    category: 'support',
    description: 'Тикет поддержки перешёл в статус resolved.',
  },
  direct_message_send_succeeded: {
    category: 'messaging',
    description: 'Личное сообщение подтверждено backend-ом.',
  },
  direct_message_send_failed: {
    category: 'messaging',
    description: 'Личное сообщение не подтвердилось backend-ом.',
  },
  direct_message_deleted_me: {
    category: 'messaging',
    description: 'Пользователь удалил личное сообщение только у себя.',
  },
  direct_message_deleted_everyone: {
    category: 'messaging',
    description: 'Пользователь удалил своё личное сообщение у всех участников диалога.',
  },
  group_message_send_succeeded: {
    category: 'messaging',
    description: 'Сообщение в группе подтверждено backend-ом.',
  },
  group_message_send_failed: {
    category: 'messaging',
    description: 'Сообщение в группе не подтвердилось backend-ом.',
  },
  group_message_deleted: {
    category: 'messaging',
    description: 'Сообщение в группе было удалено.',
  },
  channel_post_send_succeeded: {
    category: 'messaging',
    description: 'Пост канала опубликован успешно.',
  },
  channel_post_send_failed: {
    category: 'messaging',
    description: 'Публикация поста в канал завершилась ошибкой.',
  },
  channel_post_deleted: {
    category: 'messaging',
    description: 'Пост канала был удалён владельцем или модерацией.',
  },
  thread_comment_send_succeeded: {
    category: 'messaging',
    description: 'Комментарий подтверждён backend-ом.',
  },
  thread_comment_send_failed: {
    category: 'messaging',
    description: 'Комментарий не подтвердился backend-ом.',
  },
  thread_comment_deleted: {
    category: 'messaging',
    description: 'Комментарий внутри треда был удалён.',
  },
  thread_inbox_opened: {
    category: 'threads',
    description: 'Пользователь открыл inbox тредов.',
  },
  thread_opened: {
    category: 'threads',
    description: 'Пользователь открыл конкретный тред.',
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
  theme_switched: {
    category: 'settings',
    description: 'Пользователь переключил светлую и тёмную тему.',
  },
  quiet_settings_opened: {
    category: 'settings',
    description: 'Пользователь открыл экран настроек режима «Тихо».',
  },
  quiet_settings_changed: {
    category: 'settings',
    description: 'Пользователь изменил один из переключателей внутри настроек режима «Тихо».',
  },
  quiet_settings_locked_interaction: {
    category: 'premium',
    description: 'Пользователь без премиума попытался изменить locked-настройку режима «Тихо».',
  },
  quiet_mode_enabled: {
    category: 'settings',
    description: 'Пользователь включил режим «Тихо».',
  },
  quiet_mode_disabled: {
    category: 'settings',
    description: 'Пользователь выключил режим «Тихо».',
  },
  forced_invisible_mode_enabled: {
    category: 'settings',
    description: 'Пользователь включил принудительный режим невидимки.',
  },
  forced_invisible_mode_disabled: {
    category: 'settings',
    description: 'Пользователь выключил принудительный режим невидимки.',
  },
  storage_manager_opened: {
    category: 'storage',
    description: 'Пользователь открыл менеджер хранилища.',
  },
  storage_file_deleted: {
    category: 'storage',
    description: 'Пользователь успешно удалил файл из хранилища.',
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
  video_attachment_selected: {
    category: 'media',
    description: 'Пользователь подготовил видеофайл как вложение.',
  },
  video_upload_failed: {
    category: 'media',
    description: 'Загрузка видеофайла завершилась ошибкой до отправки сообщения.',
  },
  file_attachment_selected: {
    category: 'media',
    description: 'Пользователь подготовил обычный файл как вложение.',
  },
  file_upload_failed: {
    category: 'media',
    description: 'Загрузка обычного файла завершилась ошибкой до отправки сообщения.',
  },
  video_note_record_started: {
    category: 'media',
    description: 'Пользователь начал запись видеосообщения-квадратика.',
  },
  video_note_send_succeeded: {
    category: 'messaging',
    description: 'Видеосообщение-квадратик было успешно отправлено.',
  },
  video_note_send_failed: {
    category: 'messaging',
    description: 'Отправка видеосообщения-квадратика завершилась ошибкой.',
  },
  image_viewer_opened: {
    category: 'media',
    description: 'Пользователь открыл fullscreen viewer для изображения или GIF.',
  },
  video_viewer_opened: {
    category: 'media',
    description: 'Пользователь открыл viewer для видео-вложения.',
  },
  video_note_viewer_opened: {
    category: 'media',
    description: 'Пользователь открыл viewer для видеосообщения-квадратика.',
  },
  search_screen_opened: {
    category: 'search',
    description: 'Пользователь открыл экран поиска.',
  },
  contact_search_used: {
    category: 'search',
    description: 'Пользователь воспользовался поиском контактов или пользователей.',
  },
  contact_search_result_opened: {
    category: 'search',
    description: 'Пользователь открыл контакт или личный диалог из результатов поиска.',
  },
  channel_search_used: {
    category: 'search',
    description: 'Пользователь воспользовался поиском каналов.',
  },
  channel_search_result_opened: {
    category: 'search',
    description: 'Пользователь открыл канал из результатов поиска.',
  },
  search_empty_result_shown: {
    category: 'search',
    description: 'Пользователю был показан пустой результат поиска.',
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
  refund_processed: {
    category: 'billing',
    description: 'Успешно оформлен возврат с server-side фиксацией refund-type.',
  },
  group_created: {
    category: 'messaging',
    description: 'Пользователь создал новую группу.',
  },
  group_create_failed: {
    category: 'messaging',
    description: 'Создание группы завершилось ошибкой.',
  },
  group_deleted: {
    category: 'messaging',
    description: 'Владелец удалил группу или перевёл её в owner-deleted режим.',
  },
  channel_created: {
    category: 'messaging',
    description: 'Пользователь создал новый канал.',
  },
  channel_create_failed: {
    category: 'messaging',
    description: 'Создание канала завершилось ошибкой.',
  },
  channel_deleted: {
    category: 'messaging',
    description: 'Владелец удалил канал или перевёл его в owner-deleted режим.',
  },
  blacklist_add_confirmed: {
    category: 'moderation',
    description: 'Пользователь подтверждённо добавлен в чёрный список комнаты.',
  },
  legal_page_opened: {
    category: 'legal',
    description: 'Пользователь открыл одну из публичных legal-страниц.',
  },
  legal_pdf_opened: {
    category: 'legal',
    description: 'Пользователь открыл или скачал PDF-версию legal-документа.',
  },
}
