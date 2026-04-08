export const displayNameFieldMaxLength = 24
export const surnameFieldMaxLength = 32
export const nicknameFieldMaxLength = 21
export const statusFieldMaxLength = 80
export const passwordFieldMinLength = 8
export const accountNameMaxFontSize = 30.4
export const accountNameMinFontSize = 20
export const accountStatusMaxFontSize = 15
export const accountStatusMinFontSize = 10.5
export const defaultGroupMemberLimit = 10
export const premiumGroupMemberLimit = 200
export const defaultGroupsPerUserLimit = 5
export const premiumGroupsPerUserLimit = 20
export const groupTitleMaxLength = 48
export const composerAttachmentRenameMaxLength = 50
export const channelTitleMaxLength = 30
export const channelDirectLinkMaxLength = 30
export const channelDescriptionMaxLength = 500
export const managedChannelsPerUserLimit = 5
export const channelActionMenuWidth = 280
export const channelActionMenuHeight = 132
export const channelBlockedMenuHeight = 146
export const groupActionMenuWidth = 280
export const groupActionMenuHeight = 276
export const avatarSourceMaxSizeBytes = 5 * 1024 * 1024
export const avatarAcceptedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const avatarOutputSizePx = 512
export const avatarPreviewSizePx = 128
export const channelAvatarUploadMaxSizeBytes = avatarSourceMaxSizeBytes
export const channelAvatarUploadAcceptedMimeTypes = avatarAcceptedMimeTypes
export const messagePhotoUploadMaxSizeBytes = 10 * 1024 * 1024
export const messageFileUploadMaxSizeBytes = 10 * 1024 * 1024
export const premiumMessageFileUploadMaxSizeBytes = 200 * 1024 * 1024
export const messageGifUploadMaxSizeBytes = 5 * 1024 * 1024
export const messagePhotoAcceptedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const messageFileAcceptedMimeTypes = [
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-zip-compressed',
  'application/zip',
  'text/plain',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
] as const
export const messageFileAcceptedExtensions = [
  '.doc',
  '.docx',
  '.m4v',
  '.mov',
  '.mp4',
  '.pdf',
  '.txt',
  '.webm',
  '.xls',
  '.xlsx',
  '.zip',
] as const
export const messagePhotoMaxDimensionPx = 1600
export const messagePhotoCompressionTargetBytes = 1_600_000
export const freeStorageQuotaBytes = 100 * 1024 * 1024
export const premiumStorageQuotaBytes = 1000 * 1024 * 1024
export const freeArchiveStorageQuotaBytes = 200 * 1024 * 1024
export const premiumArchiveStorageQuotaBytes = 500 * 1024 * 1024
export const channelStorageQuotaBytes = 500 * 1024 * 1024
export const channelArchiveStorageQuotaBytes = 200 * 1024 * 1024
export const orphanUploadTtlMs = 24 * 60 * 60 * 1000
export const chatActionMenuWidth = 320
export const chatActionMenuHeight = 290
export const quickFilters = ['Все', '★']
export const channelAvatarTones = ['#8c5738', '#6eb6ff', '#ff8a5b', '#82c9a3', '#f29f67', '#d18fff']
export const accountsStorageKey = 'tinychok.accounts'
export const sessionStorageKey = 'tinychok.session'
export const cookieConsentStorageKey = 'tinychok.cookie-consent'
export const browserNotificationsBannerDismissedStorageKey =
  'tinychok.browser-notifications.banner-dismissed.v2'
export const browserNotificationsEnabledStorageKey = 'tinychok.browser-notifications.enabled'
export const analyticsDebugStorageKey = 'tinychok.analytics.debug'
export const premiumDebugAutoCheckoutStorageKey = 'tinychok.debug.premium-auto-checkout'
export const messagePhotoSendOriginalPreferenceStorageKey = 'tinychok.session.photo-send-original'
